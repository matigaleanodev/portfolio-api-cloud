import { randomBytes } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { r2Region, storageKeys } from '@portfolio-api-cloud/contracts/storage';

/** Configuración R2 explícita: el store no lee el ambiente. */
export interface R2ClientConfig {
  readonly endpoint: string;
  readonly region?: string | undefined;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

export interface SubscriberStoreConfig extends R2ClientConfig {
  readonly bucket: string;
}

/** Subconjunto del cliente S3 que se usa; permite dobles en el límite. */
export interface ObjectStorageClient {
  send(command: object, options?: { abortSignal?: AbortSignal }): Promise<unknown>;
}

export interface StoredSubscriber {
  readonly email: string;
  readonly createdAt: string;
  readonly unsubscribeId?: string;
}

export type SubscriberCreateResult = 'created' | 'exists';
export type SubscriberDeleteResult = 'deleted' | 'missing';

export interface SubscriberStore {
  subscriberExists(email: string, signal?: AbortSignal): Promise<boolean>;
  createSubscriber(email: string, signal?: AbortSignal): Promise<SubscriberCreateResult>;
  deleteSubscriber(email: string, signal?: AbortSignal): Promise<SubscriberDeleteResult>;
  listSubscriberEmails(signal?: AbortSignal): Promise<string[]>;
  /** Identificador opaco de baja; lo crea la primera vez y devuelve `null` sin suscripción. */
  ensureUnsubscribeId(email: string, signal?: AbortSignal): Promise<string | null>;
  unsubscribeByToken(token: string, signal?: AbortSignal): Promise<SubscriberDeleteResult>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { subscribersPrefix, subscriberSuffix, unsubscribeIndexPrefix } = storageKeys;
/** 32 bytes aleatorios en base64url. */
export const unsubscribeTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const buildIndexKey = (token: string) => `${unsubscribeIndexPrefix}${token}${subscriberSuffix}`;

export function normalizeSubscriberEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidSubscriberEmail(email: string): boolean {
  return emailPattern.test(email);
}

export function buildSubscriberKey(email: string): string {
  return `${subscribersPrefix}${normalizeSubscriberEmail(email)}${subscriberSuffix}`;
}

/** Los suscriptores nunca se guardan en el bucket público de media. */
export function assertPrivateSubscribersBucket(subscribersBucket: string, publicBucket: string) {
  if (subscribersBucket === publicBucket)
    throw new Error('Subscribers bucket must differ from the public R2_BUCKET');
}

function parseSubscriberEmailFromKey(key: string): string | null {
  if (!key.startsWith(subscribersPrefix) || !key.endsWith(subscriberSuffix)) return null;
  const email = key.slice(subscribersPrefix.length, key.length - subscriberSuffix.length);
  return email || null;
}

export function isObjectNotFoundError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'NotFound' || error.name === 'NoSuchKey');
}

/** Intentos y espera por intento de cada operación R2. */
export const r2MaxAttempts = 2;
export const r2RequestTimeoutMs = 5_000;

export function createR2Client(config: R2ClientConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || r2Region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    // El SDK no limita la espera por defecto: una llamada colgada agotaría la función.
    // `requestTimeout` cubre hasta las cabeceras y `socketTimeout` la inactividad posterior;
    // ambos rigen por intento.
    maxAttempts: r2MaxAttempts,
    requestHandler: {
      connectionTimeout: 2_000,
      requestTimeout: r2RequestTimeoutMs,
      socketTimeout: r2RequestTimeoutMs,
      throwOnRequestTimeout: true,
    },
  });
}

/** Cliente creado en la primera operación, no al componer. */
export function lazyClient(factory: () => ObjectStorageClient): () => ObjectStorageClient {
  let instance: ObjectStorageClient | undefined;
  return () => (instance ??= factory());
}

const requestOptions = (signal?: AbortSignal) => (signal ? { abortSignal: signal } : undefined);

