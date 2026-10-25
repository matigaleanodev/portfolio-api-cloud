import { beforeEach, test, vi, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createApplication } from '../src/application.js';
import { readConfiguration } from '../src/config.js';
import { httpEvent } from './fixtures.js';
import { ChatService } from '../src/chat/chat.service.js';
import { FaqService } from '../src/chat/faq.service.js';
import { KnowledgeService } from '../src/chat/knowledge.service.js';
import { OpenAiService } from '../src/chat/openai.service.js';
import { handler } from '../src/handler.js';
import { createQuota } from '../src/quota.js';

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
const providerAnswer = {
  answer: 'Respuesta simulada',
  suggestedQuestions: ['¿Qué hace Foodly?', '¿Qué hace Modo Playa?'],
};
const artifact = {
  generatedAt: '2026-10-09T00:00:00Z',
  projects: [
    {
      slug: 'foodly-notes',
      title: 'Foodly Notes',
      excerpt: 'Recetas, Ionic/Angular y API NestJS. Publicada en Google Play.',
    },
    {
      slug: 'modo-playa',
      title: 'Modo Playa',
      excerpt:
        'Alojamientos, NestJS/MongoDB/JWT, aislamiento por ownerId. Publicada en Google Play.',
    },
  ],
  posts: [],
};
function event(message = '¿Qué hace Modo Playa?', ip = '192.0.2.1') {
  const value = httpEvent('POST', '/api/chat');
  value.headers = {
    'content-type': 'application/json',
    origin: 'https://frontend.example.invalid',
  };
  value.requestContext.http.sourceIp = ip;
  value.body = JSON.stringify({ message });
  return value;
}
function compose() {
  const request = vi
    .fn<typeof fetch>()
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ output: [{ content: [{ text: JSON.stringify(providerAnswer) }] }] }),
        ),
    );
  const repository = { getKnowledge: vi.fn().mockResolvedValue(artifact) };
  const chat = new ChatService(
    new FaqService(),
    new KnowledgeService(repository),
    new OpenAiService({ OPENAI_API_KEY: 'fake' }, request),
  );
  const app = createApplication(
    readConfiguration({ CORS_ORIGIN: '*' }),
    async () => undefined,
    async () => ({ message: 'ok' }),
    chat,
  );
  return { request, repository, chat, app };
}
test('Dados starters sin proveedores, cuando se usan GET o HEAD y variantes de ruta, entonces conserva contenido y respuestas independientes', async () => {
  const app = createApplication(readConfiguration({}));
  for (const [method, path] of [
    ['GET', '/api/chat/starters'],
    ['GET', '/API/CHAT/STARTERS/'],
    ['HEAD', '/api/chat/starters'],
  ]) {
    const response = await app(httpEvent(method, path));
    expect(response.statusCode).toBe(200);
    expect(response.headers?.['x-ratelimit-limit']).toBe('20');
    if (method === 'HEAD') expect(response.body).toBe('');
    else
      expect(JSON.parse(response.body ?? '')).toEqual({
        suggestedQuestions: ['¿Quién sos y a qué te dedicás?', '¿Qué tecnologías usás?'],
      });
  }
  const first = await app(httpEvent('GET', '/api/chat/starters'));
  first.body = 'alterada';
  expect((await app(httpEvent('GET', '/api/chat/starters'))).body).toContain('¿Quién sos');
});
test('Dada una comparación editorial, cuando se consulta por HTTP, entonces entrega 201 y envía ambos proyectos sin atribuirles hechos profesionales', async () => {
  const { app, request } = compose();
  const response = await app(
    event(
      '¿Qué diferencias hay entre Foodly Notes y Modo Playa? Indicá para cada uno qué hace, stack y si está publicado.',
    ),
  );
  expect(response.statusCode).toBe(201);
  expect(JSON.parse(response.body ?? '')).toEqual({ ...providerAnswer, source: 'ai' });
  const body = request.mock.calls[0]?.[1]?.body as string;
  expect(body).toContain('Recetas');
  expect(body).toContain('Alojamientos');
  expect(body).toContain('ownerId');
  expect(body).not.toContain('PostgreSQL');
  expect(response.headers?.['access-control-allow-origin']).toBe(
    'https://frontend.example.invalid',
  );
});
test('Dado un perfil y R2 caído, cuando se consulta empleo y luego proyectos, entonces conserva 201 profesional y 503 editorial', async () => {
  const { app, repository, request } = compose();
  repository.getKnowledge.mockRejectedValue(new Error('fallo privado'));
  expect((await app(event('¿En qué empresa trabajás hoy?'))).statusCode).toBe(201);
  expect(request).not.toHaveBeenCalled();
  expect(repository.getKnowledge).not.toHaveBeenCalled();
  const response = await app(event());
  expect(response.statusCode).toBe(503);
  expect(JSON.parse(response.body ?? '')).toEqual({
    message:
      'El conocimiento del portfolio no está disponible temporalmente. Intentá de nuevo más tarde.',
    error: 'Service Unavailable',
    statusCode: 503,
  });
  expect(response.headers?.['access-control-allow-origin']).toBe(
    'https://frontend.example.invalid',
  );
  expect(request).not.toHaveBeenCalled();
});
test('Dado OpenAI caído, cuando hay FAQ o contexto, entonces conserva source y distingue fallo técnico de dato no confirmado', async () => {
  const { app, request } = compose();
  request.mockResolvedValue(new Response('{}', { status: 503 }));
  let response = await app(event('¿En qué empresa laburás?'));
  expect(JSON.parse(response.body ?? '')).toMatchObject({
    source: 'faq',
    answer: expect.stringMatching(/^Trabajo en Banco Comafi a través de Boreal IT/),
  });
  response = await app(event('¿Modo Playa todavía usa Django?'));
  expect(response.statusCode).toBe(201);
  expect(JSON.parse(response.body ?? '')).toMatchObject({
    source: 'fallback',
    answer: expect.stringContaining('contacto@matiasgaleano.dev'),
  });
});
test('Dado un historial explícito, cuando se usa otro sessionId, entonces no persiste ni mezcla conversaciones', async () => {
  const { app, request } = compose();
  const first = event('Del segundo, ¿qué hace?');
  first.body = JSON.stringify({
    message: 'Del segundo, ¿qué hace?',
    sessionId: 'a',
    history: [{ role: 'assistant', content: 'Primero Modo Playa. Segundo Foodly Notes.' }],
  });
  expect((await app(first)).statusCode).toBe(201);
  expect(request.mock.calls[0]?.[1]?.body).toContain('Primero Modo Playa');
  const second = event('¿Cuál es el precio confirmado?');
  second.body = JSON.stringify({ message: '¿Cuál es el precio confirmado?', sessionId: 'b' });
  expect((await app(second)).statusCode).toBe(201);
  expect(request.mock.calls[1]?.[1]?.body).not.toContain('Primero Modo Playa');
});
for (const format of ['base64', 'gzip', 'form', 'UTF-16'] as const) {
  test(
    'Dado chat en ' + format + ', cuando se interpreta, entonces preserva 201 y el mensaje',
    async () => {
      const { app } = compose();
      const value = event('¿Dónde trabajás?');
      if (format === 'base64') {
        value.isBase64Encoded = true;
        value.body = Buffer.from(value.body!).toString('base64');
      }
      if (format === 'gzip') {
        value.headers['content-encoding'] = 'gzip';
        value.isBase64Encoded = true;
        value.body = gzipSync(value.body!).toString('base64');
      }
      if (format === 'form') {
        value.headers['content-type'] = 'application/x-www-form-urlencoded';
        value.body = 'message=' + encodeURIComponent('¿Dónde trabajás?');
      }
      if (format === 'UTF-16') {
        value.headers['content-type'] = 'application/json; charset=utf-16le';
        value.isBase64Encoded = true;
        value.body = Buffer.from(value.body!, 'utf16le').toString('base64');
      }
      expect((await app(value)).statusCode).toBe(201);
    },
  );
}
test('Dado el límite de 16 KiB, cuando chat o starters lo supera, entonces devuelve 413 antes de cuota, CORS y proveedores', async () => {
  const { app, request } = compose();
  const value = event();
  value.body = '{"message":"hola"}' + ' '.repeat(16384 - 18);
  expect(Buffer.byteLength(value.body)).toBe(16384);
  expect((await app(value)).statusCode).toBe(201);
  for (const path of ['/api/chat', '/api/chat/starters']) {
    const oversized = { ...value, rawPath: path, body: value.body + ' ' };
    if (path.endsWith('starters'))
      oversized.requestContext = {
        ...value.requestContext,
        http: { ...value.requestContext.http, method: 'GET' },
      };
    const result = await app(oversized);
    expect(result.statusCode).toBe(413);
    expect(result.headers?.['x-ratelimit-limit']).toBeUndefined();
    expect(result.headers?.['access-control-allow-origin']).toBeUndefined();
  }
  expect(request).toHaveBeenCalledTimes(1);
});
test('Dadas cuotas agotadas, cuando cambia método, IP o XFF, entonces starters/chat/contacto/alta/baja permanecen independientes', async () => {
  const { app } = compose();
  const starters = httpEvent('GET', '/api/chat/starters');
  starters.headers.origin = 'https://frontend.example.invalid';
  const results = await Promise.all(Array.from({ length: 21 }, () => app(starters)));
  expect(results.filter((r) => r.statusCode === 200)).toHaveLength(20);
  const blocked = results.find((r) => r.statusCode === 429)!;
  expect(blocked.headers?.['retry-after']).toBe('60');
  expect(JSON.parse(blocked.body ?? '')).toEqual({
    statusCode: 429,
    message: 'ThrottlerException: Too Many Requests',
  });
  expect(blocked.headers?.['access-control-allow-origin']).toBe(starters.headers.origin);
  expect(
    (await app({ ...starters, headers: { 'x-forwarded-for': '192.0.2.99' } })).statusCode,
  ).toBe(429);
  const other = httpEvent('GET', '/api/chat/starters');
  other.requestContext.http.sourceIp = '192.0.2.2';
  expect((await app(other)).statusCode).toBe(200);
  const post = event('2+2?');
  const chatResults = await Promise.all(Array.from({ length: 21 }, () => app(post)));
  expect(chatResults.filter((r) => r.statusCode === 201)).toHaveLength(20);
  expect(chatResults.filter((r) => r.statusCode === 429)).toHaveLength(1);
  expect((await app(event('2+2?', '192.0.2.2'))).statusCode).toBe(201);
  const subscription = event();
  subscription.rawPath = '/api/subscriptions';
  subscription.body = '{"email":"test@example.com"}';
  for (const method of ['POST', 'DELETE']) {
    subscription.requestContext.http.method = method;
    const result = await app(subscription);
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['x-ratelimit-remaining']).toBe('9');
  }
  const contact = event();
  contact.rawPath = '/api/contact';
  contact.body = '{"name":"Prueba","email":"test@example.com","message":"Mensaje válido"}';
  expect((await app(contact)).statusCode).toBe(204);
  expect((await app(httpEvent())).statusCode).toBe(200);
});
test('Dada cuota de un minuto, cuando se bloquea y reintenta, entonces la sanción vence sin extenderse', async () => {
  vi.useFakeTimers();
  const quota = createQuota(20, 'chat-test', 60);
  for (let index = 0; index < 20; index++) expect((await quota('192.0.2.1')).blocked).toBe(false);
  await vi.advanceTimersByTimeAsync(10000);
  expect((await quota('192.0.2.1')).headers['retry-after']).toBe('60');
  await vi.advanceTimersByTimeAsync(59000);
  expect((await quota('192.0.2.1')).headers['retry-after']).toBe('1');
  await vi.advanceTimersByTimeAsync(1000);
  expect((await quota('192.0.2.1')).headers['x-ratelimit-remaining']).toBe('19');
});
test('Dado el handler sin secretos ni knowledge, cuando se consulta, entonces mantiene health/starters, FAQ y 503 editorial sin red', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'portfolio-handler-chat-'));
  vi.spyOn(process, 'cwd').mockReturnValue(directory);
  expect(process.env.OPENAI_API_KEY).toBeUndefined();
  expect((await handler(httpEvent())).statusCode).toBe(200);
  expect((await handler(httpEvent('GET', '/api/chat/starters'))).statusCode).toBe(200);
  expect((await handler(event('¿Dónde trabajás?'))).statusCode).toBe(201);
  expect((await handler(event())).statusCode).toBe(503);
  await rm(directory, { recursive: true, force: true });
});
test('Dado un fallo inesperado de composición, cuando se invoca chat, entonces devuelve 500 controlado sin datos internos', async () => {
  const app = createApplication(readConfiguration({}), undefined, undefined, {
    reply: async () => {
      throw new Error('dato privado');
    },
  });
  const result = await app(event());
  expect(result.statusCode).toBe(500);
  expect(JSON.parse(result.body ?? '')).toEqual({
    statusCode: 500,
    message: 'Internal server error',
  });
});
