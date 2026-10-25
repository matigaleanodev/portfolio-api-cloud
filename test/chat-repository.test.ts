import { beforeEach, afterEach, test, vi, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ChatKnowledgeRepository } from '../src/chat/chat-knowledge.repository.js';
import {
  getChatKnowledgeR2Config,
  getChatKnowledgeCacheTtlMs,
  getChatKnowledgeObjectKey,
  getEditorialKnowledgeCandidatePaths,
} from '../src/chat/chat.config.js';
import { createChat } from '../src/chat/chat.providers.js';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

let directory: string;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  directory = await mkdtemp(join(tmpdir(), 'portfolio-chat-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const config = getChatKnowledgeR2Config({
  R2_ENDPOINT: 'https://r2.example.invalid',
  R2_BUCKET: 'fake',
  R2_ACCESS_KEY_ID: 'fake',
  R2_SECRET_ACCESS_KEY: 'fake',
  CHAT_KNOWLEDGE_CACHE_TTL_MS: '1000',
})!;
const artifact = {
  generatedAt: '2026-10-09T00:00:00Z',
  projects: [
    {
      slug: 'demo',
      title: 'Demo',
      excerpt: 'Hechos de prueba',
      stack: ['TypeScript'],
      links: [{ label: 'Demo', url: 'https://example.invalid' }],
    },
  ],
  posts: [],
};
function envelope() {
  return {
    version: 1,
    generatedAt: artifact.generatedAt,
    source: { repository: 'portfolio', artifactPath: '.generated/chat/knowledge.json' },
    contentHash: 'sha256:' + createHash('sha256').update(JSON.stringify(artifact)).digest('hex'),
    knowledge: structuredClone(artifact),
  };
}
function remote(payload: unknown) {
  return { Body: { transformToString: async () => JSON.stringify(payload) } };
}
async function local(payload: unknown, path = join(directory, '.generated/chat/knowledge.json')) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(payload));
  return path;
}
test('Dado un envelope válido, cuando llegan consultas concurrentes, entonces comparte una lectura y respeta TTL y stale', async () => {
  vi.useFakeTimers();
  const reader = vi.fn().mockResolvedValue(remote(envelope()));
  const repository = new ChatKnowledgeRepository(config, reader, directory);
  const results = await Promise.all(Array.from({ length: 10 }, () => repository.getKnowledge()));
  expect(results).toEqual(Array.from({ length: 10 }, () => artifact));
  expect(reader).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(999);
  expect(await repository.getKnowledge()).toEqual(artifact);
  expect(reader).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  reader.mockRejectedValue(new Error('red privada'));
  expect(await repository.getKnowledge()).toEqual(artifact);
  expect(reader).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(864000000);
  expect(await repository.getKnowledge()).toEqual(artifact);
  expect(reader).toHaveBeenCalledTimes(3);
});
test('Dado R2 caído en frío, cuando existe fallback íntegro, entonces lo utiliza', async () => {
  await local(envelope());
  const reader = vi.fn().mockRejectedValue(new Error('red privada'));
  expect(await new ChatKnowledgeRepository(config, reader, directory).getKnowledge()).toEqual(
    artifact,
  );
  expect(reader).toHaveBeenCalledTimes(1);
});
test('Dado el archivo local cacheado, cuando cambia mtime, entonces revalida y no recupera un cache corrupto', async () => {
  const file = await local(artifact);
  const repository = new ChatKnowledgeRepository(null, null, directory);
  expect(await repository.getKnowledge()).toEqual(artifact);
  await writeFile(file, '{"invalid":true}');
  await utimes(file, new Date(), new Date(Date.now() + 2000));
  await expect(repository.getKnowledge()).rejects.toThrow('Chat knowledge is unavailable');
  await local({ ...artifact, projects: [] });
  await utimes(file, new Date(), new Date(Date.now() + 4000));
  expect(await repository.getKnowledge()).toEqual({ ...artifact, projects: [] });
});
test('Dado el fallback cacheado con mismo mtime, cuando se solicita otra vez, entonces reutiliza el artifact', async () => {
  const file = await local(artifact);
  await utimes(file, new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'));
  const repository = new ChatKnowledgeRepository(null, null, directory);
  const first = await repository.getKnowledge();
  // El origen usa path y mtime, sin leer el cuerpo otra vez.
  const stat = (await import('node:fs/promises')).stat;
  const metadata = await stat(file);
  await writeFile(file, 'no JSON');
  await utimes(file, metadata.atime, metadata.mtime);
  expect(await repository.getKnowledge()).toBe(first);
});
test('Dada la ruta primaria ausente, cuando existe la alternativa hermana, entonces conserva el fallback de desarrollo', async () => {
  const cwd = join(directory, 'api');
  await mkdir(cwd);
  await local(artifact, join(directory, 'portfolio/.generated/chat/knowledge.json'));
  expect(await new ChatKnowledgeRepository(null, null, cwd).getKnowledge()).toEqual(artifact);
});
test('Dado un primario inválido y hermano válido, cuando se carga, entonces no salta silenciosamente al segundo archivo', async () => {
  const cwd = join(directory, 'api');
  await local({ invalid: true }, join(cwd, '.generated/chat/knowledge.json'));
  await local(artifact, join(directory, 'portfolio/.generated/chat/knowledge.json'));
  await expect(new ChatKnowledgeRepository(null, null, cwd).getKnowledge()).rejects.toThrow(
    'Chat knowledge is unavailable',
  );
});
const invalidPayloads: [string, () => unknown][] = [
  ['checksum', () => ({ ...envelope(), contentHash: 'sha256:corrupt' })],
  ['versión', () => ({ ...envelope(), version: 2 })],
  ['fecha de envelope', () => ({ ...envelope(), generatedAt: 'otra' })],
  ['source ausente', () => ({ ...envelope(), source: undefined })],
  ['colecciones ausentes', () => ({ generatedAt: 'fecha' })],
  [
    'slug duplicado',
    () => ({ ...artifact, projects: [artifact.projects[0], artifact.projects[0]] }),
  ],
  [
    'post duplicado',
    () => ({
      ...artifact,
      posts: [
        { slug: 'p', title: 'p', excerpt: 'p', date: '2020-01-01' },
        { slug: 'p', title: 'p', excerpt: 'p', date: '2020-01-01' },
      ],
    }),
  ],
  [
    'URL con credenciales',
    () => ({
      ...artifact,
      projects: [
        {
          slug: 'p',
          title: 'p',
          excerpt: 'p',
          links: [{ label: 'p', url: 'https://user:pass@example.invalid' }],
        },
      ],
    }),
  ],
  [
    'URL javascript',
    () => ({
      ...artifact,
      posts: [
        {
          slug: 'p',
          title: 'p',
          excerpt: 'p',
          date: '2020-01-01',
          canonicalUrl: 'javascript:alert(1)',
        },
      ],
    }),
  ],
  [
    'stack inválido',
    () => ({ ...artifact, projects: [{ slug: 'p', title: 'p', excerpt: 'p', stack: [''] }] }),
  ],
  ['slug vacío', () => ({ ...artifact, projects: [{ slug: ' ', title: 'p', excerpt: 'p' }] })],
  ['null', () => null],
  ['array', () => []],
];
for (const [name, build] of invalidPayloads) {
  test(
    'Dado ' +
      name +
      ' inválido, cuando no hay fallback, entonces rechaza el conocimiento remoto y local',
    async () => {
      const payload = build();
      const reader = vi.fn().mockResolvedValue(remote(payload));
      await expect(
        new ChatKnowledgeRepository(config, reader, directory).getKnowledge(),
      ).rejects.toThrow('Chat knowledge is unavailable');
      await local(payload);
      await expect(
        new ChatKnowledgeRepository(null, null, directory).getKnowledge(),
      ).rejects.toThrow('Chat knowledge is unavailable');
    },
  );
}
for (const value of ['', ' ', '{']) {
  test(
    'Dado un body R2 vacío o inválido ' +
      JSON.stringify(value) +
      ', cuando se interpreta, entonces falla sin éxito ficticio',
    async () => {
      const reader = async () => ({ Body: { transformToString: async () => value } });
      await expect(
        new ChatKnowledgeRepository(config, reader, directory).getKnowledge(),
      ).rejects.toThrow('Chat knowledge is unavailable');
    },
  );
}
test('Dado R2 sin Body, cuando se carga en frío, entonces falla', async () => {
  await expect(
    new ChatKnowledgeRepository(config, async () => ({}), directory).getKnowledge(),
  ).rejects.toThrow('Chat knowledge is unavailable');
});
test('Dado send pendiente, cuando pasan cinco segundos, entonces usa el fallback sin declarar cancelación del proveedor', async () => {
  await local(artifact);
  vi.useFakeTimers();
  let complete!: (value: ReturnType<typeof remote>) => void;
  const reader = vi.fn().mockImplementation(
    () =>
      new Promise<ReturnType<typeof remote>>((resolve) => {
        complete = resolve;
      }),
  );
  const repository = new ChatKnowledgeRepository(config, reader, directory);
  const result = repository.getKnowledge();
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toEqual(artifact);
  expect(reader).toHaveBeenCalledTimes(1);
  complete(remote(envelope()));
  await Promise.resolve();
});
test('Dado send resuelto pero Body pendiente, cuando pasan cinco segundos, entonces aborta lectura y destruye el stream', async () => {
  vi.useFakeTimers();
  const destroy = vi.fn();
  const reader = vi.fn().mockResolvedValue({
    Body: { destroy, transformToString: () => new Promise<string>(() => undefined) },
  });
  const result = new ChatKnowledgeRepository(config, reader, directory)
    .getKnowledge()
    .catch(() => 'unavailable');
  await vi.advanceTimersByTimeAsync(5000);
  expect(await result).toBe('unavailable');
  expect(reader.mock.calls[0]?.[0].aborted).toBe(true);
  expect(destroy).toHaveBeenCalledTimes(1);
});
for (const [raw, ttl] of [
  [undefined, 300000],
  ['', 300000],
  ['999', 300000],
  ['abc', 300000],
  ['1000ms', 1000],
  [' 60000 ', 60000],
] as const) {
  test(
    'Dada configuración TTL ' + raw + ', cuando se interpreta, entonces conserva parseInt y mínimo',
    () => {
      expect(getChatKnowledgeCacheTtlMs({ CHAT_KNOWLEDGE_CACHE_TTL_MS: raw })).toBe(ttl);
    },
  );
}
test('Dada configuración R2 vacía, parcial o completa, cuando se compone, entonces conserva defaults y validaciones', () => {
  expect(getChatKnowledgeR2Config({})).toBeNull();
  expect(getChatKnowledgeR2Config({ R2_ENDPOINT: ' ' })).toBeNull();
  expect(() => getChatKnowledgeR2Config({ R2_BUCKET: 'fake' })).toThrow(
    'Incomplete R2 chat knowledge configuration',
  );
  expect(getChatKnowledgeObjectKey({ CHAT_KNOWLEDGE_OBJECT_KEY: ' /custom ' })).toBe('/custom');
  expect(getChatKnowledgeObjectKey({})).toBe('artifacts/chat/knowledge.json');
  expect(getEditorialKnowledgeCandidatePaths('/app')).toEqual([
    '/app/.generated/chat/knowledge.json',
    '/portfolio/.generated/chat/knowledge.json',
  ]);
});
test('Dado el SDK real con send simulado, cuando la composición lee conocimiento, entonces usa GetObject y credenciales explícitas', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async function (
    this: S3Client,
    command: unknown,
  ) {
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect((command as GetObjectCommand).input).toEqual({ Bucket: 'fake', Key: 'custom' });
    expect(await this.config.credentials()).toMatchObject({
      accessKeyId: 'fake',
      secretAccessKey: 'fake',
    });
    expect(this.config.forcePathStyle).toBe(true);
    return remote(envelope());
  });
  const chat = createChat(
    {
      R2_ENDPOINT: config.endpoint,
      R2_BUCKET: 'fake',
      R2_ACCESS_KEY_ID: 'fake',
      R2_SECRET_ACCESS_KEY: 'fake',
      CHAT_KNOWLEDGE_OBJECT_KEY: 'custom',
    },
    async () => {
      throw new Error('OpenAI no debe llamarse');
    },
    directory,
  );
  expect((await chat.reply({ message: 'Contame del proyecto Demo' })).source).toBe('fallback');
  expect(send).toHaveBeenCalledTimes(1);
});
