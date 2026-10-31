import { InvokeCommand } from '@aws-sdk/client-lambda';
import { describe, expect, it, vi } from 'vitest';
import { isPublicationDue } from '../../packages/runtime/src/chat/publication.js';
import {
  readGenerateOgConfig,
  readNotifyPostConfig,
  readProcessReleaseConfig,
  readPublishChatKnowledgeConfig,
} from '../../packages/runtime/src/editorial/config.js';
import {
  assertLambdaSuccess,
  createLambdaInvoker,
  invocationFailureCode,
} from '../../packages/runtime/src/editorial/invoke-lambda.js';
import { jsonResponse } from '../../packages/runtime/src/editorial/lambda.js';
import { logError, logInfo, redactEmails } from '../../packages/runtime/src/editorial/log.js';

describe('fecha de publicación (implementación única compartida con chat)', () => {
  it('respeta la medianoche argentina aunque UTC ya esté en el día siguiente', () => {
    expect(isPublicationDue('2026-10-10', new Date('2026-10-10T02:59:59Z'))).toBe(false);
    expect(isPublicationDue('2026-10-10', new Date('2026-10-10T03:00:00Z'))).toBe(true);
    expect(isPublicationDue('2026-10-09', new Date('2026-10-10T02:59:59Z'))).toBe(true);
  });

  it.each(['2026-02-30', '2026-13-01', '2026-1-01', 'invalid', ''])(
    'rechaza fechas inválidas: %s',
    (date) => expect(isPublicationDue(date)).toBe(false),
  );
});

describe('invocación Lambda', () => {
  const payload = (value: unknown) => Buffer.from(JSON.stringify(value));

  it('invoca con el payload JSON y decodifica {statusCode, body}', async () => {
    const send = vi.fn().mockResolvedValue({
      Payload: payload({ statusCode: 200, body: '{"message":"ok"}' }),
    });
    await expect(
      createLambdaInvoker({ send })('portfolio-api-cloud-test-generate-og', { slug: 'test-post' }),
    ).resolves.toEqual({ statusCode: 200, body: '{"message":"ok"}' });
    const command = send.mock.calls[0]?.[0] as InvokeCommand;
    expect(command).toBeInstanceOf(InvokeCommand);
    expect(command.input).toEqual({
      FunctionName: 'portfolio-api-cloud-test-generate-og',
      Payload: payload({ slug: 'test-post' }),
    });
  });

  it('FunctionError: detalle para logs y código saneado desde errorType', async () => {
    const send = vi.fn().mockResolvedValue({
      FunctionError: 'Unhandled',
      Payload: payload({ errorType: 'TypeError', errorMessage: 'boom' }),
    });
    const failure = createLambdaInvoker({ send })('fn', {});
    await expect(failure).rejects.toThrow(
      JSON.stringify({ errorType: 'TypeError', errorMessage: 'boom' }),
    );
    await expect(failure).rejects.toMatchObject({ code: 'TypeError' });
    expect(invocationFailureCode(new Error('x'))).toBe('invoke_failed');
  });

  it('lanza un mensaje genérico con FunctionError sin payload', async () => {
    const send = vi.fn().mockResolvedValue({ FunctionError: 'Unhandled' });
    await expect(createLambdaInvoker({ send })('fn', {})).rejects.toThrow(
      'Lambda invocation failed for fn: Unhandled',
    );
  });

  it('rechaza una respuesta con forma inesperada', async () => {
    const send = vi.fn().mockResolvedValue({ Payload: payload({ message: 'ok' }) });
    await expect(createLambdaInvoker({ send })('fn', {})).rejects.toMatchObject({
      code: 'invalid_response',
      message: 'Unexpected Lambda response shape from fn',
    });
  });

  it('assertLambdaSuccess falla con statusCode >= 400', () => {
    expect(() =>
      assertLambdaSuccess('portfolio-api-cloud-test-notify-post', {
        statusCode: 500,
        body: '{"error":"failed"}',
      }),
    ).toThrow('Lambda portfolio-api-cloud-test-notify-post returned 500: {"error":"failed"}');
    expect(() => assertLambdaSuccess('fn', { statusCode: 200, body: '' })).not.toThrow();
  });
});

