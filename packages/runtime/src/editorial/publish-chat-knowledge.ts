import type {
  LambdaResponse,
  PublishChatKnowledgeEvent,
  PublishChatKnowledgeInvocation,
} from '@portfolio-api-cloud/contracts/editorial';
import { isPublicationDue } from '../chat/publication.js';
import type { ObjectStorageClient } from '../subscriptions/store.js';
import {
  buildPublishedEditorialKnowledgeArtifact,
  isEditorialKnowledgeArtifact,
  putKnowledgeArtifact,
} from './knowledge.js';
import { isRecord, jsonResponse } from './lambda.js';
import { logInfo } from './log.js';

export interface PublishChatKnowledgeDependencies {
  readonly storage: ObjectStorageClient;
  readonly bucket: string;
  readonly objectKey: string;
}

export function normalizePublishChatKnowledgeEvent(
  event: PublishChatKnowledgeInvocation,
): PublishChatKnowledgeEvent {
  if (isEditorialKnowledgeArtifact(event)) return { artifact: event };
  return isRecord(event) ? (event as PublishChatKnowledgeEvent) : {};
}

export async function publishChatKnowledge(
  event: PublishChatKnowledgeEvent,
  resolve: () => Promise<PublishChatKnowledgeDependencies>,
): Promise<LambdaResponse> {
  const artifact = event?.artifact;
  if (!isEditorialKnowledgeArtifact(artifact))
    return jsonResponse(400, { error: 'Valid chat knowledge artifact is required' });
  if (artifact.posts?.some((post) => !isPublicationDue(post.date)))
    return jsonResponse(400, { error: 'Knowledge contains invalid or future publication dates' });

  const deps = await resolve();
  const published = buildPublishedEditorialKnowledgeArtifact(artifact, {
    release: event.release,
    source: event.source,
  });
  const key = await putKnowledgeArtifact(deps.storage, deps.bucket, deps.objectKey, published);
  logInfo('Published chat knowledge artifact', {
    key,
    generatedAt: published.generatedAt,
    contentHash: published.contentHash,
  });
  return jsonResponse(200, {
    message: 'Knowledge artifact published',
    key,
    generatedAt: published.generatedAt,
    contentHash: published.contentHash,
  });
}
