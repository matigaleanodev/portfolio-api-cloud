import {
  defaultOgObjectPrefix,
  defaultReleaseStageMaxAttempts,
  editorialEnvironment,
  type EditorialFunctionId,
} from '@portfolio-api-cloud/contracts/editorial';
import { r2Region, storageKeys } from '@portfolio-api-cloud/contracts/storage';

export type EditorialEnvironment = Readonly<Record<string, string | undefined>>;

export interface BucketLocation {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
}

function requireKeys(env: EditorialEnvironment, id: EditorialFunctionId): void {
  const missing = editorialEnvironment[id].required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

function httpsUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Invalid ${name}`);
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(`Invalid ${name}`);
  return value;
}

const trimSlashes = (value: string) => value.replace(/^\/+|\/+$/g, '');

function mediaLocation(env: EditorialEnvironment): BucketLocation {
  return {
    endpoint: httpsUrl(env.R2_ENDPOINT!.trim(), 'R2_ENDPOINT'),
    region: env.R2_REGION?.trim() || r2Region,
    bucket: env.R2_BUCKET!.trim(),
  };
}

export function releaseStageMaxAttempts(env: EditorialEnvironment): number {
  const configured = Number(env.RELEASE_STAGE_MAX_ATTEMPTS);
  return Number.isInteger(configured) && configured >= 1
    ? configured
    : defaultReleaseStageMaxAttempts;
}

export interface ProcessReleaseConfig {
  readonly media: BucketLocation;
  readonly generateOgFunctionName: string;
  readonly notifyPostFunctionName: string;
  readonly maxAttempts: number;
}

export function readProcessReleaseConfig(env: EditorialEnvironment): ProcessReleaseConfig {
  requireKeys(env, 'processRelease');
  return {
    media: mediaLocation(env),
    generateOgFunctionName: env.GENERATE_OG_FUNCTION_NAME!.trim(),
    notifyPostFunctionName: env.NOTIFY_POST_FUNCTION_NAME!.trim(),
    maxAttempts: releaseStageMaxAttempts(env),
  };
}

export interface GenerateOgConfig {
  readonly media: BucketLocation;
  readonly mediaBaseUrl: string;
  readonly ogObjectPrefix: string;
}

export function readGenerateOgConfig(env: EditorialEnvironment): GenerateOgConfig {
  requireKeys(env, 'generateOg');
  return {
    media: mediaLocation(env),
    mediaBaseUrl: httpsUrl(env.MEDIA_BASE_URL!.trim(), 'MEDIA_BASE_URL').replace(/\/+$/g, ''),
    ogObjectPrefix: trimSlashes(env.OG_OBJECT_PREFIX || defaultOgObjectPrefix),
  };
}

export interface NotifyPostConfig {
  readonly subscribers: BucketLocation;
  readonly publicBucket: string;
  readonly fromEmail: string;
}

export function readNotifyPostConfig(env: EditorialEnvironment): NotifyPostConfig {
  requireKeys(env, 'notifyPost');
  return {
    subscribers: {
      endpoint: httpsUrl(env.SUBSCRIBERS_R2_ENDPOINT!.trim(), 'SUBSCRIBERS_R2_ENDPOINT'),
      region: env.R2_REGION?.trim() || r2Region,
      bucket: env.SUBSCRIBERS_R2_BUCKET!.trim(),
    },
    publicBucket: env.R2_BUCKET!.trim(),
    fromEmail: env.BLOG_FROM_EMAIL!,
  };
}

export interface PublishChatKnowledgeConfig {
  readonly media: BucketLocation;
  readonly objectKey: string;
}

export function readPublishChatKnowledgeConfig(
  env: EditorialEnvironment,
): PublishChatKnowledgeConfig {
  requireKeys(env, 'publishChatKnowledge');
  return {
    media: mediaLocation(env),
    // Misma resolución que el lector de chat.
    objectKey: env.CHAT_KNOWLEDGE_OBJECT_KEY?.trim() || storageKeys.chatKnowledge,
  };
}

export function buildOgObjectKey(prefix: string, slug: string): string {
  return `${prefix}/${trimSlashes(slug)}.png`;
}

export function buildOgPublicUrl(baseUrl: string, prefix: string, slug: string): string {
  return `${baseUrl}/${buildOgObjectKey(prefix, slug)}`;
}
