import { createHmac, randomUUID } from 'node:crypto';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import { currentRequest, operationSignal, runtimeMetric } from './request-scope.js';
import { aiRequestLimit, controlKeys } from '@portfolio-api-cloud/contracts/quotas';

export interface Counter {
  readonly version: string;
  readonly used: number;
  readonly expiresAt: number;
  readonly blocked: boolean;
}
export interface AiReservation {
  readonly keys: readonly [string, string, string];
  readonly cost: number;
  readonly budget: number;
  readonly expiresAt: number;
}
export interface ControlStore {
  get(key: string): Promise<Counter | null>;
  replace(key: string, previous: Counter | null, next: Counter): Promise<boolean>;
  reserveAi(reservation: AiReservation): Promise<boolean>;
}

/** Solo el SDK oficial realiza IO; no crea tablas ni inspecciona TTL en runtime. */
export class DynamoControlStore implements ControlStore {
  constructor(
    private readonly client: Pick<DynamoDBClient, 'send'>,
    private readonly table: string,
  ) {}
  async get(key: string): Promise<Counter | null> {
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.table,
        Key: { pk: { S: key } },
        ConsistentRead: true,
      }),
      { abortSignal: operationSignal(1500) },
    );
    const item = result.Item;
    if (!item) return null;
    const used = Number(item.used?.N);
    const expiresAt = Number(item.expiresAt?.N);
    const version = item.version?.S;
    if (!Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(expiresAt) || !version)
      throw new Error('Invalid control record');
    return { used, expiresAt, version, blocked: item.blocked?.BOOL === true };
  }
  async replace(key: string, previous: Counter | null, next: Counter): Promise<boolean> {
    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.table,
          Item: {
            pk: { S: key },
            version: { S: next.version },
            used: { N: String(next.used) },
            expiresAt: { N: String(next.expiresAt) },
            blocked: { BOOL: next.blocked },
            ttl: { N: String(Math.ceil(next.expiresAt / 1000)) },
          },
          ConditionExpression: previous ? '#version = :previous' : 'attribute_not_exists(pk)',
          ...(previous
            ? {
                ExpressionAttributeNames: { '#version': 'version' },
                ExpressionAttributeValues: { ':previous': { S: previous.version } },
              }
            : {}),
        }),
        { abortSignal: operationSignal(1500) },
      );
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') return false;
      throw error;
    }
  }
  async reserveAi(reservation: AiReservation): Promise<boolean> {
    try {
      await this.client.send(
        new TransactWriteItemsCommand({
          ClientRequestToken: randomUUID(),
          TransactItems: reservation.keys.map((key, index) => {
            const amount = index === 2 ? reservation.cost : 1;
            const limit = index === 2 ? reservation.budget : aiRequestLimit;
            return {
              Update: {
                TableName: this.table,
                Key: { pk: { S: key } },
                UpdateExpression:
                  'SET #used = if_not_exists(#used, :zero) + :amount, expiresAt = :expires, #version = :version, #ttl = :ttl',
                ConditionExpression: 'attribute_not_exists(#used) OR #used <= :available',
                ExpressionAttributeNames: { '#used': 'used', '#version': 'version', '#ttl': 'ttl' },
                ExpressionAttributeValues: {
                  ':zero': { N: '0' },
                  ':amount': { N: String(amount) },
                  ':available': { N: String(limit - amount) },
                  ':expires': { N: String(reservation.expiresAt) },
                  ':ttl': { N: String(Math.ceil(reservation.expiresAt / 1000)) },
                  ':version': { S: randomUUID() },
                },
              },
            };
          }),
        }),
        { abortSignal: operationSignal(1500) },
      );
      return true;
    } catch (error) {
      // Incluye conflictos, timeouts y estados ambiguos: no se envía la llamada paga.
      if (error instanceof Error && error.name === 'TransactionCanceledException') return false;
      throw error;
    }
  }
}