/** Store de suscriptores en R2 privado con las claves `subscribers/<email>.json` heredadas. */
export function createSubscriberStore(
  config: SubscriberStoreConfig,
  client?: ObjectStorageClient,
): SubscriberStore {
  const s3 = lazyClient(() => client ?? createR2Client(config));

  const object = (key: string) => ({ Bucket: config.bucket, Key: key });

  /** Metadatos del objeto, o `null` si no existe. */
  const head = async (key: string, signal?: AbortSignal) => {
    try {
      const response = (await s3().send(
        new HeadObjectCommand(object(key)),
        requestOptions(signal),
      )) as { Metadata?: Record<string, string> };
      return response.Metadata ?? {};
    } catch (error) {
      if (isObjectNotFoundError(error)) return null;
      throw error;
    }
  };

  const read = async (key: string, signal?: AbortSignal) => {
    try {
      const response = (await s3().send(
        new GetObjectCommand(object(key)),
        requestOptions(signal),
      )) as { Body: { transformToString(): Promise<string> }; ETag?: string };
      const value = JSON.parse(await response.Body.transformToString()) as StoredSubscriber;
      return { value, etag: response.ETag };
    } catch (error) {
      if (isObjectNotFoundError(error)) return null;
      throw error;
    }
  };

  const remove = (key: string, signal?: AbortSignal) =>
    s3().send(new DeleteObjectCommand(object(key)), requestOptions(signal));

  /** Un índice huérfano no permite dar de baja a nadie: su limpieza no cambia el resultado. */
  const discardIndex = async (token: string, signal?: AbortSignal) => {
    try {
      await remove(buildIndexKey(token), signal);
    } catch {
      // Se ignora a propósito.
    }
  };

  const subscriberExists = async (email: string, signal?: AbortSignal) =>
    (await head(buildSubscriberKey(email), signal)) !== null;

  return {
    subscriberExists,
    async createSubscriber(email, signal) {
      const normalizedEmail = normalizeSubscriberEmail(email);
      if (await subscriberExists(normalizedEmail, signal)) return 'exists';
      const subscriber: StoredSubscriber = {
        email: normalizedEmail,
        createdAt: new Date().toISOString(),
      };
      try {
        await s3().send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: buildSubscriberKey(normalizedEmail),
            Body: JSON.stringify(subscriber, null, 2),
            ContentType: 'application/json',
            // Un alta concurrente no debe pisar un registro que ya puede tener identificador.
            IfNoneMatch: '*',
          }),
          requestOptions(signal),
        );
      } catch (error) {
        if (error instanceof Error && error.name === 'PreconditionFailed') return 'exists';
        throw error;
      }
      return 'created';
    },
    async deleteSubscriber(email, signal) {
      const key = buildSubscriberKey(email);
      const metadata = await head(key, signal);
      if (!metadata) return 'missing';
      await remove(key, signal);
      if (metadata.sid) await discardIndex(metadata.sid, signal);
      return 'deleted';
    },
    async ensureUnsubscribeId(email, signal) {
      const key = buildSubscriberKey(email);
      let unpublished: string | undefined;
      // Tres escrituras como máximo; tras cada rechazo se relee antes de seguir o abandonar.
      for (let attempt = 0; ; attempt++) {
        const current = await read(key, signal);
        // Si el registro releído no tiene el identificador anterior, su índice quedó sobrante.
        if (unpublished && current?.value.unsubscribeId !== unpublished)
          await discardIndex(unpublished, signal);
        if (!current) return null;
        if (current.value.unsubscribeId) return current.value.unsubscribeId;
        if (attempt === 3) throw new Error('Subscriber record kept changing');
        if (!current.etag) throw new Error('Subscriber record without ETag');
        const token = randomBytes(32).toString('base64url');
        // El índice va primero: un identificador publicado en el registro siempre resuelve.
        await s3().send(
          new PutObjectCommand({
            ...object(buildIndexKey(token)),
            Body: JSON.stringify({ email: normalizeSubscriberEmail(email) }),
            ContentType: 'application/json',
          }),
          requestOptions(signal),
        );
        try {
          await s3().send(
            new PutObjectCommand({
              ...object(key),
              Body: JSON.stringify({ ...current.value, unsubscribeId: token }, null, 2),
              ContentType: 'application/json',
              Metadata: { sid: token },
              IfMatch: current.etag,
            }),
            requestOptions(signal),
          );
          return token;
        } catch (error) {
          // La escritura pudo aplicarse aunque llegue un error: el índice solo se descarta
          // después de releer. Sobrante es inocuo porque la baja exige ese identificador.
          const rejected =
            isObjectNotFoundError(error) ||
            (error instanceof Error && error.name === 'PreconditionFailed');
          if (!rejected) throw error;
          unpublished = token;
        }
      }
    },
    async unsubscribeByToken(token, signal) {
      if (!unsubscribeTokenPattern.test(token)) return 'missing';
      const index = await read(buildIndexKey(token), signal);
      if (!index) return 'missing';
      const key = buildSubscriberKey(index.value.email);
      // Una suscripción nueva tiene otro identificador: un enlace anterior no la afecta.
      const matches = (await head(key, signal))?.sid === token;
      if (matches) await remove(key, signal);
      await discardIndex(token, signal);
      return matches ? 'deleted' : 'missing';
    },
    async listSubscriberEmails(signal) {
      const emails = new Set<string>();
      let continuationToken: string | undefined;
      do {
        const response = (await s3().send(
          new ListObjectsV2Command({
            Bucket: config.bucket,
            Prefix: subscribersPrefix,
            ContinuationToken: continuationToken,
          }),
          requestOptions(signal),
        )) as {
          Contents?: { Key?: string }[];
          IsTruncated?: boolean;
          NextContinuationToken?: string;
        };
        for (const object of response.Contents ?? []) {
          const email = object.Key ? parseSubscriberEmailFromKey(object.Key) : null;
          if (email) emails.add(email);
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
      } while (continuationToken);
      return [...emails];
    },
  };
}
