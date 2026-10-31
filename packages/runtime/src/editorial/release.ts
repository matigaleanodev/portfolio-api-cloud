import type { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import type {
  GenerateOgEvent,
  LambdaResponse,
  NotifyPostEvent,
  ProcessReleaseEvent,
  ProcessReleaseInvocation,
  ReleaseManifest,
  ReleasePost,
  ReleaseStage,
} from '@portfolio-api-cloud/contracts/editorial';
import { storageKeys } from '@portfolio-api-cloud/contracts/storage';
import { isPublicationDue } from '../chat/publication.js';
import { isObjectNotFoundError, type ObjectStorageClient } from '../subscriptions/store.js';
import { assertLambdaSuccess, invocationFailureCode, type InvokeLambda } from './invoke-lambda.js';
import { isRecord, jsonResponse } from './lambda.js';
import { errorMessage, logError, logInfo } from './log.js';

const legacyProcessedAt = new Date(0).toISOString();

/**
 * `message` conserva el nombre del campo heredado pero desde 1.1.0 solo guarda un código saneado
 * (`status_500`, `function_error`, errorType de Lambda...): state/posts.json vive en el bucket
 * público de media. Estados previos con texto libre se leen sin cambios.
 */
export interface ProcessedPostFailure {
  stage: ReleaseStage;
  failedAt: string;
  attempts: number;
  message: string;
}

export interface ProcessedPostStateEntry {
  ogGeneratedAt?: string;
  notifiedAt?: string;
  updatedAt: string;
  lastFailure?: ProcessedPostFailure | undefined;
}

export type ProcessedPostsState = Record<string, ProcessedPostStateEntry>;

interface PostProcessingFailure {
  slug: string;
  stage: ReleaseStage;
  attempts: number;
  message: string;
  state?: ProcessedPostStateEntry;
}

export interface ReleaseDependencies {
  readonly storage: ObjectStorageClient;
  readonly bucket: string;
  readonly invoke: InvokeLambda;
  readonly generateOgFunctionName: string;
  readonly notifyPostFunctionName: string;
  readonly maxAttempts: number;
}

type StringReadable = Readable | { transformToString?: (encoding?: string) => Promise<string> };

async function streamToString(stream: StringReadable): Promise<string> {
  if ('transformToString' in stream && typeof stream.transformToString === 'function')
    return stream.transformToString('utf-8');
  const chunks: Buffer[] = [];
  for await (const chunk of stream as Readable)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

function isProcessedPostStateEntry(value: unknown): value is ProcessedPostStateEntry {
  return (
    isRecord(value) &&
    typeof value.updatedAt === 'string' &&
    (value.ogGeneratedAt === undefined || typeof value.ogGeneratedAt === 'string') &&
    (value.notifiedAt === undefined || typeof value.notifiedAt === 'string')
  );
}

function normalizeLegacyProcessedPostsState(slugs: string[]): ProcessedPostsState {
  return Object.fromEntries(
    slugs.map((slug) => [
      slug,
      {
        ogGeneratedAt: legacyProcessedAt,
        notifiedAt: legacyProcessedAt,
        updatedAt: legacyProcessedAt,
      },
    ]),
  );
}

/** Acepta el formato legado (lista de slugs) y descarta entradas inválidas. */
export function normalizeProcessedPostsState(value: unknown): ProcessedPostsState {
  if (Array.isArray(value))
    return normalizeLegacyProcessedPostsState(
      value.filter((slug): slug is string => typeof slug === 'string' && slug.trim().length > 0),
    );
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([slug, state]) => slug.trim().length > 0 && isProcessedPostStateEntry(state),
    ),
  ) as ProcessedPostsState;
}

function isReleasePost(value: unknown): value is ReleasePost {
  return (
    isRecord(value) &&
    typeof value.slug === 'string' &&
    value.slug.trim().length > 0 &&
    typeof value.title === 'string' &&
    value.title.trim().length > 0 &&
    typeof value.date === 'string' &&
    value.date.trim().length > 0 &&
    typeof value.canonicalPath === 'string' &&
    value.canonicalPath.trim().length > 0
  );
}