export function derivedKey(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}
export function createSharedQuota(store: ControlStore, secret: string) {
  return (limit: number, prefix: string, durationSeconds = 3600) =>
    async (ip: string): Promise<{ blocked: boolean; headers: Record<string, string> }> => {
      const key = `${controlKeys.quota}:${prefix}:${derivedKey(secret, ip)}`;
      for (let attempt = 0; attempt < 32; attempt++) {
        currentRequest()?.signal.throwIfAborted();
        const previous = await store.get(key);
        const now = Date.now();
        const active = previous && previous.expiresAt > now ? previous : null;
        if (active?.blocked)
          return {
            blocked: true,
            headers: { 'retry-after': String(Math.ceil((active.expiresAt - now) / 1000)) },
          };
        const used = (active?.used ?? 0) + 1;
        const blocked = used > limit;
        const expiresAt = blocked || !active ? now + durationSeconds * 1000 : active.expiresAt;
        const next = { used, blocked, expiresAt, version: randomUUID() };
        if (!(await store.replace(key, previous, next))) continue;
        runtimeMetric('quota', blocked ? 'blocked' : 'allowed');
        return blocked
          ? { blocked, headers: { 'retry-after': String(durationSeconds) } }
          : {
              blocked,
              headers: {
                'x-ratelimit-limit': String(limit),
                'x-ratelimit-remaining': String(limit - used),
                'x-ratelimit-reset': String(Math.ceil((expiresAt - now) / 1000)),
              },
            };
      }
      throw new Error('Quota contention');
    };
}

export interface AiAdmission {
  available(sessionId?: string | null): Promise<boolean>;
  reserve(inputTokens: number, outputTokens: number, sessionId?: string | null): Promise<boolean>;
}

/** Día civil argentino; la clave monetaria NO contiene IP ni sesión. */
export function aiDay(now: number) {
  const day = Math.floor((now - 3 * 3600_000) / 86400_000);
  return { day, expiresAt: (day + 1) * 86400_000 + 3 * 3600_000 };
}
export function createAiAdmission(
  store: ControlStore,
  secret: string,
  budgetNanoUsd: number,
): AiAdmission {
  const keys = (sessionId?: string | null): AiReservation['keys'] => {
    const ip = currentRequest()?.clientIp;
    if (!ip) throw new Error('Missing trusted client identity');
    const { day } = aiDay(Date.now());
    const visitor = derivedKey(secret, `${day}:${ip}`);
    return [
      `${controlKeys.aiSession}:${day}:${derivedKey(secret, `${visitor}:${sessionId ?? ''}`)}`,
      `${controlKeys.aiVisitor}:${day}:${visitor}`,
      `${controlKeys.aiBudget}:${day}`,
    ];
  };
  return {
    async available(sessionId) {
      if (!Number.isSafeInteger(budgetNanoUsd) || budgetNanoUsd <= 0) return false;
      try {
        const records = await Promise.all(keys(sessionId).map((key) => store.get(key)));
        return records.every(
          (record, index) =>
            !record || record.used < (index === 2 ? budgetNanoUsd : aiRequestLimit),
        );
      } catch {
        return false;
      }
    },
    async reserve(inputTokens, outputTokens, sessionId) {
      // Luna Standard: entrada con margen de escritura de caché; salida incluye razonamiento.
      const cost = inputTokens * 125 + outputTokens * 500;
      if (
        ![inputTokens, outputTokens, cost, budgetNanoUsd].every(Number.isSafeInteger) ||
        inputTokens < 0 ||
        outputTokens < 0 ||
        cost > budgetNanoUsd ||
        budgetNanoUsd <= 0
      )
        return false;
      try {
        const allowed = await store.reserveAi({
          keys: keys(sessionId),
          cost,
          budget: budgetNanoUsd,
          expiresAt: aiDay(Date.now()).expiresAt,
        });
        runtimeMetric('ai_admission', allowed ? 'reserved' : 'limited');
        return allowed;
      } catch {
        runtimeMetric('ai_admission', 'unavailable');
        return false;
      }
    },
  };
}
