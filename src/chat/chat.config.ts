import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_CHAT_KNOWLEDGE_CACHE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_CHAT_KNOWLEDGE_OBJECT_KEY = 'artifacts/chat/knowledge.json';

export type ChatKnowledgeR2Config = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  objectKey: string;
  cacheTtlMs: number;
};

export function getEditorialKnowledgeCandidatePaths(cwd = process.cwd()): string[] {
  return [
    path.resolve(cwd, '.generated', 'chat', 'knowledge.json'),
    path.resolve(cwd, '..', 'portfolio', '.generated', 'chat', 'knowledge.json'),
  ];
}

export function getPrimaryEditorialKnowledgePath(cwd = process.cwd()): string {
  return path.resolve(cwd, '.generated', 'chat', 'knowledge.json');
}

export function getChatKnowledgeCacheTtlMs(
  env: Readonly<Record<string, string | undefined>>,
): number {
  const rawValue = env.CHAT_KNOWLEDGE_CACHE_TTL_MS?.trim();

  if (!rawValue) {
    return DEFAULT_CHAT_KNOWLEDGE_CACHE_TTL_MS;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsed) || parsed < 1_000) {
    return DEFAULT_CHAT_KNOWLEDGE_CACHE_TTL_MS;
  }

  return parsed;
}

export function getChatKnowledgeObjectKey(
  env: Readonly<Record<string, string | undefined>>,
): string {
  const rawValue = env.CHAT_KNOWLEDGE_OBJECT_KEY?.trim();

  return rawValue || DEFAULT_CHAT_KNOWLEDGE_OBJECT_KEY;
}

export function getChatKnowledgeR2Config(
  env: Readonly<Record<string, string | undefined>>,
): ChatKnowledgeR2Config | null {
  const values = {
    endpoint: env.R2_ENDPOINT?.trim(),
    bucket: env.R2_BUCKET?.trim(),
    accessKeyId: env.R2_ACCESS_KEY_ID?.trim(),
    secretAccessKey: env.R2_SECRET_ACCESS_KEY?.trim(),
  };

  const configuredEntries = Object.entries(values).filter(([, value]) => value);

  if (configuredEntries.length === 0) {
    return null;
  }

  const missingKeys = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key.toUpperCase());

  if (missingKeys.length > 0) {
    throw new Error(`Incomplete R2 chat knowledge configuration: ${missingKeys.join(', ')}`);
  }

  return {
    endpoint: values.endpoint as string,
    region: env.R2_REGION?.trim() || 'auto',
    bucket: values.bucket as string,
    accessKeyId: values.accessKeyId as string,
    secretAccessKey: values.secretAccessKey as string,
    objectKey: getChatKnowledgeObjectKey(env),
    cacheTtlMs: getChatKnowledgeCacheTtlMs(env),
  };
}

export async function resolveExistingEditorialKnowledgePath(
  cwd = process.cwd(),
): Promise<string | null> {
  for (const candidatePath of getEditorialKnowledgeCandidatePaths(cwd)) {
    try {
      await fs.access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return null;
}
