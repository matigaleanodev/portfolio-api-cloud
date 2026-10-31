import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { storageKeys } from '@portfolio-api-cloud/contracts/storage';
import { createHash } from 'node:crypto';
import type { ObjectStorageClient } from '../src/subscriptions/store.ts';

export type MigrationMode = 'plan' | 'copy' | 'remove-public';

async function readObject(s3: ObjectStorageClient, bucket: string, key: string): Promise<Buffer> {
  const result = (await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))) as {
    Body?: { transformToByteArray(): Promise<Uint8Array> };
  };
  if (!result.Body) throw new Error('Subscriber object has no body');
  return Buffer.from(await result.Body.transformToByteArray());
}

const digest = (value: Buffer) => createHash('sha256').update(value).digest('hex');

/** Copia sin sobrescribir diferencias; el borrado exige copia verificada y corte de escrituras. */
export async function migrateSubscribers(
  s3: ObjectStorageClient,
  source: string,
  target: string,
  mode: MigrationMode,
): Promise<number> {
  if (!source || !target || source === target)
    throw new Error('Distinct source and private target buckets are required');
  let token: string | undefined;
  const keys: string[] = [];
  do {
    const page = (await s3.send(
      new ListObjectsV2Command({
        Bucket: source,
        Prefix: storageKeys.subscribersPrefix,
        ContinuationToken: token,
      }),
    )) as { Contents?: { Key?: string }[]; IsTruncated?: boolean; NextContinuationToken?: string };
    for (const object of page.Contents ?? [])
      if (object.Key?.endsWith(storageKeys.subscriberSuffix)) keys.push(object.Key);
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  if (mode === 'plan') return keys.length;

  // Verifica el lote completo antes de retirar cualquier registro público.
  const verified: { key: string; body: Buffer }[] = [];
  for (const key of keys) {
    const body = await readObject(s3, source, key);
    let destination: Buffer;
    try {
      destination = await readObject(s3, target, key);
    } catch (error) {
      const missing = error instanceof Error && ['NoSuchKey', 'NotFound'].includes(error.name);
      if (mode !== 'copy' || !missing) throw error;
      await s3.send(
        new PutObjectCommand({
          Bucket: target,
          Key: key,
          Body: body,
          ContentType: 'application/json',
          IfNoneMatch: '*',
        }),
      );
      destination = await readObject(s3, target, key);
    }
    if (digest(body) !== digest(destination))
      throw new Error('Subscriber copy differs; public source was preserved');
    verified.push({ key, body });
  }
  if (mode === 'remove-public') {
    for (const { key, body } of verified) {
      if (digest(body) !== digest(await readObject(s3, source, key)))
        throw new Error('Subscriber changed during migration; stop writes and retry');
      await s3.send(new DeleteObjectCommand({ Bucket: source, Key: key }));
    }
  }
  return keys.length;
}
