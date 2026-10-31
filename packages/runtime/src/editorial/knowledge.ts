import { createHash } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import {
  defaultKnowledgeSource,
  knowledgeEnvelopeVersion,
  type EditorialKnowledgeArtifact,
  type EditorialKnowledgeRelease,
  type EditorialKnowledgeSource,
  type PublishedEditorialKnowledgeArtifact,
} from '@portfolio-api-cloud/contracts/editorial';
import type { ObjectStorageClient } from '../subscriptions/store.js';
import { isNonEmptyString, isRecord } from './lambda.js';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

function isPublicUrl(value: unknown): boolean {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isKnowledgeLink(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.label) &&
    isPublicUrl(value.url) &&
    (value.icon === undefined || isNonEmptyString(value.icon))
  );
}

function isProjectEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.slug) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.excerpt) &&
    (value.stack === undefined || isStringArray(value.stack)) &&
    (value.links === undefined ||
      (Array.isArray(value.links) && value.links.every((link) => isKnowledgeLink(link)))) &&
    (value.highlights === undefined || isStringArray(value.highlights)) &&
    (value.searchText === undefined || isNonEmptyString(value.searchText))
  );
}

function isPostEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.slug) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.excerpt) &&
    isNonEmptyString(value.date) &&
    (value.tags === undefined || isStringArray(value.tags)) &&
    (value.canonicalUrl === undefined || isPublicUrl(value.canonicalUrl)) &&
    (value.summary === undefined || isNonEmptyString(value.summary)) &&
    (value.searchText === undefined || isNonEmptyString(value.searchText))
  );
}

function uniqueEntries(entries: unknown, valid: (value: unknown) => boolean): boolean {
  return (
    Array.isArray(entries) &&
    entries.every((entry) => valid(entry)) &&
    new Set(entries.map((entry: { slug: string }) => entry.slug)).size === entries.length
  );
}

export function isEditorialKnowledgeArtifact(value: unknown): value is EditorialKnowledgeArtifact {
  return (
    isRecord(value) &&
    isNonEmptyString(value.generatedAt) &&
    (value.projects !== undefined || value.posts !== undefined) &&
    (value.projects === undefined || uniqueEntries(value.projects, isProjectEntry)) &&
    (value.posts === undefined || uniqueEntries(value.posts, isPostEntry))
  );
}

function normalizeArtifact(artifact: EditorialKnowledgeArtifact): EditorialKnowledgeArtifact {
  return {
    generatedAt: artifact.generatedAt,
    ...(artifact.projects ? { projects: artifact.projects } : {}),
    ...(artifact.posts ? { posts: artifact.posts } : {}),
  };
}

export function buildEditorialKnowledgeHash(artifact: EditorialKnowledgeArtifact): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(normalizeArtifact(artifact)))
    .digest('hex')}`;
}

export function buildPublishedEditorialKnowledgeArtifact(
  artifact: EditorialKnowledgeArtifact,
  options?: {
    source?: Partial<EditorialKnowledgeSource> | undefined;
    release?: EditorialKnowledgeRelease | undefined;
  },
): PublishedEditorialKnowledgeArtifact {
  return {
    version: knowledgeEnvelopeVersion,
    generatedAt: artifact.generatedAt,
    source: {
      repository: options?.source?.repository ?? defaultKnowledgeSource.repository,
      artifactPath: options?.source?.artifactPath ?? defaultKnowledgeSource.artifactPath,
    },
    ...(options?.release ? { release: options.release } : {}),
    contentHash: buildEditorialKnowledgeHash(artifact),
    knowledge: normalizeArtifact(artifact),
  };
}

export async function putKnowledgeArtifact(
  client: ObjectStorageClient,
  bucket: string,
  key: string,
  artifact: PublishedEditorialKnowledgeArtifact,
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(artifact, null, 2),
      ContentType: 'application/json',
    }),
  );
  return key;
}
