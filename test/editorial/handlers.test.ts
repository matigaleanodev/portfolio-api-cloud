import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { cpSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: any[]) => any>;
import { repositoryPath } from '../support/paths.js';

// Composición real de los entrypoints con dobles solo en los límites SDK/fetch.
const handlers = '../../packages/runtime/src/handlers/';
const sensitive = {
  R2_MEDIA_ACCESS_KEY_ID: 'media-id',
  R2_MEDIA_SECRET_ACCESS_KEY: 'media-secret',
  R2_SUBSCRIBERS_ACCESS_KEY_ID: 'subscribers-id',
  R2_SUBSCRIBERS_SECRET_ACCESS_KEY: 'subscribers-secret',
  RESEND_BLOG_API_KEY: 're_blog',
};
let ssm: AnyMock;
let s3: AnyMock;
let lambda: AnyMock;
let logs: string[];

beforeEach(() => {
  vi.resetModules();
  ssm = vi.fn(async (command: GetParameterCommand) => {
    expect(command).toBeInstanceOf(GetParameterCommand);
    expect(command.input.WithDecryption).toBe(true);
    return { Parameter: { Type: 'SecureString', Value: JSON.stringify(sensitive) } };
  });
  s3 = vi.fn(async (command: object) => {
    if (command instanceof GetObjectCommand)
      throw Object.assign(new Error('missing'), { name: 'NoSuchKey' });
    if (command instanceof ListObjectsV2Command)
      return { Contents: [{ Key: 'subscribers/lector@example.com.json' }] };
    return {};
  });
  lambda = vi.fn(async (_command: InvokeCommand) => ({
    Payload: Buffer.from(JSON.stringify({ statusCode: 200, body: '{"message":"ok"}' })),
  }));
  vi.spyOn(SSMClient.prototype, 'send').mockImplementation(ssm as never);
  vi.spyOn(S3Client.prototype, 'send').mockImplementation(s3 as never);
  vi.spyOn(LambdaClient.prototype, 'send').mockImplementation(lambda as never);
  logs = [];
  for (const level of ['info', 'error', 'warn', 'log'] as const)
    vi.spyOn(console, level).mockImplementation((...values: unknown[]) => {
      logs.push(values.map(String).join(' '));
    });
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries({
    AWS_REGION: 'us-east-1',
    R2_ENDPOINT: 'https://r2.example.invalid',
    R2_BUCKET: 'media',
    SUBSCRIBERS_R2_ENDPOINT: 'https://r2.example.invalid',
    SUBSCRIBERS_R2_BUCKET: 'subscribers',
    MEDIA_BASE_URL: 'https://media.example.invalid',
    BLOG_FROM_EMAIL: 'blog@example.invalid',
    GENERATE_OG_FUNCTION_NAME: functions.generateOg.functionName,
    NOTIFY_POST_FUNCTION_NAME: functions.notifyPost.functionName,
  }))
    vi.stubEnv(key, value);
});

const manifest = {
  generatedAt: '2026-03-07T15:00:00Z',
  siteUrl: 'https://matiasgaleano.dev',
  content: { posts: [{ slug: 'a', title: 'A', date: '2026-03-07', canonicalPath: '/blog/a' }] },
};

