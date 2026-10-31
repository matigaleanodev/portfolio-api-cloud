import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import middy from '@middy/core';
import { createApiHandler } from '../packages/runtime/src/handlers/api.js';
import { createChatHandler } from '../packages/runtime/src/handlers/chat.js';
import { createApplication } from '../packages/runtime/src/application.js';
import { readConfiguration } from '../packages/runtime/src/config.js';
import { httpEvent } from './fixtures.js';
import {
  chatEnvironment,
  managedEnvironment,
  runtimeSecret,
  SimulatedControlStore,
  simulatedSubscribers,
} from './support/control.js';

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const origin = 'https://frontend.example.invalid';
const originSecret = 'origin'.repeat(8);
const security = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
};

function event(method: string, path: string, body?: unknown) {
  const value = httpEvent(method, path);
  value.requestContext.domainName = 'local.execute-api.us-east-1.amazonaws.com';
  value.requestContext.stage = '$default';
  value.headers = { 'content-type': 'application/json', origin };
  if (body !== undefined) value.body = typeof body === 'string' ? body : JSON.stringify(body);
  return value;
}
const contactBody = {
  name: 'Prueba',
  email: 'test@example.invalid',
  message: 'Mensaje controlado suficientemente largo',
};

function compose(overrides: Record<string, string | undefined> = {}) {
  const store = new SimulatedControlStore();
  const readParameter = vi.fn(async (_name: string) =>
    JSON.stringify({ ...runtimeSecret(), ORIGIN_VERIFY_SECRET: originSecret }),
  );
  const sendEmail = vi.fn(async () => undefined);
  const subscribers = simulatedSubscribers();
  const request = vi.fn<typeof fetch>();
  const deps = { store, readParameter, sendEmail, request, ...subscribers };
  return {
    store,
    readParameter,
    sendEmail,
    request,
    storage: subscribers.storage,
    api: createApiHandler({ ...managedEnvironment, ...overrides }, deps),
    chat: createChatHandler({ ...chatEnvironment, ...overrides }, deps),
  };
}

test('Dado Middy 7.9.2, cuando un before devuelve respuesta, entonces omite los before siguientes, el handler y todos los after', async () => {
  const calls: string[] = [];
  const chain = middy<{ stop: boolean }, string>({ timeoutEarlyInMillis: 0 })
    .use({
      after: () => void calls.push('outer-after'),
      onError: () => {
        calls.push('onError');
        return 'error';
      },
    })
    .use({
      before: (request) => {
        calls.push('first-before');
        return request.event.stop ? 'early' : undefined;
      },
      after: () => void calls.push('inner-after'),
    })
    .use({ before: () => void calls.push('second-before') })
    .handler(async () => {
      calls.push('handler');
      return 'handled';
    });
  expect(await chain({ stop: true }, {} as never)).toBe('early');
  expect(calls).toEqual(['first-before']);
  calls.length = 0;
  expect(await chain({ stop: false }, {} as never)).toBe('handled');
  expect(calls).toEqual(['first-before', 'second-before', 'handler', 'inner-after', 'outer-after']);
});

test('Dados cortes tempranos de la cadena, cuando responden preflight, body inválido o configuración, entonces se serializan una sola vez sin headers posteriores', async () => {
  const { api, store } = compose();
  const preflight = await api(event('OPTIONS', '/api/contact'));
  expect(preflight).toEqual({
    statusCode: 204,
    headers: {
      vary: 'Origin',
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET,POST,DELETE,OPTIONS',
      'access-control-allow-headers': 'Content-Type',
      'x-request-id': preflight.headers?.['x-request-id'],
    },
    body: '',
    isBase64Encoded: false,
  });
  for (const [body, status] of [
    ['{', 400],
    [JSON.stringify({ text: 'a'.repeat(16_400) }), 413],
  ] as const) {
    const result = await api(event('POST', '/api/contact', body));
    expect(result.statusCode).toBe(status);
    expect(Object.keys(result.headers ?? {}).sort()).toEqual(['content-type', 'x-request-id']);
    expect(result.isBase64Encoded).toBe(false);
  }
  expect(store.records.size).toBe(0);
  const unavailable = await compose({ QUOTA_TABLE_NAME: '' }).api(
    event('POST', '/api/contact', contactBody),
  );
  expect(unavailable).toEqual({
    statusCode: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...security,
      vary: 'Origin',
      'access-control-allow-origin': origin,
      'x-request-id': unavailable.headers?.['x-request-id'],
    },
    body: '{"statusCode":503,"message":"Service unavailable"}',
  });
});

