import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ChatKnowledgeRepository } from '../packages/runtime/src/chat/chat-knowledge.repository.js';
import { getChatKnowledgeR2Config } from '../packages/runtime/src/chat/chat.config.js';
let directory: string;
const config = getChatKnowledgeR2Config({
  R2_ENDPOINT: 'https://r2.example.invalid',
  R2_BUCKET: 'fake',
  R2_KNOWLEDGE_ACCESS_KEY_ID: 'fake',
  R2_KNOWLEDGE_SECRET_ACCESS_KEY: 'fake',
  CHAT_KNOWLEDGE_CACHE_TTL_MS: '1000',
})!;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'portfolio-hardened-knowledge-'));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
async function snapshot() {
  return JSON.parse(await readFile('fallback/chat-knowledge.v1.json', 'utf8'));
}
async function writeLocal(value: unknown) {
  await mkdir(join(directory, 'fallback'), { recursive: true });
  await writeFile(join(directory, 'fallback/chat-knowledge.v1.json'), JSON.stringify(value));
}
const remote = (payload: unknown) => ({
  Body: { transformToString: async () => JSON.stringify(payload) },
});
test('Dado el fallback editorial versionado, cuando se comprueba procedencia, entonces coincide con el objeto canónico y excluye posts futuros', async () => {
  const envelope = await snapshot();
  const provenance = JSON.parse(await readFile('fallback/provenance.json', 'utf8'));
  expect(envelope.contentHash).toBe(
    'sha256:' + createHash('sha256').update(JSON.stringify(envelope.knowledge)).digest('hex'),
  );
  expect(provenance.contentHash).toBe(envelope.contentHash);
  expect(provenance.sourceRepository).toBe(envelope.source.repository);
  expect(provenance.sourcePath).toBe(envelope.source.artifactPath);
  expect(provenance.sourceSha256).toBe(
    createHash('sha256').update(JSON.stringify(envelope)).digest('hex'),
  );
  expect(envelope.knowledge.projects.map((project: { slug: string }) => project.slug)).toEqual([
    'foodly-notes',
    'modo-playa',
    'portfolio',
  ]);
  expect(envelope.knowledge.posts.length).toBeGreaterThan(0);
  for (const post of envelope.knowledge.posts)
    expect(Date.parse(post.date)).toBeLessThanOrEqual(Date.parse(envelope.generatedAt));
});

test('Dado R2 caído y paquete frío, cuando se solicita conocimiento, entonces usa el fallback real empaquetado sin un directorio hermano', async () => {
  const envelope = await snapshot();
  await writeLocal(envelope);
  const reader = vi.fn().mockRejectedValue(new Error('R2 unavailable'));
  expect(await new ChatKnowledgeRepository(config, reader, directory, true).getKnowledge()).toEqual(
    envelope.knowledge,
  );
});
test.each(['plain', 'checksum', 'version', 'future', 'expired'])(
  'Dado fallback inválido por %s, cuando se inicializa en frío, entonces no lo ofrece como conocimiento válido',
  async (reason) => {
    const envelope = await snapshot();
    if (reason === 'plain') await writeLocal(envelope.knowledge);
    else {
      if (reason === 'checksum') envelope.contentHash = 'sha256:bad';
      if (reason === 'version') envelope.version = 2;
      if (reason === 'future') {
        vi.useFakeTimers();
        vi.setSystemTime(Date.parse(envelope.generatedAt) - 600_000);
      }
      if (reason === 'expired') {
        vi.useFakeTimers();
        vi.setSystemTime(Date.parse(envelope.generatedAt) + 30 * 86400_000 + 1);
      }
      await writeLocal(envelope);
    }
    await expect(
      new ChatKnowledgeRepository(null, null, directory, true).getKnowledge(),
    ).rejects.toThrow('unavailable');
  },
);
test('Dado modo administrado, cuando solo existe un fallback de desarrollo, entonces no depende del checkout hermano', async () => {
  const envelope = await snapshot();
  await mkdir(join(directory, '.generated/chat'), { recursive: true });
  await writeFile(join(directory, '.generated/chat/knowledge.json'), JSON.stringify(envelope));
  await expect(
    new ChatKnowledgeRepository(null, null, directory, true).getKnowledge(),
  ).rejects.toThrow('unavailable');
});
test('Dada caché stale remota o local, cuando supera la edad máxima del artifact, entonces se invalida incluso con mtime y TTL de caché intactos', async () => {
  const envelope = await snapshot();
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse(envelope.generatedAt));
  await writeLocal(envelope);
  const reader = vi.fn().mockResolvedValue(remote(envelope));
  const remoteRepository = new ChatKnowledgeRepository(config, reader, directory, true);
  const localRepository = new ChatKnowledgeRepository(null, null, directory, true);
  await remoteRepository.getKnowledge();
  await localRepository.getKnowledge();
  vi.setSystemTime(Date.now() + 30 * 86400_000 + 1);
  reader.mockRejectedValue(new Error('unavailable'));
  await expect(remoteRepository.getKnowledge()).rejects.toThrow();
  await expect(localRepository.getKnowledge()).rejects.toThrow();
});
test('Dado un stream R2 sobredimensionado, cuando se consume, entonces corta al superar 512 KiB y destruye el cuerpo', async () => {
  const destroy = vi.fn();
  const reader = vi.fn(async () => ({
    Body: {
      destroy,
      transformToString: async () => '',
      async *[Symbol.asyncIterator]() {
        yield Buffer.alloc(512 * 1024);
        yield Buffer.alloc(1);
      },
    },
  }));
  await expect(
    new ChatKnowledgeRepository(config, reader, directory, true).getKnowledge(),
  ).rejects.toThrow();
  expect(destroy).toHaveBeenCalledTimes(1);
});
