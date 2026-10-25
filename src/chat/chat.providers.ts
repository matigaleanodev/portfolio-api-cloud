import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { ChatKnowledgeRepository } from './chat-knowledge.repository.js';
import { getChatKnowledgeR2Config } from './chat.config.js';
import { ChatService } from './chat.service.js';
import { FaqService } from './faq.service.js';
import { KnowledgeService } from './knowledge.service.js';
import { OpenAiService } from './openai.service.js';

export function createChat(
  env: Readonly<Record<string, string | undefined>>,
  request: typeof fetch,
  cwd = process.cwd(),
): ChatService {
  const config = getChatKnowledgeR2Config(env);
  const client = config
    ? new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
        forcePathStyle: true,
      })
    : null;
  const repository = new ChatKnowledgeRepository(
    config,
    client && config
      ? () => client.send(new GetObjectCommand({ Bucket: config.bucket, Key: config.objectKey }))
      : null,
    cwd,
  );
  return new ChatService(
    new FaqService(),
    new KnowledgeService(repository),
    new OpenAiService(env, request),
  );
}
