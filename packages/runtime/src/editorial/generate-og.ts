import { PutObjectCommand } from '@aws-sdk/client-s3';
import type {
  GenerateOgEvent,
  LambdaResponse,
  OgGenerationInput,
} from '@portfolio-api-cloud/contracts/editorial';
import type { ObjectStorageClient } from '../subscriptions/store.js';
import { buildOgObjectKey, buildOgPublicUrl } from './config.js';
import { isNonEmptyString, isRecord, jsonResponse, normalizeTags } from './lambda.js';
import { logInfo } from './log.js';

export type RenderOgImage = (input: Omit<OgGenerationInput, 'slug'>) => Promise<Buffer>;

export interface GenerateOgDependencies {
  readonly storage: ObjectStorageClient;
  readonly bucket: string;
  readonly mediaBaseUrl: string;
  readonly ogObjectPrefix: string;
  readonly render: RenderOgImage;
}

export function normalizeGenerateOgInput(event: GenerateOgEvent): OgGenerationInput | null {
  if (!isRecord(event)) return null;
  const title = isNonEmptyString(event.title) ? event.title : null;
  const slug = isNonEmptyString(event.slug) ? event.slug : null;
  const excerpt = isNonEmptyString(event.excerpt) ? event.excerpt : undefined;
  const date = isNonEmptyString(event.date) ? event.date : undefined;
  if (!title || !slug) return null;
  return {
    title,
    slug,
    tags: normalizeTags(event.tags),
    ...(excerpt ? { excerpt } : {}),
    ...(date ? { date } : {}),
  };
}

export async function generateOg(
  event: GenerateOgEvent,
  resolve: () => Promise<GenerateOgDependencies>,
): Promise<LambdaResponse> {
  const input = normalizeGenerateOgInput(event);
  if (!input) return jsonResponse(400, { error: 'Title and slug are required' });

  const deps = await resolve();
  logInfo('Generating OG image', { slug: input.slug });
  const image = await deps.render({
    title: input.title,
    ...(input.tags ? { tags: input.tags } : {}),
    ...(input.excerpt ? { excerpt: input.excerpt } : {}),
    ...(input.date ? { date: input.date } : {}),
  });
  await deps.storage.send(
    new PutObjectCommand({
      Bucket: deps.bucket,
      Key: buildOgObjectKey(deps.ogObjectPrefix, input.slug),
      Body: image,
      ContentType: 'image/png',
    }),
  );
  const url = buildOgPublicUrl(deps.mediaBaseUrl, deps.ogObjectPrefix, input.slug);
  logInfo('OG image uploaded', { slug: input.slug, url });
  return jsonResponse(200, { message: 'OG image generated', url });
}
