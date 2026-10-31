import {
  DeleteObjectCommand,
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
}

export type SubscriberCreateResult = 'created' | 'exists';
export type SubscriberDeleteResult = 'deleted' | 'missing';

export interface SubscriberStore {
  subscriberExists(email: string, signal?: AbortSignal): Promise<boolean>;
  createSubscriber(email: string, signal?: AbortSignal): Promise<SubscriberCreateResult>;
  deleteSubscriber(email: string, signal?: AbortSignal): Promise<SubscriberDeleteResult>;
  listSubscriberEmails(signal?: AbortSignal): Promise<string[]>;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const { subscribersPrefix, subscriberSuffix } = storageKeys;

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

export function createR2Client(config: R2ClientConfig): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region || r2Region,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
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

  const subscriberExists = async (email: string, signal?: AbortSignal) => {
    try {
      await s3().send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: buildSubscriberKey(email) }),
        requestOptions(signal),
      );
      return true;
    } catch (error) {
      if (isObjectNotFoundError(error)) return false;
      throw error;
    }
  };

  return {
    subscriberExists,
    async createSubscriber(email, signal) {
      const normalizedEmail = normalizeSubscriberEmail(email);
      if (await subscriberExists(normalizedEmail, signal)) return 'exists';
      const subscriber: StoredSubscriber = {
        email: normalizedEmail,
        createdAt: new Date().toISOString(),
      };
      await s3().send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: buildSubscriberKey(normalizedEmail),
          Body: JSON.stringify(subscriber, null, 2),
          ContentType: 'application/json',
        }),
        requestOptions(signal),
      );
      return 'created';
    },
    async deleteSubscriber(email, signal) {
      const normalizedEmail = normalizeSubscriberEmail(email);
      if (!(await subscriberExists(normalizedEmail, signal))) return 'missing';
      await s3().send(
        new DeleteObjectCommand({
          Bucket: config.bucket,
          Key: buildSubscriberKey(normalizedEmail),
        }),
        requestOptions(signal),
      );
      return 'deleted';
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
