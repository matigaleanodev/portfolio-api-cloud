import { StageInvocationError } from '../../packages/runtime/src/editorial/invoke-lambda.js';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: any[]) => any>;
import type { LambdaResponse } from '@portfolio-api-cloud/contracts/editorial';
import {
  detectNewPosts,
  loadProcessedPostsState,
  normalizeProcessReleaseEvent,
  processPost,
  processRelease,
  saveProcessedPosts,
  type ReleaseDependencies,
} from '../../packages/runtime/src/editorial/release.js';
import { createLambdaInvoker } from '../../packages/runtime/src/editorial/invoke-lambda.js';

const ok = (message: string): LambdaResponse => ({
  statusCode: 200,
  body: JSON.stringify({ message }),
});
const failed = (error: string): LambdaResponse => ({
  statusCode: 500,
  body: JSON.stringify({ error }),
});
const state = (value: unknown) => ({ Body: Readable.from([JSON.stringify(value)]) });
const notFound = () => Object.assign(new Error('missing'), { name: 'NotFound' });
const post = (slug: string, date = '2026-03-08') => ({
  slug,
  title: `Post ${slug}`,
  date,
  canonicalPath: `/blog/${slug}`,
});
const manifest = (...posts: ReturnType<typeof post>[]) => ({
  generatedAt: '2026-03-08T12:00:00.000Z',
  siteUrl: 'https://matiasgaleano.dev',
  content: { posts },
});

let send: AnyMock;
let invoke: AnyMock;
let resolve: AnyMock;
let deps: ReleaseDependencies;

