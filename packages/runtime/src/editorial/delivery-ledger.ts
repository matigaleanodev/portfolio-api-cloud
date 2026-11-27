import { createHash, createHmac, randomUUID } from 'node:crypto';
import { GetItemCommand, PutItemCommand, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { deliveryKeyPrefix } from '@portfolio-api-cloud/contracts/editorial';
import { normalizeSubscriberEmail } from '../subscriptions/store.js';

/** El proveedor recuerda una Idempotency-Key 24 h; se deja una hora de margen. */
export const reconciliationWindowMs = 23 * 3600_000;
/** Supera el timeout de notify-post: una reserva vigente pertenece a una ejecución viva. */
const leaseMs = 60_000;

const statuses = ['sending', 'sent', 'rejected', 'uncertain', 'review'] as const;
export type DeliveryStatus = (typeof statuses)[number];

/** Estado de un envío (post, destinatario). No guarda direcciones. */
export interface DeliveryRecord {
  readonly pk: string;
  readonly version: string;
  readonly status: DeliveryStatus;
  /** Algún intento de la generación vigente pudo haber sido aceptado. */
  readonly uncertain: boolean;
  /** Cambia solo después de un rechazo definitivo; define la Idempotency-Key. */
  readonly generation: number;
  readonly firstAttemptAt: number;
  readonly leaseUntil: number;
  readonly updatedAt: number;
  readonly post: string;
  readonly providerId?: string;
  readonly code?: string;
}

export interface DeliveryStore {
  get(pk: string): Promise<DeliveryRecord | null>;
  /** Escritura condicional: `false` si la versión guardada ya no es `previousVersion`. */
  put(record: DeliveryRecord, previousVersion: string | null): Promise<boolean>;
}

export type DeliveryOutcome =
  | { readonly kind: 'accepted'; readonly providerId: string }
  | { readonly kind: 'rejected' | 'uncertain' | 'review'; readonly code: string };

/** `reference` es la clave del registro: identifica el envío en logs sin exponer la dirección. */
export type DeliveryClaim = { readonly reference: string } & (
  | { readonly kind: 'sent' | 'busy' | 'review' }
  | {
      readonly kind: 'send';
      readonly idempotencyKey: string;
      /** Guarda el resultado; si falla, la reserva vence y se reconcilia con la misma clave. */
      readonly settle: (outcome: DeliveryOutcome) => Promise<DeliveryStatus>;
    }
);

export interface DeliveryLedger {
  /** Estado que ya no admite envíos, sin reservar; `null` si todavía puede requerirlo. */
  settled(
    postUrl: string,
    email: string,
  ): Promise<{ readonly kind: 'sent' | 'review'; readonly reference: string } | null>;
  claim(postUrl: string, email: string): Promise<DeliveryClaim>;
}

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export function createDeliveryLedger(
  store: DeliveryStore,
  secret: string,
  now: () => number = Date.now,
): DeliveryLedger {
  const identify = (postUrl: string, email: string) => {
    const { host, pathname } = new URL(postUrl);
    const post = pathname.replace(/\/+$/, '') || '/';
    const recipient = createHmac('sha256', secret)
      .update(normalizeSubscriberEmail(email))
      .digest('hex');
    const pk = `${deliveryKeyPrefix}${digest(`${host}${post}`).slice(0, 32)}#${recipient}`;
    return { pk, post };
  };
  return {
    async settled(postUrl, email) {
      const { pk } = identify(postUrl, email);
      const status = (await store.get(pk))?.status;
      return status === 'sent' || status === 'review' ? { kind: status, reference: pk } : null;
    },
    async claim(postUrl, email) {
      const { pk, post } = identify(postUrl, email);
      const previous = await store.get(pk);
      const at = now();
      if (previous?.status === 'sent' || previous?.status === 'review')
        return { kind: previous.status, reference: pk };
      if (previous?.status === 'sending' && previous.leaseUntil > at)
        return { kind: 'busy', reference: pk };

      const fresh = !previous || previous.status === 'rejected';
      if (!fresh && at - previous.firstAttemptAt >= reconciliationWindowMs) {
        const expired: DeliveryRecord = {
          ...previous,
          version: randomUUID(),
          status: 'review',
          uncertain: true,
          leaseUntil: 0,
          updatedAt: at,
        };
        const stored = await store.put(expired, previous.version);
        return { kind: stored ? 'review' : 'busy', reference: pk };
      }

      const claimed: DeliveryRecord = {
        pk,
        post,
        version: randomUUID(),
        status: 'sending',
        uncertain: !fresh,
        generation: fresh ? (previous?.generation ?? 0) + 1 : previous.generation,
        firstAttemptAt: fresh ? at : previous.firstAttemptAt,
        leaseUntil: at + leaseMs,
        updatedAt: at,
      };
      if (!(await store.put(claimed, previous?.version ?? null)))
        return { kind: 'busy', reference: pk };

      return {
        kind: 'send',
        reference: pk,
        idempotencyKey: `notify/${digest(pk)}/${claimed.generation}`,
        async settle(outcome) {
          // Un rechazo posterior no demuestra que un intento ambiguo anterior no se aceptara.
          const status =
            outcome.kind === 'accepted'
              ? 'sent'
              : outcome.kind === 'rejected' && claimed.uncertain
                ? 'uncertain'
                : outcome.kind;
          const settled: DeliveryRecord = {
            ...claimed,
            version: randomUUID(),
            status,
            uncertain: status === 'uncertain' || status === 'review',
            leaseUntil: 0,
            updatedAt: now(),
            ...(outcome.kind === 'accepted'
              ? { providerId: outcome.providerId }
              : { code: outcome.code }),
          };
          if (!(await store.put(settled, claimed.version)))
            throw new Error('Delivery record changed');
          return status;
        },
      };
    },
  };
}

export interface DeliveryTableClient {
  send(command: GetItemCommand | PutItemCommand): Promise<unknown>;
}

const numbers = ['generation', 'firstAttemptAt', 'leaseUntil', 'updatedAt'] as const;

function toItem(record: DeliveryRecord): Record<string, AttributeValue> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]): [string, AttributeValue] => [
      key,
      typeof value === 'number'
        ? { N: String(value) }
        : typeof value === 'boolean'
          ? { BOOL: value }
          : { S: String(value) },
    ]),
  );
}

