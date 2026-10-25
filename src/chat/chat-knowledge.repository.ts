import path from 'node:path';
import { abortable, operationSignal, runtimeMetric } from '../request-scope.js';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  resolveExistingEditorialKnowledgePath,
  type ChatKnowledgeR2Config,
} from './chat.config.js';
import { type KnowledgeLink } from './chat.types.js';

type EditorialProjectEntry = {
  slug: string;
  title: string;
  excerpt: string;
  stack?: string[];
  links?: KnowledgeLink[];
  highlights?: string[];
  searchText?: string;
};

type EditorialPostEntry = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  tags?: string[];
  canonicalUrl?: string;
  summary?: string;
  searchText?: string;
};

export type EditorialKnowledgeArtifact = {
  generatedAt?: string;
  projects?: EditorialProjectEntry[];
  posts?: EditorialPostEntry[];
};

type PublishedEditorialKnowledgeEnvelope = {
  version: number;
  generatedAt: string;
  source: {
    repository: string;
    artifactPath: string;
  };
  release?: {
    generatedAt: string;
    siteUrl: string;
  };
  contentHash: string;
  knowledge: EditorialKnowledgeArtifact;
};

type LocalKnowledgeCacheEntry = {
  filePath: string;
  mtimeMs: number;
  artifact: EditorialKnowledgeArtifact;
};

type RemoteKnowledgeCacheEntry = {
  artifact: EditorialKnowledgeArtifact;
  expiresAt: number;
};

export type KnowledgeObjectReader = (
  signal: AbortSignal,
) => Promise<{ Body?: StringBody | undefined }>;

type StringBody = {
  transformToString(): Promise<string>;
  destroy?: () => void;
  [Symbol.asyncIterator]?: () => AsyncIterator<Uint8Array>;
};

const REMOTE_KNOWLEDGE_TIMEOUT_MS = 5_000;

export class ChatKnowledgeRepository {
  private remoteCache: RemoteKnowledgeCacheEntry | null = null;
  private remoteRequest: Promise<EditorialKnowledgeArtifact> | null = null;
  private localCache: LocalKnowledgeCacheEntry | null = null;

  constructor(
    private readonly r2Config: ChatKnowledgeR2Config | null,
    private readonly readRemote: KnowledgeObjectReader | null,
    private readonly cwd: string = process.cwd(),
    private readonly hardened = false,
    private readonly maxAgeMs = 30 * 86400_000,
  ) {}

  async getKnowledge(): Promise<EditorialKnowledgeArtifact> {
    const cachedRemote = this.remoteCache;
    if (
      cachedRemote &&
      cachedRemote.expiresAt > Date.now() &&
      this.isFresh(cachedRemote.artifact)
    ) {
      return cachedRemote.artifact;
    }

    if (this.r2Config && this.readRemote) {
      try {
        return await this.loadRemoteKnowledge();
      } catch {
        if (cachedRemote && this.isFresh(cachedRemote.artifact)) {
          runtimeMetric('knowledge_fallback', 'stale');
          return cachedRemote.artifact;
        }
      }
    }

    const localArtifact = await this.loadLocalFallbackKnowledge();
    if (localArtifact) {
      runtimeMetric('knowledge_fallback', 'packaged');
      return localArtifact;
    }

    throw new Error(
      'Chat knowledge is unavailable: R2 artifact could not be loaded and no valid local fallback exists.',
    );
  }

  private async loadRemoteKnowledge(): Promise<EditorialKnowledgeArtifact> {
    if (this.remoteRequest) {
      return this.remoteRequest;
    }

    if (!this.r2Config || !this.readRemote) {
      throw new Error('R2 chat knowledge is not configured');
    }

    this.remoteRequest = this.fetchRemoteKnowledge().finally(() => {
      this.remoteRequest = null;
    });

    return this.remoteRequest;
  }

  private async fetchRemoteKnowledge(): Promise<EditorialKnowledgeArtifact> {
    if (!this.r2Config || !this.readRemote) {
      throw new Error('R2 chat knowledge is not configured');
    }

    const signal = operationSignal(REMOTE_KNOWLEDGE_TIMEOUT_MS);
    let body: StringBody | undefined;
    let raw: string;
    try {
      raw = await abortable(signal, async () => {
        const response = await this.readRemote!(signal);
        body = response.Body;
        if (signal.aborted) {
          body?.destroy?.();
          signal.throwIfAborted();
        }
        if (!body) throw new Error('Empty knowledge body');
        const iterator = body[Symbol.asyncIterator]?.();
        if (!iterator) {
          const text = await body.transformToString();
          if (Buffer.byteLength(text) > 512 * 1024) throw new Error('Knowledge body too large');
          return text;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        while (true) {
          const chunk = await abortable(signal, () => iterator.next());
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 512 * 1024) throw new Error('Knowledge body too large');
          chunks.push(Buffer.from(chunk.value));
        }
        return Buffer.concat(chunks).toString('utf8');
      });
    } finally {
      body?.destroy?.();
    }
    if (!raw?.trim()) {
      throw new Error('R2 returned an empty chat knowledge body');
    }

    const payload = JSON.parse(raw) as unknown;
    const artifact = this.extractEditorialKnowledgeArtifact(payload);

    this.remoteCache = {
      artifact,
      expiresAt: Date.now() + this.r2Config.cacheTtlMs,
    };

    return artifact;
  }