describe('respuestas y logs', () => {
  it('arma la respuesta {statusCode, body}', () => {
    expect(jsonResponse(201, { ok: true })).toEqual({ statusCode: 201, body: '{"ok":true}' });
  });

  it('ningún log contiene emails, tampoco en errores ni objetos anidados', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'info').mockImplementation((line: string) => void lines.push(line));
    vi.spyOn(console, 'error').mockImplementation((line: string) => void lines.push(line));
    logInfo('Subscriber', { email: 'User@Example.com', nested: { list: ['a.b+c@d.io'] } });
    logError('Failure', { error: new Error('Invalid `to`: x@y.dev'), message: '<z@w.co>' });
    expect(lines.join('\n')).not.toMatch(/@/);
    expect(JSON.parse(lines[0]!)).toMatchObject({ level: 'info', message: 'Subscriber' });
    expect(redactEmails('mail a@b.com y c@d.org')).toBe('mail [redacted-email] y [redacted-email]');
  });
});

describe('configuración no sensible por función', () => {
  const base = { R2_ENDPOINT: 'https://r2.example.invalid', R2_BUCKET: 'media' };

  it('process-release exige bucket, endpoint y nombres de funciones; intentos por defecto 2', () => {
    expect(() => readProcessReleaseConfig(base)).toThrow(
      'Missing required environment variables: GENERATE_OG_FUNCTION_NAME, NOTIFY_POST_FUNCTION_NAME',
    );
    const env = {
      ...base,
      GENERATE_OG_FUNCTION_NAME: 'portfolio-api-cloud-test-generate-og',
      NOTIFY_POST_FUNCTION_NAME: 'portfolio-api-cloud-test-notify-post',
    };
    expect(readProcessReleaseConfig(env)).toEqual({
      media: { endpoint: 'https://r2.example.invalid', region: 'auto', bucket: 'media' },
      generateOgFunctionName: 'portfolio-api-cloud-test-generate-og',
      notifyPostFunctionName: 'portfolio-api-cloud-test-notify-post',
      maxAttempts: 2,
    });
    for (const [value, expected] of [
      ['3', 3],
      ['0', 2],
      ['1.5', 2],
      ['x', 2],
    ] as const)
      expect(
        readProcessReleaseConfig({ ...env, RELEASE_STAGE_MAX_ATTEMPTS: value }).maxAttempts,
      ).toBe(expected);
  });

  it('rechaza endpoints sin https o con credenciales', () => {
    for (const endpoint of ['http://r2.example.invalid', 'https://u:p@r2.example.invalid', 'x'])
      expect(() => readPublishChatKnowledgeConfig({ ...base, R2_ENDPOINT: endpoint })).toThrow(
        'Invalid R2_ENDPOINT',
      );
  });

  it('generate-og normaliza MEDIA_BASE_URL y OG_OBJECT_PREFIX', () => {
    expect(() => readGenerateOgConfig(base)).toThrow('MEDIA_BASE_URL');
    expect(
      readGenerateOgConfig({
        ...base,
        MEDIA_BASE_URL: 'https://media.matiasgaleano.dev//',
        OG_OBJECT_PREFIX: '/og/',
      }),
    ).toMatchObject({ mediaBaseUrl: 'https://media.matiasgaleano.dev', ogObjectPrefix: 'og' });
    expect(
      readGenerateOgConfig({ ...base, MEDIA_BASE_URL: 'https://media.matiasgaleano.dev' })
        .ogObjectPrefix,
    ).toBe('og');
  });

  it('notify-post usa el bucket privado de suscriptores', () => {
    expect(() => readNotifyPostConfig(base)).toThrow('SUBSCRIBERS_R2_ENDPOINT');
    expect(
      readNotifyPostConfig({
        ...base,
        SUBSCRIBERS_R2_ENDPOINT: 'https://r2.example.invalid',
        SUBSCRIBERS_R2_BUCKET: 'subscribers',
        BLOG_FROM_EMAIL: 'blog@matiasgaleano.dev',
      }),
    ).toEqual({
      subscribers: {
        endpoint: 'https://r2.example.invalid',
        region: 'auto',
        bucket: 'subscribers',
      },
      publicBucket: 'media',
      fromEmail: 'blog@matiasgaleano.dev',
    });
  });

  it('publish-chat-knowledge usa la clave por defecto o CHAT_KNOWLEDGE_OBJECT_KEY', () => {
    expect(readPublishChatKnowledgeConfig(base).objectKey).toBe('artifacts/chat/knowledge.json');
    expect(
      readPublishChatKnowledgeConfig({ ...base, CHAT_KNOWLEDGE_OBJECT_KEY: 'k.json' }).objectKey,
    ).toBe('k.json');
  });
});
