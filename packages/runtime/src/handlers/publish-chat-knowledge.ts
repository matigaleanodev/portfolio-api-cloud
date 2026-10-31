import type {
  LambdaResponse,
  PublishChatKnowledgeInvocation,
} from '@portfolio-api-cloud/contracts/editorial';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { createR2Client } from '../subscriptions/store.js';
import { readPublishChatKnowledgeConfig } from '../editorial/config.js';
import {
  normalizePublishChatKnowledgeEvent,
  publishChatKnowledge,
} from '../editorial/publish-chat-knowledge.js';
import { createSensitiveConfiguration, memoizeBySnapshot } from '../editorial/runtime.js';

const dependencies = memoizeBySnapshot(
  createSensitiveConfiguration(functions.publishChatKnowledge),
  (sensitive) => {
    const config = readPublishChatKnowledgeConfig(process.env);
    return {
      storage: createR2Client({
        ...config.media,
        accessKeyId: sensitive.R2_MEDIA_ACCESS_KEY_ID!,
        secretAccessKey: sensitive.R2_MEDIA_SECRET_ACCESS_KEY!,
      }),
      bucket: config.media.bucket,
      objectKey: config.objectKey,
    };
  },
);

/** Acepta `{artifact, release?, source?}` o el artifact crudo que envía el CI de portfolio. */
export const handler = async (event: PublishChatKnowledgeInvocation): Promise<LambdaResponse> =>
  publishChatKnowledge(normalizePublishChatKnowledgeEvent(event), dependencies);
