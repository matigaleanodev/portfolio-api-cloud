// Contratos de invocación editorial heredados de portfolio-cloud; los consume el CI de portfolio.

export interface LambdaResponse {
  readonly statusCode: number;
  readonly body: string;
}

export interface EditorialKnowledgeLink {
  readonly label: string;
  readonly url: string;
  readonly icon?: string;
}

export interface EditorialProjectEntry {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly stack?: readonly string[];
  readonly links?: readonly EditorialKnowledgeLink[];
  readonly highlights?: readonly string[];
  readonly searchText?: string;
}

export interface EditorialPostEntry {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly date: string;
  readonly tags?: readonly string[];
  readonly canonicalUrl?: string;
  readonly summary?: string;
  readonly searchText?: string;
}

export interface EditorialKnowledgeArtifact {
  readonly generatedAt: string;
  readonly projects?: readonly EditorialProjectEntry[];
  readonly posts?: readonly EditorialPostEntry[];
}

export interface EditorialKnowledgeSource {
  readonly repository: string;
  readonly artifactPath: string;
}

export interface ReleasePost {
  readonly slug: string;
  readonly title: string;
  readonly date: string;
  readonly canonicalPath: string;
}

export interface ReleaseManifest {
  readonly generatedAt: string;
  readonly siteUrl: string;
  readonly content: { readonly posts: readonly ReleasePost[] };
}

export type EditorialKnowledgeRelease = Pick<ReleaseManifest, 'generatedAt' | 'siteUrl'>;

export const knowledgeEnvelopeVersion = 1;

/** Envelope v1 publicado en R2 y leído por chat. */
export interface PublishedEditorialKnowledgeArtifact {
  readonly version: typeof knowledgeEnvelopeVersion;
  readonly generatedAt: string;
  readonly source: EditorialKnowledgeSource;
  readonly release?: EditorialKnowledgeRelease;
  readonly contentHash: string;
  readonly knowledge: EditorialKnowledgeArtifact;
}

export interface OgGenerationInput {
  readonly slug: string;
  readonly title: string;
  readonly excerpt?: string;
  readonly date?: string;
  readonly tags?: readonly string[];
}

export interface NotifyPostInput {
  readonly title: string;
  readonly url: string;
  readonly excerpt?: string;
  readonly date?: string;
  readonly tags?: readonly string[];
}

export type GenerateOgEvent = Partial<OgGenerationInput>;
export type NotifyPostEvent = Partial<NotifyPostInput>;

export interface ProcessReleaseEvent {
  readonly manifest?: ReleaseManifest;
}
export type ProcessReleaseInvocation = ProcessReleaseEvent | ReleaseManifest;

export interface PublishChatKnowledgeEvent {
  readonly artifact?: EditorialKnowledgeArtifact;
  readonly release?: EditorialKnowledgeRelease;
  readonly source?: Partial<EditorialKnowledgeSource>;
}
export type PublishChatKnowledgeInvocation = PublishChatKnowledgeEvent | EditorialKnowledgeArtifact;

export const defaultKnowledgeSource: EditorialKnowledgeSource = {
  repository: 'portfolio',
  artifactPath: '.generated/chat/knowledge.json',
};

export type ReleaseStage = 'generate-og' | 'notify-post';
export const defaultReleaseStageMaxAttempts = 2;
export const defaultOgObjectPrefix = 'og';

/**
 * Configuración no sensible por función editorial (nombres heredados de portfolio-cloud).
 * `required`: sin ella la función no compone dependencias; `optional`: tiene valor por defecto.
 */
export const editorialEnvironment = {
  processRelease: {
    required: [
      'R2_ENDPOINT',
      'R2_BUCKET',
      'GENERATE_OG_FUNCTION_NAME',
      'NOTIFY_POST_FUNCTION_NAME',
    ],
    optional: ['R2_REGION', 'RELEASE_STAGE_MAX_ATTEMPTS'],
  },
  generateOg: {
    required: ['R2_ENDPOINT', 'R2_BUCKET', 'MEDIA_BASE_URL'],
    optional: ['R2_REGION', 'OG_OBJECT_PREFIX'],
  },
  notifyPost: {
    // Mismos nombres que la fachada HTTP de suscripciones; R2_BUCKET solo verifica que difieran.
    required: ['SUBSCRIBERS_R2_ENDPOINT', 'SUBSCRIBERS_R2_BUCKET', 'R2_BUCKET', 'BLOG_FROM_EMAIL'],
    optional: ['R2_REGION'],
  },
  publishChatKnowledge: {
    required: ['R2_ENDPOINT', 'R2_BUCKET'],
    optional: ['R2_REGION', 'CHAT_KNOWLEDGE_OBJECT_KEY'],
  },
} as const satisfies Record<
  string,
  { readonly required: readonly string[]; readonly optional: readonly string[] }
>;

export type EditorialFunctionId = keyof typeof editorialEnvironment;
export type EditorialEnvironmentKey =
  | (typeof editorialEnvironment)[EditorialFunctionId]['required'][number]
  | (typeof editorialEnvironment)[EditorialFunctionId]['optional'][number];
