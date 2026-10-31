import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createApiHandler } from '../packages/runtime/src/handlers/api.js';
import { createChatHandler } from '../packages/runtime/src/handlers/chat.js';
import { httpEvent } from './fixtures.js';
import {
  chatEnvironment,
  managedEnvironment,
  runtimeSecret,
  SimulatedControlStore,
  simulatedSubscribers,
} from './support/control.js';

// Contratos sobre los handlers administrados (ingress + cadena Middy + composición por función),
// con dobles solo en DynamoDB, SSM, Resend, OpenAI y R2. Las rutas canónicas de chat van a la
// función chat y las variantes a api, como enruta el HTTP API.

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
afterEach(() => vi.restoreAllMocks());

const origin = 'https://frontend.example.invalid';
const contactBody = {
  name: 'Prueba',
  email: 'test@example.invalid',
  message: 'Mensaje controlado suficientemente largo',
};
const project = '¿Qué hace Modo Playa?';

function event(method: string, path: string, body?: unknown, ip = '192.0.2.1') {
  const value = httpEvent(method, path);
  value.requestContext.domainName = 'local.execute-api.us-east-1.amazonaws.com';
  value.requestContext.stage = '$default';
  value.requestContext.http.sourceIp = ip;
  value.headers = { 'content-type': 'application/json', origin };
  if (body !== undefined) value.body = JSON.stringify(body);
  return value;
}

function compose() {
  const store = new SimulatedControlStore();
  const sendEmail = vi.fn(async () => undefined);
  const subscribers = simulatedSubscribers();
  const request = vi.fn<typeof fetch>(async (url) => {
    if (String(url).endsWith('/input_tokens'))
      return new Response(JSON.stringify({ input_tokens: 1200 }));
    return new Response(
      JSON.stringify({
        status: 'completed',
        model: 'gpt-6-luna',
        usage: { input_tokens: 100, output_tokens: 50 },
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({ answer: 'Respuesta simulada', suggestedQuestions: [] }),
              },
            ],
          },
        ],
      }),
    );
  });
  const deps = {
    store,
    sendEmail,
    request,
    readParameter: async () => JSON.stringify(runtimeSecret()),
    ...subscribers,
  };
  const paid = () =>
    request.mock.calls.filter(([url]) => String(url) === 'https://api.openai.com/v1/responses');
  return {
    store,
    sendEmail,
    paid,
    storage: subscribers.storage,
    api: createApiHandler(managedEnvironment, deps),
    chat: createChatHandler(chatEnvironment, deps),
  };
}