/** Un item ilegible falla: tratarlo como inexistente podría duplicar un envío. */
function fromItem(item: Record<string, AttributeValue>): DeliveryRecord {
  const { pk, version, status, uncertain, post, providerId, code } = item;
  if (
    !pk?.S ||
    !version?.S ||
    !post?.S ||
    !statuses.includes(status?.S as DeliveryStatus) ||
    typeof uncertain?.BOOL !== 'boolean' ||
    numbers.some((key) => !Number.isFinite(Number(item[key]?.N ?? Number.NaN)))
  )
    throw new Error('Invalid delivery record');
  return {
    pk: pk.S,
    version: version.S,
    status: status!.S as DeliveryStatus,
    uncertain: uncertain.BOOL,
    post: post.S,
    generation: Number(item.generation!.N),
    firstAttemptAt: Number(item.firstAttemptAt!.N),
    leaseUntil: Number(item.leaseUntil!.N),
    updatedAt: Number(item.updatedAt!.N),
    ...(providerId?.S ? { providerId: providerId.S } : {}),
    ...(code?.S ? { code: code.S } : {}),
  };
}

/** Registro en la tabla de control, sin TTL: la marca de enviado no vence. */
export function createDynamoDeliveryStore(
  client: DeliveryTableClient,
  tableName: string,
): DeliveryStore {
  return {
    async get(pk) {
      const { Item } = (await client.send(
        new GetItemCommand({ TableName: tableName, Key: { pk: { S: pk } }, ConsistentRead: true }),
      )) as { Item?: Record<string, AttributeValue> };
      return Item ? fromItem(Item) : null;
    },
    async put(record, previousVersion) {
      try {
        await client.send(
          new PutItemCommand({
            TableName: tableName,
            Item: toItem(record),
            ...(previousVersion === null
              ? { ConditionExpression: 'attribute_not_exists(pk)' }
              : {
                  ConditionExpression: '#version = :previous',
                  ExpressionAttributeNames: { '#version': 'version' },
                  ExpressionAttributeValues: { ':previous': { S: previousVersion } },
                }),
          }),
        );
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === 'ConditionalCheckFailedException')
          return false;
        throw error;
      }
    },
  };
}