test('Dado el ingress, cuando llega un evento ajeno o un origen inválido en dominio custom, entonces responde 403 antes de la cadena de negocio', async () => {
  const { api, readParameter, sendEmail } = compose({
    TRUSTED_CUSTOM_DOMAIN: 'api.matiasgaleano.dev',
  });
  const foreign = event('POST', '/api/contact', contactBody);
  foreign.requestContext.apiId = 'other';
  const forbidden = await api(foreign);
  expect(forbidden.statusCode).toBe(403);
  expect(forbidden.headers?.['x-request-id']).toBeUndefined();
  expect(JSON.parse(forbidden.body!)).toEqual({ statusCode: 403, message: 'Forbidden' });
  expect(readParameter).not.toHaveBeenCalled();
  const custom = event('POST', '/api/contact', contactBody);
  custom.requestContext.domainName = 'api.matiasgaleano.dev';
  custom.requestContext.http.sourceIp = '173.245.48.1';
  custom.headers['cf-connecting-ip'] = '192.0.2.10';
  custom.headers['x-portfolio-origin'] = 'wrong'.repeat(10);
  const invalid = await api(custom);
  expect(invalid.statusCode).toBe(403);
  expect(invalid.headers?.['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  expect(invalid.headers?.['access-control-allow-origin']).toBe(origin);
  custom.headers['x-portfolio-origin'] = originSecret;
  expect((await api(custom)).statusCode).toBe(204);
  expect(sendEmail).toHaveBeenCalledTimes(1);
  // OPTIONS y health también verifican el origen en el dominio custom.
  custom.requestContext.http.method = 'OPTIONS';
  custom.headers['x-portfolio-origin'] = 'wrong'.repeat(10);
  expect((await api(custom)).statusCode).toBe(403);
});

test('Dadas rutas, métodos y variantes, cuando api las atiende, entonces enruta case-insensitive con slash final y responde 404 Cannot', async () => {
  const { api, request } = compose();
  for (const [method, path, status] of [
    ['GET', '/API/HEALTH/', 200],
    ['HEAD', '/api/health', 200],
    ['POST', '/Api/Contact/', 204],
    ['POST', '/api/SUBSCRIPTIONS', 200],
    ['DELETE', '/api/subscriptions/', 200],
    ['GET', '/api/chat/starters/', 200],
    ['HEAD', '/API/CHAT/STARTERS', 200],
    ['PUT', '/api/contact', 404],
    ['GET', '/api/subscriptions', 404],
    ['GET', '/api/health//', 404],
    ['POST', '/v1/api/chat', 404],
  ] as const) {
    const body = method === 'POST' && /contact/i.test(path) ? contactBody : { email: 'a@b.co' };
    const result = await api(
      event(method, path, method === 'GET' || method === 'HEAD' ? undefined : body),
    );
    expect(result.statusCode, `${method} ${path}`).toBe(status);
    expect(result.isBase64Encoded).toBe(false);
    if (method === 'HEAD') expect(result.body).toBe('');
    if (status === 404) {
      expect(JSON.parse(result.body!)).toEqual({
        message: `Cannot ${method} ${path}`,
        error: 'Not Found',
        statusCode: 404,
      });
      expect(result.headers).toMatchObject(security);
      expect(result.headers?.['x-ratelimit-limit']).toBeUndefined();
    }
  }
  expect(request).not.toHaveBeenCalled();
});

test('Dado un cuerpo base64 o un 204, cuando se serializa, entonces decodifica antes del DTO y omite cuerpo y content-type', async () => {
  const { api, sendEmail } = compose();
  const encoded = event('POST', '/api/contact');
  encoded.isBase64Encoded = true;
  encoded.body = Buffer.from(JSON.stringify(contactBody)).toString('base64');
  const result = await api(encoded);
  expect(result.statusCode).toBe(204);
  expect(result.body).toBe('');
  expect(result.headers?.['content-type']).toBeUndefined();
  expect(result.headers).toMatchObject({ ...security, 'x-ratelimit-limit': '5' });
  expect(sendEmail).toHaveBeenCalledTimes(1);
});

test('Dado preflight sin CORS_ORIGIN, cuando llega OPTIONS, entonces continúa hasta 404 con headers de seguridad y sin CORS', async () => {
  const { api } = compose({ CORS_ORIGIN: undefined });
  const result = await api(event('OPTIONS', '/api/contact'));
  expect(result.statusCode).toBe(404);
  expect(result.headers).toMatchObject(security);
  expect(result.headers?.vary).toBeUndefined();
  expect(result.headers?.['access-control-allow-origin']).toBeUndefined();
});

test('Dado un error inesperado al serializar, cuando falla después del servicio, entonces onError responde 500 con los headers acumulados sin relanzar', async () => {
  const app = createApplication(
    readConfiguration({ CORS_ORIGIN: origin }),
    undefined,
    async () => ({
      message: 'ok',
      email: 1n as unknown as string,
    }),
  );
  const result = await app(event('POST', '/api/subscriptions', { email: 'test@example.com' }));
  expect(result.statusCode).toBe(500);
  expect(JSON.parse(result.body!)).toEqual({ statusCode: 500, message: 'Internal server error' });
  expect(result.headers).toMatchObject({
    ...security,
    vary: 'Origin',
    'access-control-allow-origin': origin,
    'x-ratelimit-limit': '10',
    'content-type': 'application/json; charset=utf-8',
  });
});

test('Dada la separación de funciones, cuando chat recibe otras rutas, entonces responde 404 sin leer configuración ni consumir cuota', async () => {
  const { chat, readParameter, store, sendEmail } = compose();
  for (const [method, path] of [
    ['POST', '/api/contact'],
    ['GET', '/api/health'],
    ['POST', '/api/subscriptions'],
  ] as const) {
    const result = await chat(event(method, path, method === 'GET' ? undefined : contactBody));
    expect(result.statusCode).toBe(404);
    expect(JSON.parse(result.body!).message).toBe(`Cannot ${method} ${path}`);
  }
  expect(readParameter).not.toHaveBeenCalled();
  expect(store.records.size).toBe(0);
  expect(sendEmail).not.toHaveBeenCalled();
  const preflight = await chat(event('OPTIONS', '/api/chat'));
  expect(preflight.statusCode).toBe(204);
  const head = await chat(event('HEAD', '/api/chat/starters'));
  expect(head.statusCode).toBe(200);
  expect(head.body).toBe('');
  expect(readParameter.mock.calls.map(([name]) => name)).toEqual(['/portfolio/prod/chat']);
});

test('Dadas cuotas compartidas, cuando api atiende una variante de chat y chat la canónica, entonces usan la misma clave, prefijo y parámetro de chat', async () => {
  const { api, chat, store, readParameter } = compose();
  const remaining: string[] = [];
  for (const [handler, path] of [
    [api, '/API/CHAT/STARTERS/'],
    [chat, '/api/chat/starters'],
    [api, '/api/chat/starters/'],
  ] as const)
    remaining.push(String((await handler(event('GET', path))).headers?.['x-ratelimit-remaining']));
  expect(remaining).toEqual(['19', '18', '17']);
  const keys = [...store.records.keys()];
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^quota:starters:[0-9a-f]{64}$/);
  // api lee su parámetro solo para negocio propio y el de chat de forma diferida.
  expect(readParameter.mock.calls.map(([name]) => name)).toEqual([
    '/portfolio/prod/chat',
    '/portfolio/prod/chat',
  ]);
  await api(event('POST', '/api/contact', contactBody));
  expect(readParameter.mock.calls.at(-1)![0]).toBe('/portfolio/prod/api');
});

test('Dado parámetro de chat ausente o ilegible, cuando api atiende una variante de chat, entonces responde 503 sin afectar health, contacto ni suscripciones', async () => {
  for (const overrides of [{ CHAT_PARAMETER_NAME: undefined }, {}]) {
    const store = new SimulatedControlStore();
    const sendEmail = vi.fn(async () => undefined);
    const readParameter = vi.fn(async (name: string) => {
      if (name === '/portfolio/prod/chat') throw new Error('ParameterNotFound');
      return JSON.stringify(runtimeSecret());
    });
    const api = createApiHandler(
      { ...managedEnvironment, ...overrides },
      { store, sendEmail, readParameter, ...simulatedSubscribers() },
    );
    const chatVariant = await api(event('POST', '/API/CHAT/', { message: 'Hola' }));
    expect(chatVariant.statusCode).toBe(503);
    expect(JSON.parse(chatVariant.body!)).toEqual({
      statusCode: 503,
      message: 'Service unavailable',
    });
    expect((await api(event('GET', '/api/health'))).statusCode).toBe(200);
    expect((await api(event('POST', '/api/contact', contactBody))).statusCode).toBe(204);
    expect(
      (await api(event('POST', '/api/subscriptions', { email: 'test@example.com' }))).statusCode,
    ).toBe(200);
    expect([...store.records.keys()].some((key) => key.startsWith('quota:chat:'))).toBe(false);
  }
});

test('Dado un parámetro api sin claves de chat, cuando atiende contacto, entonces no exige OPENAI ni conocimiento', async () => {
  const sendEmail = vi.fn(async () => undefined);
  const { OPENAI_API_KEY: _unused, ...apiOnly } = runtimeSecret();
  const api = createApiHandler(managedEnvironment, {
    store: new SimulatedControlStore(),
    sendEmail,
    readParameter: async () => JSON.stringify(apiOnly),
    ...simulatedSubscribers(),
  });
  expect((await api(event('POST', '/api/contact', contactBody))).statusCode).toBe(204);
});