/** Forma mínima con la que el handler distingue un manifiesto crudo de `{manifest}`. */
function looksLikeReleaseManifest(value: unknown): value is ReleaseManifest {
  return (
    isRecord(value) &&
    isRecord(value.content) &&
    typeof value.generatedAt === 'string' &&
    typeof value.siteUrl === 'string' &&
    Array.isArray(value.content.posts)
  );
}

function isReleaseManifest(value: unknown): value is ReleaseManifest {
  return (
    looksLikeReleaseManifest(value) &&
    (value.content.posts as unknown[]).every((post) => isReleasePost(post))
  );
}

export function normalizeProcessReleaseEvent(event: ProcessReleaseInvocation): ProcessReleaseEvent {
  return looksLikeReleaseManifest(event) ? { manifest: event } : (event ?? {});
}

function buildCanonicalUrl(siteUrl: string, canonicalPath: string): string {
  const normalizedSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  const normalizedPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`;
  return `${normalizedSiteUrl}${normalizedPath}`;
}

export async function loadProcessedPostsState(
  storage: ObjectStorageClient,
  bucket: string,
): Promise<ProcessedPostsState> {
  try {
    const response = (await storage.send(
      new GetObjectCommand({ Bucket: bucket, Key: storageKeys.processedPostsState }),
    )) as { Body?: StringReadable } | undefined;
    if (!response?.Body) return {};
    return normalizeProcessedPostsState(JSON.parse(await streamToString(response.Body)));
  } catch (error) {
    if (isObjectNotFoundError(error)) return {};
    throw error;
  }
}

export async function saveProcessedPostsState(
  storage: ObjectStorageClient,
  bucket: string,
  state: ProcessedPostsState,
): Promise<void> {
  const normalizedState = Object.fromEntries(
    Object.entries(state)
      .filter(([slug, entry]) => slug.trim().length > 0 && isProcessedPostStateEntry(entry))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  await storage.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storageKeys.processedPostsState,
      Body: JSON.stringify(normalizedState, null, 2),
      ContentType: 'application/json',
    }),
  );
}

export async function saveProcessedPosts(
  storage: ObjectStorageClient,
  bucket: string,
  slugs: string[],
): Promise<void> {
  await saveProcessedPostsState(
    storage,
    bucket,
    normalizeLegacyProcessedPostsState([...new Set(slugs)]),
  );
}

/** Pendiente = sin `notifiedAt`; un post notificado nunca se reprocesa. */
export function detectNewPosts(
  manifestPosts: readonly ReleasePost[],
  processedState: string[] | ProcessedPostsState,
): ReleasePost[] {
  const processed = Array.isArray(processedState)
    ? new Set(processedState)
    : new Set(
        Object.entries(processedState)
          .filter(([, entry]) => typeof entry.notifiedAt === 'string')
          .map(([slug]) => slug),
      );
  return manifestPosts.filter((post) => !processed.has(post.slug));
}

async function invokeWithRetry(
  deps: ReleaseDependencies,
  functionName: string,
  payload: GenerateOgEvent | NotifyPostEvent,
  stage: ReleaseStage,
  slug: string,
): Promise<void> {
  const maxAttempts = deps.maxAttempts;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      assertLambdaSuccess(functionName, await deps.invoke(functionName, payload));
      if (attempt > 1) logInfo('Stage succeeded after retry', { slug, stage, attempt });
      return;
    } catch (error) {
      lastError = error;
      // El detalle (payload, trace, ARN) solo va a CloudWatch, con emails redactados.
      logError('Stage invocation failed', {
        slug,
        stage,
        attempt,
        maxAttempts,
        code: invocationFailureCode(error),
        detail: errorMessage(error, String(error)),
      });
    }
  }
  throw {
    slug,
    stage,
    attempts: maxAttempts,
    message: invocationFailureCode(lastError),
  } satisfies PostProcessingFailure;
}

function isPostProcessingFailure(error: unknown): error is PostProcessingFailure {
  return (
    isRecord(error) &&
    typeof error.slug === 'string' &&
    (error.stage === 'generate-og' || error.stage === 'notify-post') &&
    typeof error.attempts === 'number' &&
    typeof error.message === 'string'
  );
}

function buildStateEntryUpdate(
  currentEntry: ProcessedPostStateEntry | undefined,
  updates: Partial<ProcessedPostStateEntry>,
): ProcessedPostStateEntry {
  const nextEntry: ProcessedPostStateEntry = {
    ...currentEntry,
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  if (updates.lastFailure === undefined) delete nextEntry.lastFailure;
  return nextEntry;
}

async function runStage(
  deps: ReleaseDependencies,
  state: ProcessedPostStateEntry,
  functionName: string,
  payload: GenerateOgEvent | NotifyPostEvent,
  stage: ReleaseStage,
  slug: string,
): Promise<void> {
  try {
    await invokeWithRetry(deps, functionName, payload, stage, slug);
  } catch (error) {
    if (isPostProcessingFailure(error)) throw { ...error, state } satisfies PostProcessingFailure;
    throw error;
  }
}

/** Etapas idempotentes por post: cada una se salta si su marca ya existe. */
export async function processPost(
  deps: ReleaseDependencies,
  post: ReleasePost,
  siteUrl: string,
  currentState?: ProcessedPostStateEntry,
): Promise<ProcessedPostStateEntry> {
  const postUrl = buildCanonicalUrl(siteUrl, post.canonicalPath);
  let nextState = currentState ?? { updatedAt: new Date().toISOString() };

  if (!nextState.ogGeneratedAt) {
    await runStage(
      deps,
      nextState,
      deps.generateOgFunctionName,
      { slug: post.slug, title: post.title, date: post.date },
      'generate-og',
      post.slug,
    );
    nextState = buildStateEntryUpdate(nextState, {
      ogGeneratedAt: new Date().toISOString(),
      lastFailure: undefined,
    });
  }

  if (!nextState.notifiedAt) {
    await runStage(
      deps,
      nextState,
      deps.notifyPostFunctionName,
      { title: post.title, url: postUrl, date: post.date },
      'notify-post',
      post.slug,
    );
    nextState = buildStateEntryUpdate(nextState, {
      notifiedAt: new Date().toISOString(),
      lastFailure: undefined,
    });
  }
  return nextState;
}

/**
 * Valida el manifiesto (incluidas fechas futuras en hora argentina) antes de componer
 * dependencias: un rechazo no lee configuración, estado ni invoca Lambdas.
 */
export async function processRelease(
  event: ProcessReleaseEvent,
  resolve: () => Promise<ReleaseDependencies>,
): Promise<LambdaResponse> {
  const manifest = event.manifest;
  if (!isReleaseManifest(manifest))
    return jsonResponse(400, { error: 'Valid manifest is required' });
  if (manifest.content.posts.some((post) => !isPublicationDue(post.date)))
    return jsonResponse(400, { error: 'Manifest contains invalid or future publication dates' });

  const deps = await resolve();
  const processedState = await loadProcessedPostsState(deps.storage, deps.bucket);
  const newPosts = detectNewPosts(manifest.content.posts, processedState);
  if (newPosts.length === 0) return jsonResponse(200, { message: 'No new posts' });

  const processedPosts: string[] = [];
  const failedPosts: PostProcessingFailure[] = [];

  for (const post of newPosts) {
    logInfo('Processing release post', { slug: post.slug });
    try {
      processedState[post.slug] = await processPost(
        deps,
        post,
        manifest.siteUrl,
        processedState[post.slug],
      );
      await saveProcessedPostsState(deps.storage, deps.bucket, processedState);
      processedPosts.push(post.slug);
    } catch (error) {
      if (!isPostProcessingFailure(error))
        logError('Post processing failed', {
          slug: post.slug,
          code: invocationFailureCode(error),
          detail: errorMessage(error, String(error)),
        });
      const failure: PostProcessingFailure = isPostProcessingFailure(error)
        ? error
        : {
            slug: post.slug,
            stage: 'notify-post',
            attempts: deps.maxAttempts,
            message: invocationFailureCode(error),
          };
      processedState[post.slug] = buildStateEntryUpdate(
        failure.state ?? processedState[post.slug],
        {
          lastFailure: {
            stage: failure.stage,
            failedAt: new Date().toISOString(),
            attempts: failure.attempts,
            message: failure.message,
          },
        },
      );
      await saveProcessedPostsState(deps.storage, deps.bucket, processedState);
      failedPosts.push(failure);
    }
  }

  if (failedPosts.length > 0)
    return jsonResponse(500, {
      message: 'Release processed with partial failures',
      processedPosts,
      failedPosts,
    });
  return jsonResponse(200, { processedPosts });
}