describe('entrypoints editoriales', () => {
  it('eventos inválidos devuelven 400 sin leer SSM, R2 ni invocar', async () => {
    vi.stubEnv('RUNTIME_PARAMETER_NAME', functions.processRelease.runtimeParameter);
    const release = (await import(`${handlers}process-release.js`)).handler;
    const og = (await import(`${handlers}generate-og.js`)).handler;
    const notify = (await import(`${handlers}notify-post.js`)).handler;
    const knowledge = (await import(`${handlers}publish-chat-knowledge.js`)).handler;
    for (const response of [
      await release({}),
      await release({
        ...manifest,
        content: { posts: [{ ...manifest.content.posts[0], date: '2999-01-01' }] },
      }),
      await og({}),
      await notify({ title: 'A', url: 'https://x.dev', date: '2999-01-01' }),
      await knowledge({}),
    ])
      expect(response.statusCode).toBe(400);
    expect(ssm).not.toHaveBeenCalled();
    expect(s3).not.toHaveBeenCalled();
    expect(lambda).not.toHaveBeenCalled();
  });

  it('process-release lee su parámetro, usa credenciales de media e invoca og y notify', async () => {
    vi.stubEnv('RUNTIME_PARAMETER_NAME', '/portfolio/prod/editorial');
    const { handler } = await import(`${handlers}process-release.js`);
    await expect(handler(manifest)).resolves.toEqual({
      statusCode: 200,
      body: JSON.stringify({ processedPosts: ['a'] }),
    });
    expect(ssm.mock.calls[0]?.[0].input.Name).toBe('/portfolio/prod/editorial');
    expect(lambda.mock.calls.map(([command]) => command.input.FunctionName)).toEqual([
      'portfolio-api-cloud-test-generate-og',
      'portfolio-api-cloud-test-notify-post',
    ]);
    const client = (S3Client.prototype.send as unknown as { mock: { contexts: S3Client[] } }).mock
      .contexts[0]!;
    expect(await client.config.credentials()).toMatchObject({ accessKeyId: 'media-id' });
    const put = s3.mock.calls.find(([command]) => command instanceof PutObjectCommand)?.[0];
    expect(put.input).toMatchObject({ Bucket: 'media', Key: 'state/posts.json' });
    // Segunda invocación: snapshot de configuración y cliente reutilizados.
    await handler({ manifest });
    expect(ssm).toHaveBeenCalledTimes(1);
  });

  it('notify-post lee /portfolio/prod/notifications, lista suscriptores y envía con Resend', async () => {
    vi.stubEnv('RUNTIME_PARAMETER_NAME', '/portfolio/prod/notifications');
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"id":"email_1"}', { status: 200 }));
    const { handler } = await import(`${handlers}notify-post.js`);
    const response = await handler({ title: 'A', url: 'https://matiasgaleano.dev/blog/a' });
    expect(JSON.parse(response.body)).toMatchObject({
      message: 'Notification sent',
      recipients: 1,
    });
    expect(ssm.mock.calls[0]?.[0].input.Name).toBe('/portfolio/prod/notifications');
    expect(s3.mock.calls[0]?.[0].input).toMatchObject({ Bucket: 'subscribers' });
    expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      'Bearer re_blog',
    );
    expect(logs.join('\n')).not.toMatch(/lector@example\.com/);
  });

  it('notify-post rechaza el bucket público como bucket de suscriptores', async () => {
    vi.stubEnv('RUNTIME_PARAMETER_NAME', '/portfolio/prod/notifications');
    vi.stubEnv('SUBSCRIBERS_R2_BUCKET', 'media');
    const { handler } = await import(`${handlers}notify-post.js`);
    await expect(handler({ title: 'A', url: 'https://x.dev/a' })).rejects.toThrow('must differ');
    expect(s3).not.toHaveBeenCalled();
  });

  it('publish-chat-knowledge publica el envelope en el bucket de media', async () => {
    vi.stubEnv('RUNTIME_PARAMETER_NAME', '/portfolio/prod/editorial');
    const { handler } = await import(`${handlers}publish-chat-knowledge.js`);
    const response = await handler({
      artifact: { generatedAt: '2026-03-08T00:00:00Z', projects: [] },
      release: { generatedAt: '2026-03-08T00:00:00Z', siteUrl: 'https://matiasgaleano.dev' },
    });
    expect(response.statusCode).toBe(200);
    expect(s3.mock.calls[0]?.[0].input).toMatchObject({
      Bucket: 'media',
      Key: 'artifacts/chat/knowledge.json',
    });
  });

  it('generate-og renderiza con las fuentes del paquete y sube og/<slug>.png', async () => {
    vi.stubEnv('RUNTIME_PARAMETER_NAME', '/portfolio/prod/editorial');
    // Las fuentes se resuelven relativas al módulo: se replica la disposición del paquete.
    cpSync(
      repositoryPath('packages/runtime/assets'),
      repositoryPath('.tmp/tests/packages/runtime/assets'),
      { recursive: true },
    );
    const { handler } = await import(`${handlers}generate-og.js`);
    const response = await handler({ slug: 'a', title: 'A' });
    expect(JSON.parse(response.body)).toEqual({
      message: 'OG image generated',
      url: 'https://media.example.invalid/og/a.png',
    });
    const put = s3.mock.calls[0]?.[0] as PutObjectCommand;
    expect(put.input).toMatchObject({ Bucket: 'media', Key: 'og/a.png', ContentType: 'image/png' });
    expect((put.input.Body as Buffer).readUInt32BE(16)).toBe(1200);
  });

  it('sin parámetro configurado o con claves faltantes falla antes de cualquier efecto', async () => {
    const { handler } = await import(`${handlers}publish-chat-knowledge.js`);
    const event = { generatedAt: '2026-03-08T00:00:00Z', projects: [] };
    await expect(handler(event)).rejects.toThrow();
    expect(ssm).not.toHaveBeenCalled();

    vi.resetModules();
    vi.stubEnv('RUNTIME_PARAMETER_NAME', '/portfolio/prod/editorial');
    ssm.mockResolvedValueOnce({ Parameter: { Type: 'SecureString', Value: '{}' } });
    const retry = (await import(`${handlers}publish-chat-knowledge.js`)).handler;
    await expect(retry(event)).rejects.toThrow('Missing runtime secrets');
    expect(s3).not.toHaveBeenCalled();
  });

  it('configuración no sensible faltante falla sin escribir', async () => {
    vi.stubEnv('RUNTIME_PARAMETER_NAME', '/portfolio/prod/editorial');
    vi.stubEnv('MEDIA_BASE_URL', '');
    const { handler } = await import(`${handlers}generate-og.js`);
    await expect(handler({ slug: 'a', title: 'A' })).rejects.toThrow('MEDIA_BASE_URL');
    expect(s3).not.toHaveBeenCalled();
  });
});