test('Dado el handler api, cuando llegan contacto válido, honeypot e inválido, entonces consume cuota antes del DTO y responde 429 al sexto', async () => {
  const { api, sendEmail } = compose();
  const statuses: number[] = [];
  for (const body of [
    contactBody,
    { ...contactBody, company: 'bot' },
    { ...contactBody, email: 'no-es-mail' },
    contactBody,
    contactBody,
    contactBody,
  ])
    statuses.push((await api(event('POST', '/api/contact', body))).statusCode!);
  expect(statuses).toEqual([204, 204, 400, 204, 204, 429]);
  expect(sendEmail).toHaveBeenCalledTimes(3);
  const blocked = await api(event('POST', '/api/contact', contactBody));
  expect(blocked.statusCode).toBe(429);
  expect(blocked.headers).toMatchObject({
    'retry-after': expect.stringMatching(/^\d+$/),
    'access-control-allow-origin': origin,
    'x-request-id': expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(JSON.parse(blocked.body!)).toEqual({
    statusCode: 429,
    message: 'ThrottlerException: Too Many Requests',
  });
});

test('Dadas ambas funciones, cuando un visitante alterna chat canónico y variante, entonces el límite diario de IA (5) y el presupuesto son únicos', async () => {
  const { api, chat, store, paid } = compose();
  const sources: string[] = [];
  for (let index = 0; index < 7; index++) {
    const handler = index % 2 ? api : chat;
    const path = index % 2 ? '/api/chat/' : '/api/chat';
    const result = await handler(event('POST', path, { message: `${project} (${index})` }));
    expect(result.statusCode).toBe(201);
    sources.push(JSON.parse(result.body!).source);
  }
  expect(sources).toEqual(['ai', 'ai', 'ai', 'ai', 'ai', 'fallback', 'fallback']);
  expect(paid()).toHaveLength(5);
  expect(store.reservations).toHaveLength(5);
  const keys = [...store.records.keys()];
  expect(keys.filter((key) => key.startsWith('ai:budget:'))).toHaveLength(1);
  expect(keys.filter((key) => key.startsWith('ai:visitor:'))).toHaveLength(1);
  const visitor = keys.find((key) => key.startsWith('ai:visitor:'))!;
  expect(store.records.get(visitor)!.used).toBe(5);
});

test('Dada una reserva monetaria rechazada, cuando chat o su variante necesitan IA, entonces responden fallback sin llamada paga', async () => {
  const { api, chat, store, paid } = compose();
  store.rejectReservations = true;
  for (const [handler, path] of [
    [chat, '/api/chat'],
    [api, '/API/CHAT'],
  ] as const) {
    const result = await handler(event('POST', path, { message: project }));
    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body!).source).toBe('fallback');
  }
  expect(paid()).toHaveLength(0);
  expect(store.reservations).toHaveLength(0);
});

test('Dada la cuota de chat consumida por api (variante), cuando chat atiende la canónica, entonces ve el mismo contador y bloquea en el 21', async () => {
  const { api, chat } = compose();
  const faq = { message: '¿Dónde trabajás actualmente?' };
  for (let index = 0; index < 20; index++)
    expect((await api(event('POST', '/API/CHAT/', faq))).statusCode).toBe(201);
  const blocked = await chat(event('POST', '/api/chat', faq));
  expect(blocked.statusCode).toBe(429);
  expect(blocked.headers?.['retry-after']).toBe('60');
  // Otra IP no comparte contador.
  expect((await chat(event('POST', '/api/chat', faq, '192.0.2.2'))).statusCode).toBe(201);
});

test('Dadas alta y baja por el handler api, cuando DELETE trae body, entonces persiste y elimina la clave normalizada con los mensajes heredados', async () => {
  const { api, storage } = compose();
  const send = async (method: string, body?: unknown) => {
    const result = await api(event(method, '/api/subscriptions', body));
    return [result.statusCode, result.body ? JSON.parse(result.body) : undefined];
  };
  expect(await send('POST', { email: ' Lector@Example.COM ' })).toEqual([
    200,
    { message: 'Subscribed successfully', email: 'lector@example.com' },
  ]);
  expect([...storage.objects.keys()]).toEqual(['subscribers/subscribers/lector@example.com.json']);
  expect(await send('POST', { email: 'lector@example.com' })).toEqual([
    200,
    { message: 'Already subscribed' },
  ]);
  expect(await send('DELETE', { email: 'lector@example.com' })).toEqual([
    200,
    { message: 'Unsubscribed successfully', email: 'lector@example.com' },
  ]);
  expect(storage.objects.size).toBe(0);
  expect(await send('DELETE', { email: 'lector@example.com' })).toEqual([
    200,
    { message: 'Already unsubscribed' },
  ]);
  const [status] = await send('DELETE');
  expect(status).toBe(400);
});

test('Dado HEAD a una ruta inexistente, cuando responde 404, entonces omite el cuerpo y conserva content-type', async () => {
  const { api } = compose();
  const result = await api(event('HEAD', '/api/unknown'));
  expect(result.statusCode).toBe(404);
  expect(result.body).toBe('');
  expect(result.headers?.['content-type']).toBe('application/json; charset=utf-8');
});
