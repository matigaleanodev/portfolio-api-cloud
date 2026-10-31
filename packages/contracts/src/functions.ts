import { runtimeParameterNames as runtimeParameters, type SecretKey } from './configuration.ts';

export type FunctionArchitecture = 'arm64' | 'x86_64';
export type FunctionArtifact = 'api' | 'chat' | 'editorial' | 'og';

export interface FunctionContract {
  /** Logical ID de CloudFormation; Handler se retiene para no reemplazar la función existente. */
  readonly logicalId: string;
  readonly functionName: string;
  readonly handler: string;
  readonly artifact: FunctionArtifact;
  readonly memorySize: number;
  readonly timeoutSeconds: number;
  readonly architecture: FunctionArchitecture;
  /** Claves del secreto sin las cuales la función no compone sus dependencias. */
  readonly requiredSecrets: readonly SecretKey[];
  /** Claves que habilitan capacidades degradables (IA, conocimiento remoto, origen verificado). */
  readonly optionalSecrets: readonly SecretKey[];
  /** Parámetro SSM SecureString propio (env `RUNTIME_PARAMETER_NAME`). */
  readonly runtimeParameter: string;
  /** Parámetro que la variante de validación lee en su lugar, si existe. */
  readonly validationParameter?: string;
  /** Parámetro secundario cargado en diferido (env `CHAT_PARAMETER_NAME`, solo api). */
  readonly chatParameter?: string;
}

const chatSecrets = [
  'ORIGIN_VERIFY_SECRET',
  'OPENAI_API_KEY',
  'R2_KNOWLEDGE_ACCESS_KEY_ID',
  'R2_KNOWLEDGE_SECRET_ACCESS_KEY',
] as const satisfies readonly SecretKey[];

export const functions = {
  api: {
    logicalId: 'Handler',
    functionName: 'portfolio-api-cloud-test',
    handler: 'dist/handlers/api.handler',
    artifact: 'api',
    memorySize: 512,
    timeoutSeconds: 28,
    architecture: 'arm64',
    requiredSecrets: [
      'QUOTA_KEY_SECRET',
      'RESEND_CONTACT_API_KEY',
      'R2_SUBSCRIBERS_ACCESS_KEY_ID',
      'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
    ],
    // Las variantes de chat cargan CHAT_PARAMETER_NAME con el contrato de chat.
    optionalSecrets: ['ORIGIN_VERIFY_SECRET'],
    runtimeParameter: runtimeParameters.api,
    validationParameter: runtimeParameters.validationApi,
    chatParameter: runtimeParameters.chat,
  },
  chat: {
    logicalId: 'Chat',
    functionName: 'portfolio-api-cloud-test-chat',
    handler: 'dist/handlers/chat.handler',
    artifact: 'chat',
    memorySize: 512,
    timeoutSeconds: 28,
    architecture: 'arm64',
    requiredSecrets: ['QUOTA_KEY_SECRET'],
    optionalSecrets: chatSecrets,
    runtimeParameter: runtimeParameters.chat,
    validationParameter: runtimeParameters.validationChat,
  },
  processRelease: {
    logicalId: 'ProcessRelease',
    functionName: 'portfolio-api-cloud-test-process-release',
    handler: 'dist/handlers/process-release.handler',
    artifact: 'editorial',
    memorySize: 512,
    timeoutSeconds: 30,
    architecture: 'arm64',
    requiredSecrets: ['R2_MEDIA_ACCESS_KEY_ID', 'R2_MEDIA_SECRET_ACCESS_KEY'],
    optionalSecrets: [],
    runtimeParameter: runtimeParameters.editorial,
  },
  generateOg: {
    logicalId: 'GenerateOg',
    functionName: 'portfolio-api-cloud-test-generate-og',
    handler: 'dist/handlers/generate-og.handler',
    artifact: 'og',
    memorySize: 1024,
    timeoutSeconds: 30,
    architecture: 'x86_64',
    requiredSecrets: ['R2_MEDIA_ACCESS_KEY_ID', 'R2_MEDIA_SECRET_ACCESS_KEY'],
    optionalSecrets: [],
    runtimeParameter: runtimeParameters.editorial,
  },
  notifyPost: {
    logicalId: 'NotifyPost',
    functionName: 'portfolio-api-cloud-test-notify-post',
    handler: 'dist/handlers/notify-post.handler',
    artifact: 'editorial',
    memorySize: 512,
    timeoutSeconds: 30,
    architecture: 'arm64',
    requiredSecrets: [
      'RESEND_BLOG_API_KEY',
      'R2_SUBSCRIBERS_ACCESS_KEY_ID',
      'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
    ],
    optionalSecrets: [],
    runtimeParameter: runtimeParameters.notifications,
  },
  publishChatKnowledge: {
    logicalId: 'PublishChatKnowledge',
    functionName: 'portfolio-api-cloud-test-publish-chat-knowledge',
    handler: 'dist/handlers/publish-chat-knowledge.handler',
    artifact: 'editorial',
    memorySize: 512,
    timeoutSeconds: 15,
    architecture: 'arm64',
    requiredSecrets: ['R2_MEDIA_ACCESS_KEY_ID', 'R2_MEDIA_SECRET_ACCESS_KEY'],
    optionalSecrets: [],
    runtimeParameter: runtimeParameters.editorial,
  },
} as const satisfies Record<string, FunctionContract>;

export type FunctionId = keyof typeof functions;