beforeEach(() => {
  send = vi.fn();
  invoke = vi.fn();
  deps = {
    storage: { send },
    bucket: 'test-bucket',
    invoke,
    generateOgFunctionName: 'portfolio-api-cloud-test-generate-og',
    notifyPostFunctionName: 'portfolio-api-cloud-test-notify-post',
    maxAttempts: 2,
  };
  resolve = vi.fn(async () => deps);
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

const putBodies = () =>
  send.mock.calls
    .map(([command]) => command)
    .filter((command) => command instanceof PutObjectCommand)
    .map((command: PutObjectCommand) => JSON.parse(String(command.input.Body)));

describe('process-release: resumen del aviso', () => {
  const notifyPayload = async (extra: Record<string, unknown>) => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValue({});
    invoke.mockResolvedValue(ok('done'));
    const response = await processRelease(
      { manifest: manifest({ ...post('a'), ...extra }) },
      resolve,
    );
    expect(response.statusCode).toBe(200);
    return invoke.mock.calls[1]?.[1];
  };
  const base = { title: 'Post a', url: 'https://matiasgaleano.dev/blog/a', date: '2026-03-08' };

  it('pasa el excerpt del manifiesto a notify-post', async () => {
    await expect(notifyPayload({ excerpt: 'Resumen del post.' })).resolves.toEqual({
      ...base,
      excerpt: 'Resumen del post.',
    });
  });

  it.each([{}, { excerpt: '' }, { excerpt: '   ' }, { excerpt: 42 }])(
    'acepta el manifiesto sin un excerpt utilizable (%o) y no lo envía',
    async (extra) => {
      await expect(notifyPayload(extra)).resolves.toEqual(base);
    },
  );
});

describe('process-release: validación previa a efectos', () => {
  it('rechaza un manifiesto futuro sin componer dependencias, leer estado ni invocar', async () => {
    const response = await processRelease(
      normalizeProcessReleaseEvent(manifest(post('scheduled', '2999-01-01'))),
      resolve,
    );
    expect(response).toEqual({
      statusCode: 400,
      body: JSON.stringify({ error: 'Manifest contains invalid or future publication dates' }),
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([{}, { manifest: {} }, null, { manifest: manifest({ ...post('x'), title: ' ' }) }])(
    'devuelve 400 con un manifiesto inválido sin efectos: %j',
    async (event) => {
      await expect(
        processRelease(normalizeProcessReleaseEvent(event as never), resolve),
      ).resolves.toEqual({
        statusCode: 400,
        body: JSON.stringify({ error: 'Valid manifest is required' }),
      });
      expect(resolve).not.toHaveBeenCalled();
    },
  );

  it('rechaza fechas inválidas aunque no sean futuras', async () => {
    const response = await processRelease({ manifest: manifest(post('x', '2026-02-30')) }, resolve);
    expect(response.statusCode).toBe(400);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe('process-release: procesamiento', () => {
  it('no repite en la misma invocación un aviso incompleto', async () => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});
    invoke
      .mockResolvedValueOnce(ok('OG image generated'))
      .mockRejectedValue(new StageInvocationError('NotificationIncompleteError', 'detalle'));
    const response = await processRelease({ manifest: manifest(post('a')) }, resolve);
    expect(response.statusCode).toBe(500);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(putBodies().at(-1).a.lastFailure).toMatchObject({
      stage: 'notify-post',
      attempts: 1,
      message: 'NotificationIncompleteError',
    });
  });

  it('no hay posts nuevos cuando todos están notificados (estado legado)', async () => {
    send.mockResolvedValueOnce({
      Body: { transformToString: vi.fn().mockResolvedValue(JSON.stringify(['a'])) },
    });
    await expect(processRelease({ manifest: manifest(post('a')) }, resolve)).resolves.toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'No new posts' }),
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('acepta el manifiesto crudo de la invocación directa del CI', async () => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValueOnce({});
    invoke.mockResolvedValueOnce(ok('OG image generated')).mockResolvedValueOnce(ok('sent'));
    await expect(
      processRelease(normalizeProcessReleaseEvent(manifest(post('a'))), resolve),
    ).resolves.toEqual({ statusCode: 200, body: JSON.stringify({ processedPosts: ['a'] }) });
  });

  it('procesa solo los nuevos, con URL canónica, y persiste el estado normalizado', async () => {
    send
      .mockResolvedValueOnce({
        Body: { transformToString: vi.fn().mockResolvedValue(JSON.stringify(['a', 'b'])) },
      })
      .mockResolvedValueOnce({});
    invoke.mockResolvedValueOnce(ok('OG image generated')).mockResolvedValueOnce(ok('sent'));
    await expect(
      processRelease(
        {
          manifest: {
            ...manifest(post('a'), post('b'), post('c')),
            siteUrl: 'https://matiasgaleano.dev/',
          },
        },
        resolve,
      ),
    ).resolves.toEqual({ statusCode: 200, body: JSON.stringify({ processedPosts: ['c'] }) });
    expect(invoke).toHaveBeenNthCalledWith(1, 'portfolio-api-cloud-test-generate-og', {
      slug: 'c',
      title: 'Post c',
      date: '2026-03-08',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'portfolio-api-cloud-test-notify-post', {
      title: 'Post c',
      url: 'https://matiasgaleano.dev/blog/c',
      date: '2026-03-08',
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(send.mock.calls[0]?.[0].input).toEqual({
      Bucket: 'test-bucket',
      Key: 'state/posts.json',
    });
    const put = send.mock.calls.at(-1)?.[0] as PutObjectCommand;
    expect(put.input).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'state/posts.json',
      ContentType: 'application/json',
    });
    const legacy = {
      ogGeneratedAt: '1970-01-01T00:00:00.000Z',
      notifiedAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
    };
    const saved = JSON.parse(String(put.input.Body));
    expect(Object.keys(saved)).toEqual(['a', 'b', 'c']);
    expect(saved).toEqual({
      a: legacy,
      b: legacy,
      c: {
        ogGeneratedAt: expect.any(String),
        notifiedAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
  });

  it('acepta canonicalPath sin barra y siteUrl con barra final', async () => {
    invoke.mockResolvedValue(ok('ok'));
    await processPost(
      deps,
      { ...post('n'), canonicalPath: 'blog/n' },
      'https://matiasgaleano.dev/',
    );
    expect(invoke.mock.calls[1]?.[1]).toMatchObject({ url: 'https://matiasgaleano.dev/blog/n' });
  });

  it('reintenta una etapa fallida y continúa', async () => {
    invoke
      .mockResolvedValueOnce(failed('temporary OG failure'))
      .mockResolvedValueOnce(ok('OG image generated'))
      .mockResolvedValueOnce(ok('sent'));
    const result = await processPost(deps, post('n'), 'https://matiasgaleano.dev');
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(result.ogGeneratedAt).toBeTypeOf('string');
    expect(result.notifiedAt).toBeTypeOf('string');
  });

  it('respeta RELEASE_STAGE_MAX_ATTEMPTS en los reintentos', async () => {
    invoke.mockResolvedValue(failed('down'));
    await expect(
      processPost({ ...deps, maxAttempts: 3 }, post('n'), 'https://matiasgaleano.dev'),
    ).rejects.toMatchObject({ stage: 'generate-og', attempts: 3 });
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('salta generate-og cuando el estado ya la marca completa', async () => {
    invoke.mockResolvedValueOnce(ok('sent'));
    await processPost(deps, post('n'), 'https://matiasgaleano.dev', {
      ogGeneratedAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('portfolio-api-cloud-test-notify-post', expect.any(Object));
  });

  it('persiste progreso parcial y devuelve 500 con failedPosts', async () => {
    send
      .mockResolvedValueOnce(
        state({
          previo: {
            ogGeneratedAt: '2026-03-07T10:00:00.000Z',
            notifiedAt: '2026-03-07T10:01:00.000Z',
            updatedAt: '2026-03-07T10:01:00.000Z',
          },
        }),
      )
      .mockResolvedValue(undefined);
    invoke
      .mockResolvedValueOnce(ok('OG image generated'))
      .mockResolvedValueOnce(failed('notify failure'))
      .mockResolvedValueOnce(failed('notify failure'))
      .mockResolvedValueOnce(ok('OG image generated'))
      .mockResolvedValueOnce(ok('sent'));
    const response = await processRelease(
      { manifest: manifest(post('fallido'), post('ok')) },
      resolve,
    );
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body).toMatchObject({
      message: 'Release processed with partial failures',
      processedPosts: ['ok'],
      failedPosts: [
        {
          slug: 'fallido',
          stage: 'notify-post',
          attempts: 2,
          message: 'status_500',
          state: { ogGeneratedAt: expect.any(String) },
        },
      ],
    });
    // Lectura y, por post, el avance de la OG más el resultado.
    expect(send).toHaveBeenCalledTimes(5);
    expect(invoke).toHaveBeenCalledTimes(5);
    const [, afterFailure, , afterSuccess] = putBodies();
    expect(afterFailure.fallido).toMatchObject({
      ogGeneratedAt: expect.any(String),
      lastFailure: {
        stage: 'notify-post',
        attempts: 2,
        failedAt: expect.any(String),
        message: 'status_500',
      },
    });
    expect(afterFailure.fallido.notifiedAt).toBeUndefined();
    expect(afterSuccess.ok.lastFailure).toBeUndefined();
    expect(afterSuccess.previo.notifiedAt).toBe('2026-03-07T10:01:00.000Z');
  });

  it('un reintento no reenvía posts notificados ni regenera OG ya generada', async () => {
    send
      .mockResolvedValueOnce(
        state({
          notificado: {
            ogGeneratedAt: '2026-03-08T10:00:00.000Z',
            notifiedAt: '2026-03-08T10:01:00.000Z',
            updatedAt: '2026-03-08T10:01:00.000Z',
          },
          pendiente: {
            ogGeneratedAt: '2026-03-08T10:00:00.000Z',
            updatedAt: '2026-03-08T10:02:00.000Z',
            lastFailure: {
              stage: 'notify-post',
              failedAt: '2026-03-08T10:02:00.000Z',
              attempts: 2,
              message: 'notify failure',
            },
          },
        }),
      )
      .mockResolvedValue({});
    invoke.mockResolvedValue(ok('sent'));
    const response = await processRelease(
      { manifest: manifest(post('notificado'), post('pendiente')) },
      resolve,
    );
    expect(JSON.parse(response.body)).toEqual({ processedPosts: ['pendiente'] });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('portfolio-api-cloud-test-notify-post', {
      title: 'Post pendiente',
      url: 'https://matiasgaleano.dev/blog/pendiente',
      date: '2026-03-08',
    });
    const [saved] = putBodies();
    expect(saved.pendiente.lastFailure).toBeUndefined();
    expect(saved.pendiente.notifiedAt).toBeTypeOf('string');
    expect(saved.notificado.updatedAt).toBe('2026-03-08T10:01:00.000Z');
  });

  it('es idempotente: una segunda ejecución con el estado persistido no invoca nada', async () => {
    const stored = new Map<string, string>();
    send.mockImplementation(async (command: GetObjectCommand | PutObjectCommand) => {
      if (command instanceof PutObjectCommand)
        stored.set(command.input.Key!, String(command.input.Body));
      else if (!stored.has(command.input.Key!)) throw notFound();
      else return { Body: Readable.from([stored.get(command.input.Key!)!]) };
      return {};
    });
    invoke.mockResolvedValue(ok('ok'));
    const event = { manifest: manifest(post('a'), post('b')) };
    expect((await processRelease(event, resolve)).statusCode).toBe(200);
    const firstState = stored.get('state/posts.json');
    expect(invoke).toHaveBeenCalledTimes(4);
    await expect(processRelease(event, resolve)).resolves.toEqual({
      statusCode: 200,
      body: JSON.stringify({ message: 'No new posts' }),
    });
    expect(invoke).toHaveBeenCalledTimes(4);
    expect(stored.get('state/posts.json')).toBe(firstState);
  });

  it('registra un rechazo del SDK solo con su nombre de error', async () => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValue({});
    invoke.mockRejectedValue(
      Object.assign(new Error('Rate exceeded for arn:aws:lambda:us-east-1:650387442642:x'), {
        name: 'TooManyRequestsException',
      }),
    );
    const response = await processRelease({ manifest: manifest(post('a')) }, resolve);
    expect(JSON.parse(response.body).failedPosts[0]).toMatchObject({
      slug: 'a',
      stage: 'generate-og',
      attempts: 2,
      message: 'TooManyRequestsException',
    });
    expect(response.body).not.toContain('650387442642');
  });

  it('un error genérico se persiste como invoke_failed', async () => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValue({});
    invoke.mockRejectedValue(new Error('socket hang up at r2.example.invalid'));
    const response = await processRelease({ manifest: manifest(post('a')) }, resolve);
    expect(JSON.parse(response.body).failedPosts[0].message).toBe('invoke_failed');
    expect(JSON.stringify(putBodies())).not.toContain('r2.example.invalid');
  });

  it('un FunctionError con trace y ARN no llega al estado ni a la respuesta', async () => {
    const lines: string[] = [];
    vi.mocked(console.error).mockImplementation((line: string) => void lines.push(line));
    send.mockRejectedValueOnce(notFound()).mockResolvedValue({});
    const detail = {
      errorType: 'Runtime.UnhandledPromiseRejection',
      errorMessage:
        'Error: fetch failed https://20804625e19c3ff733141d1fa4aa202a.r2.cloudflarestorage.com lector@example.com',
      trace: [
        'at arn:aws:lambda:us-east-1:650387442642:function:portfolio-api-cloud-test-notify-post',
        'at /var/task/dist/editorial/email.js:42:11',
      ],
    };
    const invoker = createLambdaInvoker({
      send: async (command) => {
        const name = command.input.FunctionName!;
        return name.endsWith('notify-post')
          ? { FunctionError: 'Unhandled', Payload: Buffer.from(JSON.stringify(detail)) }
          : { Payload: Buffer.from(JSON.stringify(ok('og'))) };
      },
    });
    deps = { ...deps, invoke: invoker };
    const response = await processRelease({ manifest: manifest(post('a')) }, resolve);
    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).failedPosts[0]).toMatchObject({
      stage: 'notify-post',
      attempts: 2,
      message: 'Runtime.UnhandledPromiseRejection',
    });
    const persisted = JSON.stringify(putBodies());
    for (const leaked of [
      '650387442642',
      'r2.cloudflarestorage.com',
      '/var/task',
      'lector@example.com',
      'fetch failed',
    ])
      for (const text of [response.body, persisted]) expect(text).not.toContain(leaked);
    expect(putBodies().at(-1).a.lastFailure).toEqual({
      stage: 'notify-post',
      failedAt: expect.any(String),
      attempts: 2,
      message: 'Runtime.UnhandledPromiseRejection',
    });
    // El detalle queda en CloudWatch, con emails redactados.
    const logged = lines.join('\n');
    expect(logged).toContain('650387442642');
    expect(logged).not.toContain('lector@example.com');
  });

  it('un errorType no saneable cae en function_error', async () => {
    send.mockRejectedValueOnce(notFound()).mockResolvedValue({});
    deps = {
      ...deps,
      invoke: createLambdaInvoker({
        send: async () => ({
          FunctionError: 'Unhandled',
          Payload: Buffer.from(JSON.stringify({ errorType: 'bad type: <script>' })),
        }),
      }),
    };
    const response = await processRelease({ manifest: manifest(post('a')) }, resolve);
    expect(JSON.parse(response.body).failedPosts[0].message).toBe('function_error');
  });

  it('conserva lastFailure heredado con texto libre al leer y reescribir el estado', async () => {
    const legacy = {
      ogGeneratedAt: '2026-03-08T10:00:00.000Z',
      notifiedAt: '2026-03-08T10:01:00.000Z',
      updatedAt: '2026-03-08T10:01:00.000Z',
      lastFailure: {
        stage: 'notify-post',
        failedAt: '2026-03-08T10:00:30.000Z',
        attempts: 2,
        message: 'Lambda portfolio-cloud-prod-notify-post returned 500: {"error":"x"}',
      },
    };
    send.mockResolvedValueOnce(state({ viejo: legacy })).mockResolvedValue({});
    invoke.mockResolvedValue(ok('ok'));
    await processRelease({ manifest: manifest(post('viejo'), post('nuevo')) }, resolve);
    expect(putBodies()[0].viejo).toEqual(legacy);
  });

  it('propaga un fallo de lectura de estado distinto de NotFound sin invocar', async () => {
    send.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied' }));
    await expect(processRelease({ manifest: manifest(post('a')) }, resolve)).rejects.toThrow(
      'denied',
    );
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('estado state/posts.json', () => {
  it('lee el formato legado desde un stream y descarta slugs vacíos', async () => {
    send.mockResolvedValueOnce(state(['a', '', 'b']));
    await expect(loadProcessedPostsState({ send }, 'test-bucket')).resolves.toMatchObject({
      a: { ogGeneratedAt: '1970-01-01T00:00:00.000Z', notifiedAt: '1970-01-01T00:00:00.000Z' },
      b: { ogGeneratedAt: '1970-01-01T00:00:00.000Z', notifiedAt: '1970-01-01T00:00:00.000Z' },
    });
  });

  it('descarta entradas sin updatedAt', async () => {
    send.mockResolvedValueOnce(state({ a: { notifiedAt: 'x' }, b: { updatedAt: 'y' } }));
    await expect(loadProcessedPostsState({ send }, 'test-bucket')).resolves.toEqual({
      b: { updatedAt: 'y' },
    });
  });

  it('guarda slugs únicos en el formato normalizado', async () => {
    await saveProcessedPosts({ send }, 'test-bucket', ['a', 'b', 'a']);
    const command = send.mock.calls[0]?.[0] as PutObjectCommand;
    expect(command.input).toMatchObject({ Bucket: 'test-bucket', Key: 'state/posts.json' });
    expect(Object.keys(JSON.parse(String(command.input.Body)))).toEqual(['a', 'b']);
  });

  it('pendiente = sin notifiedAt, aunque la OG esté completa', () => {
    expect(
      detectNewPosts([post('a'), post('b'), post('pending')], {
        a: { ogGeneratedAt: 'x', notifiedAt: 'y', updatedAt: 'y' },
        pending: { ogGeneratedAt: 'x', updatedAt: 'x' },
      }).map(({ slug }) => slug),
    ).toEqual(['b', 'pending']);
  });
});

describe('process-release: presupuesto de tiempo', () => {
  let remaining: number;
  const run = (...posts: ReturnType<typeof post>[]) =>
    processRelease({ manifest: manifest(...posts) }, resolve, { remainingMs: () => remaining });
  const insufficient = { attempts: 0, message: 'insufficient_time' };

  beforeEach(() => {
    remaining = 54_000;
    send.mockImplementation(async (command: GetObjectCommand | PutObjectCommand) => {
      if (command instanceof GetObjectCommand) throw notFound();
      return {};
    });
    invoke.mockResolvedValue(ok('done'));
  });

  it('con 22 s tras generate-og no invoca notify-post y guarda ogGeneratedAt', async () => {
    invoke.mockImplementationOnce(async () => {
      remaining = 22_000;
      return ok('OG image generated');
    });
    const response = await run(post('a'));
    expect(response.statusCode).toBe(500);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(JSON.parse(response.body)).toMatchObject({
      processedPosts: [],
      failedPosts: [{ slug: 'a', stage: 'notify-post', ...insufficient }],
    });
    const saved = putBodies().at(-1).a;
    expect(saved).toMatchObject({
      ogGeneratedAt: expect.any(String),
      lastFailure: { stage: 'notify-post', ...insufficient },
    });
    expect(saved.notifiedAt).toBeUndefined();
  });

  it('guarda ogGeneratedAt antes de invocar notify-post', async () => {
    let savedBeforeNotify: unknown;
    invoke.mockImplementation(async (name: string) => {
      if (name.endsWith('notify-post')) savedBeforeNotify = putBodies().at(-1)?.a;
      return ok('done');
    });
    expect((await run(post('a'))).statusCode).toBe(200);
    expect(savedBeforeNotify).toEqual({
      ogGeneratedAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(putBodies().at(-1).a.notifiedAt).toBeTypeOf('string');
  });

  it('si el aviso ya no entra, guarda la OG y el fallo en una sola escritura', async () => {
    const writesStartedWith: number[] = [];
    send.mockImplementation(async (command: GetObjectCommand | PutObjectCommand) => {
      if (command instanceof GetObjectCommand) throw notFound();
      writesStartedWith.push(remaining);
      remaining -= 10_000;
      return {};
    });
    invoke.mockImplementationOnce(async () => {
      remaining = 12_000;
      return ok('OG image generated');
    });
    expect((await run(post('a'))).statusCode).toBe(500);
    // Un guardado previo habría dejado el del fallo sin su reserva.
    expect(writesStartedWith).toEqual([12_000]);
    expect(putBodies().at(-1).a).toMatchObject({
      ogGeneratedAt: expect.any(String),
      lastFailure: { stage: 'notify-post', ...insufficient },
    });
  });

  it('un fallo al guardar el avance de la OG no impide avisar ni guardar al final', async () => {
    let writes = 0;
    send.mockImplementation(async (command: GetObjectCommand | PutObjectCommand) => {
      if (command instanceof GetObjectCommand) throw notFound();
      if (++writes === 1) throw new Error('R2 down');
      return {};
    });
    expect((await run(post('a'))).statusCode).toBe(200);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(putBodies().at(-1).a).toMatchObject({
      ogGeneratedAt: expect.any(String),
      notifiedAt: expect.any(String),
    });
  });

  it.each([
    [43_000, 2, 200],
    [42_999, 0, 500],
  ])('con %i ms restantes hace %i invocaciones', async (left, invocations, status) => {
    remaining = left;
    expect((await run(post('a'))).statusCode).toBe(status);
    expect(invoke).toHaveBeenCalledTimes(invocations);
  });

  it.each([
    [43_000, 2],
    [42_999, 1],
  ])('reintenta con %i ms restantes: %i intento(s) y guarda el fallo', async (left, attempts) => {
    invoke.mockImplementation(async () => {
      remaining = left;
      throw new StageInvocationError('Sandbox.Timedout', 'detalle');
    });
    expect((await run(post('a'))).statusCode).toBe(500);
    expect(invoke).toHaveBeenCalledTimes(attempts);
    expect(putBodies().at(-1).a.lastFailure).toMatchObject({
      stage: 'generate-og',
      attempts,
      message: 'Sandbox.Timedout',
    });
  });

  it('corta en la primera etapa que no entra, con una sola escritura', async () => {
    remaining = 20_000;
    send.mockImplementation(async (command: GetObjectCommand | PutObjectCommand) =>
      command instanceof GetObjectCommand
        ? state({
            b: { ogGeneratedAt: '2026-03-08T10:00:00.000Z', updatedAt: '2026-03-08T10:00:00.000Z' },
          })
        : {},
    );
    const response = await run(post('a'), post('b'), post('c'));
    expect(response.statusCode).toBe(500);
    expect(invoke).not.toHaveBeenCalled();
    expect(JSON.parse(response.body).failedPosts).toMatchObject([
      { slug: 'a', stage: 'generate-og', ...insufficient },
      { slug: 'b', stage: 'notify-post', ...insufficient },
      { slug: 'c', stage: 'generate-og', ...insufficient },
    ]);
    expect(putBodies()).toHaveLength(1);
    expect(putBodies()[0].b.lastFailure).toBeUndefined();
  });

  it('deja de esperar a la hija para guardar el estado, sin darla por no ejecutada', async () => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    invoke.mockImplementationOnce(async () => ok('OG image generated'));
    invoke.mockImplementationOnce(
      (_name: string, _payload: unknown, signal: AbortSignal) =>
        new Promise((_done, fail) => {
          signal.addEventListener('abort', () =>
            fail(Object.assign(new Error('Request aborted'), { name: 'AbortError' })),
          );
          remaining = 11_000;
          controller.abort();
        }),
    );
    const response = await run(post('a'));
    // Cada espera deja libres los 11 s reservados para guardar.
    expect(timeout.mock.calls).toEqual([[43_000], [43_000]]);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(response.statusCode).toBe(500);
    const saved = putBodies().at(-1).a;
    expect(saved).toMatchObject({
      ogGeneratedAt: expect.any(String),
      lastFailure: { stage: 'notify-post', attempts: 1, message: 'AbortError' },
    });
    expect(saved.notifiedAt).toBeUndefined();
  });

  it('una ejecución posterior retoma el aviso sin regenerar la OG', async () => {
    const stored = new Map<string, string>();
    send.mockImplementation(async (command: GetObjectCommand | PutObjectCommand) => {
      if (command instanceof PutObjectCommand)
        stored.set(command.input.Key!, String(command.input.Body));
      else if (!stored.has(command.input.Key!)) throw notFound();
      else return { Body: Readable.from([stored.get(command.input.Key!)!]) };
      return {};
    });
    invoke.mockImplementationOnce(async () => {
      remaining = 22_000;
      return ok('OG image generated');
    });
    expect((await run(post('a'))).statusCode).toBe(500);
    remaining = 54_000;
    expect((await run(post('a'))).statusCode).toBe(200);
    expect(invoke.mock.calls.map(([name]) => name)).toEqual([
      'portfolio-api-cloud-test-generate-og',
      'portfolio-api-cloud-test-notify-post',
    ]);
  });
});
