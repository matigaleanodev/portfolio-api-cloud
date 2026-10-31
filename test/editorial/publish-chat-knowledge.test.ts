import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: any[]) => any>;
import {
  normalizePublishChatKnowledgeEvent,
  publishChatKnowledge,
  type PublishChatKnowledgeDependencies,
} from '../../packages/runtime/src/editorial/publish-chat-knowledge.js';

let send: AnyMock;
let resolve: AnyMock;

beforeEach(() => {
  send = vi.fn().mockResolvedValue({});
  resolve = vi.fn(async (): Promise<PublishChatKnowledgeDependencies> => ({
    storage: { send },
    bucket: 'test-bucket',
    objectKey: 'artifacts/chat/knowledge.json',
  }));
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

const artifact = {
  generatedAt: '2026-03-08T12:29:28.947Z',
  projects: [
    {
      slug: 'foodly-notes',
      title: 'Foodly Notes',
      excerpt: 'Aplicacion de recetas',
      stack: ['Angular', 'Ionic'],
      links: [
        {
          label: 'Repositorio Frontend',
          url: 'https://github.com/matigaleanodev/foodly-notes',
          icon: 'code',
        },
      ],
    },
  ],
  posts: [
    {
      slug: 'arquitectura-modo-playa',
      title: 'Como disene la arquitectura de Modo Playa',
      excerpt: 'Producto multi-tenant real',
      date: '2026-03-07',
      tags: ['nestjs', 'backend'],
      canonicalUrl: 'https://matiasgaleano.dev/blog/arquitectura-modo-playa',
    },
  ],
};

describe('publish-chat-knowledge', () => {
  it('rechaza posts futuros antes de componer o publicar', async () => {
    const response = await publishChatKnowledge(
      {
        artifact: {
          generatedAt: new Date().toISOString(),
          projects: [],
          posts: [
            { slug: 'scheduled', title: 'Programado', excerpt: 'Resumen', date: '2999-01-01' },
          ],
        },
      },
      resolve,
    );
    expect(response).toEqual({
      statusCode: 400,
      body: JSON.stringify({ error: 'Knowledge contains invalid or future publication dates' }),
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('publica el envelope v1 canónico con contentHash', async () => {
    const response = await publishChatKnowledge(
      {
        artifact,
        release: { generatedAt: '2026-03-08T12:40:00.000Z', siteUrl: 'https://matiasgaleano.dev' },
      },
      resolve,
    );
    expect(response.statusCode).toBe(200);
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'artifacts/chat/knowledge.json',
      ContentType: 'application/json',
    });
    const expectedHash = `sha256:${createHash('sha256').update(JSON.stringify(artifact)).digest('hex')}`;
    expect(JSON.parse(String(command.input.Body))).toEqual({
      version: 1,
      generatedAt: '2026-03-08T12:29:28.947Z',
      source: { repository: 'portfolio', artifactPath: '.generated/chat/knowledge.json' },
      release: { generatedAt: '2026-03-08T12:40:00.000Z', siteUrl: 'https://matiasgaleano.dev' },
      contentHash: expectedHash,
      knowledge: artifact,
    });
    expect(String(command.input.Body)).toBe(
      JSON.stringify(JSON.parse(String(command.input.Body)), null, 2),
    );
    expect(JSON.parse(response.body)).toEqual({
      message: 'Knowledge artifact published',
      key: 'artifacts/chat/knowledge.json',
      generatedAt: '2026-03-08T12:29:28.947Z',
      contentHash: expectedHash,
    });
  });

  it('acepta el artifact crudo y fuentes parciales', async () => {
    const raw = normalizePublishChatKnowledgeEvent(artifact as never);
    expect(raw).toEqual({ artifact });
    const response = await publishChatKnowledge(
      { artifact, source: { repository: 'otro' } },
      resolve,
    );
    expect(JSON.parse(response.body).contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    const envelope = JSON.parse(String(send.mock.calls[0]?.[0].input.Body));
    expect(envelope.source).toEqual({
      repository: 'otro',
      artifactPath: '.generated/chat/knowledge.json',
    });
    expect(envelope.release).toBeUndefined();
  });

  it('el hash ignora propiedades extra fuera de generatedAt/projects/posts', async () => {
    await publishChatKnowledge({ artifact: { ...artifact, extra: 'x' } as never }, resolve);
    await publishChatKnowledge({ artifact }, resolve);
    const [first, second] = send.mock.calls.map(([command]) =>
      JSON.parse(String(command.input.Body)),
    );
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.knowledge).toEqual(artifact);
  });

  it.each([
    { artifact: {} },
    { artifact: { generatedAt: '2026-10-09T00:00:00Z' } },
    {
      artifact: {
        generatedAt: '2026-03-08T12:29:28.947Z',
        posts: [{ slug: 'post-invalido', title: '', excerpt: 'Falta titulo', date: '2026-03-07' }],
      },
    },
    {
      artifact: {
        generatedAt: '2026-10-09T00:00:00Z',
        projects: [
          { slug: 'duplicado', title: 'Proyecto', excerpt: 'Descripción' },
          { slug: 'duplicado', title: 'Otro', excerpt: 'Descripción' },
        ],
      },
    },
    {
      artifact: {
        generatedAt: '2026-10-09T00:00:00Z',
        projects: [
          {
            slug: 'proyecto',
            title: 'Proyecto',
            excerpt: 'Descripción',
            links: [{ label: 'Repo', url: 'javascript:alert(1)' }],
          },
        ],
      },
    },
    {
      artifact: {
        generatedAt: '2026-10-09T00:00:00Z',
        posts: [
          {
            slug: 'p',
            title: 'P',
            excerpt: 'E',
            date: '2026-10-01',
            canonicalUrl: 'https://user:pass@example.com',
          },
        ],
      },
    },
  ])('rechaza artifacts incompatibles sin escribir en R2 (%#)', async (event) => {
    await expect(publishChatKnowledge(event as never, resolve)).resolves.toEqual({
      statusCode: 400,
      body: JSON.stringify({ error: 'Valid chat knowledge artifact is required' }),
    });
    expect(send).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it('publica duplicados con la misma clave, contenido y checksum', async () => {
    const event = { artifact: { generatedAt: '2026-10-09T00:00:00Z', projects: [], posts: [] } };
    await publishChatKnowledge(event, resolve);
    await publishChatKnowledge(event, resolve);
    expect(send.mock.calls[0]?.[0].input).toEqual(send.mock.calls[1]?.[0].input);
  });
});