  private async loadLocalFallbackKnowledge(): Promise<EditorialKnowledgeArtifact | null> {
    const filePath = this.hardened
      ? path.resolve(this.cwd, 'fallback/chat-knowledge.v1.json')
      : await resolveExistingEditorialKnowledgePath(this.cwd);
    if (!filePath) {
      return null;
    }

    try {
      const stats = await fs.stat(filePath);
      if (
        this.localCache &&
        this.localCache.filePath === filePath &&
        this.localCache.mtimeMs === stats.mtimeMs &&
        this.isFresh(this.localCache.artifact)
      ) {
        return this.localCache.artifact;
      }

      if (stats.size > 512 * 1024) return null;
      const raw = await fs.readFile(filePath, 'utf8');
      const payload = JSON.parse(raw) as unknown;
      const artifact = this.extractEditorialKnowledgeArtifact(payload);

      this.localCache = {
        filePath,
        mtimeMs: stats.mtimeMs,
        artifact,
      };

      return artifact;
    } catch {
      return null;
    }
  }

  private extractEditorialKnowledgeArtifact(payload: unknown): EditorialKnowledgeArtifact {
    if (this.isPublishedEnvelope(payload)) {
      const knowledge = payload.knowledge;
      const normalizedArtifact = {
        generatedAt: knowledge.generatedAt,
        ...(knowledge.projects ? { projects: knowledge.projects } : {}),
        ...(knowledge.posts ? { posts: knowledge.posts } : {}),
      };
      const hash = `sha256:${createHash('sha256').update(JSON.stringify(normalizedArtifact)).digest('hex')}`;
      if (payload.contentHash !== hash || payload.generatedAt !== knowledge.generatedAt) {
        throw new Error('Chat knowledge integrity check failed');
      }
      if (!this.isFresh(payload.knowledge)) throw new Error('Expired knowledge artifact');
      return payload.knowledge;
    }

    if (!this.hardened && this.isEditorialArtifact(payload) && this.isFresh(payload)) {
      return payload;
    }

    throw new Error('Invalid chat knowledge payload shape');
  }

  private isPublishedEnvelope(payload: unknown): payload is PublishedEditorialKnowledgeEnvelope {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }

    const candidate = payload as Record<string, unknown>;

    return (
      candidate.version === 1 &&
      this.isNonEmptyString(candidate.generatedAt) &&
      typeof candidate.contentHash === 'string' &&
      this.isEnvelopeSource(candidate.source) &&
      this.isEditorialArtifact(candidate.knowledge)
    );
  }

  private isEnvelopeSource(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
      this.isNonEmptyString(candidate.repository) && this.isNonEmptyString(candidate.artifactPath)
    );
  }

  private isEditorialArtifact(payload: unknown): payload is EditorialKnowledgeArtifact {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return false;
    }

    const candidate = payload as Record<string, unknown>;
    const hasKnowledgeCollections =
      candidate.projects !== undefined || candidate.posts !== undefined;

    return (
      this.isNonEmptyString(candidate.generatedAt) &&
      hasKnowledgeCollections &&
      this.isProjectEntries(candidate.projects) &&
      this.isPostEntries(candidate.posts)
    );
  }

  private isProjectEntries(value: unknown): boolean {
    return (
      value === undefined ||
      (Array.isArray(value) &&
        value.every((entry) => this.isProjectEntry(entry)) &&
        new Set(value.map((entry: EditorialProjectEntry) => entry.slug)).size === value.length)
    );
  }

  private isPostEntries(value: unknown): boolean {
    return (
      value === undefined ||
      (Array.isArray(value) &&
        value.every((entry) => this.isPostEntry(entry)) &&
        new Set(value.map((entry: EditorialPostEntry) => entry.slug)).size === value.length)
    );
  }

  private isProjectEntry(value: unknown): value is EditorialProjectEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
      this.isNonEmptyString(candidate.slug) &&
      this.isNonEmptyString(candidate.title) &&
      this.isNonEmptyString(candidate.excerpt) &&
      this.isStringArray(candidate.stack) &&
      this.isKnowledgeLinks(candidate.links) &&
      this.isStringArray(candidate.highlights) &&
      (candidate.searchText === undefined || typeof candidate.searchText === 'string')
    );
  }

  private isPostEntry(value: unknown): value is EditorialPostEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }

    const candidate = value as Record<string, unknown>;

    return (
      this.isNonEmptyString(candidate.slug) &&
      this.isNonEmptyString(candidate.title) &&
      this.isNonEmptyString(candidate.excerpt) &&
      typeof candidate.date === 'string' &&
      this.isStringArray(candidate.tags) &&
      (candidate.canonicalUrl === undefined || this.isPublicUrl(candidate.canonicalUrl)) &&
      (candidate.summary === undefined || typeof candidate.summary === 'string') &&
      (candidate.searchText === undefined || typeof candidate.searchText === 'string')
    );
  }

  private isKnowledgeLinks(value: unknown): boolean {
    return (
      value === undefined ||
      (Array.isArray(value) &&
        value.every((entry) => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            return false;
          }

          const candidate = entry as Record<string, unknown>;

          return (
            this.isNonEmptyString(candidate.label) &&
            this.isPublicUrl(candidate.url) &&
            (candidate.icon === undefined || typeof candidate.icon === 'string')
          );
        }))
    );
  }

  private isStringArray(value: unknown): boolean {
    return (
      value === undefined ||
      (Array.isArray(value) && value.every((entry) => this.isNonEmptyString(entry)))
    );
  }

  private isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private isPublicUrl(value: unknown): boolean {
    if (!this.isNonEmptyString(value)) return false;
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    } catch {
      return false;
    }
  }

  private isFresh(artifact: EditorialKnowledgeArtifact): boolean {
    const generatedAt = Date.parse(artifact.generatedAt ?? '');
    return (
      Number.isFinite(generatedAt) &&
      generatedAt <= Date.now() + 300_000 &&
      Date.now() - generatedAt <= this.maxAgeMs
    );
  }
}
