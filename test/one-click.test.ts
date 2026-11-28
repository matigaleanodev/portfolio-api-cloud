import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createApiHandler } from '../packages/runtime/src/handlers/api.js';
import { useTestClock } from './support/clock.js';
import {
  managedEnvironment,
  runtimeSecret,
  SimulatedControlStore,
  simulatedSubscribers,
} from './support/control.js';
import { httpEvent } from './fixtures.js';

const email = 'lector@example.com';
let logs: string[];
useTestClock();

beforeEach(() => {
  logs = [];
  for (const level of ['info', 'error', 'warn', 'log'] as const)
    vi.spyOn(console, level).mockImplementation((...values: unknown[]) => {
      logs.push(values.map(String).join(' '));
    });
});

async function setup() {
  const subscribers = simulatedSubscribers();
  const handler = createApiHandler(managedEnvironment, {
    readParameter: async () => JSON.stringify(runtimeSecret()),
    store: new SimulatedControlStore(),
    subscribers: subscribers.subscribers,
  });
  const store = subscribers.subscribers({
    endpoint: 'https://r2.example.invalid',
    region: 'auto',
    bucket: 'subscribers',
    accessKeyId: 'fake',
    secretAccessKey: 'fake',
  }) as import('../packages/runtime/src/subscriptions/store.js').SubscriberStore;
  await store.createSubscriber(email);
  const token = (await store.ensureUnsubscribeId(email))!;
  const call = (
    method: string,
    options: { token?: string | null; body?: string; type?: string; base64?: boolean } = {},
  ) => {
    const value = options.token === undefined ? token : options.token;
    const event = httpEvent(method, '/api/subscriptions/one-click');
    event.rawQueryString = value === null ? '' : `t=${value}`;
    event.requestContext.domainName = 'local.execute-api.us-east-1.amazonaws.com';
    event.requestContext.stage = '$default';
    event.headers = {
      'content-type': options.type ?? 'application/x-www-form-urlencoded',
    };
    const body = options.body ?? 'List-Unsubscribe=One-Click';
    event.body = options.base64 ? Buffer.from(body).toString('base64') : body;
    event.isBase64Encoded = Boolean(options.base64);
    return handler(event);
  };
  return { call, store, token, storage: subscribers.storage };
}

const multipart = (name: string, value: string) =>
  `--XyZ\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n--XyZ--\r\n`;
const done = JSON.stringify({ message: 'Unsubscribed' });

describe('baja en un clic (RFC 8058)', () => {
  test('POST urlencoded sin cookies da de baja sin redirigir y es idempotente', async () => {
    const { call, store } = await setup();
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await call('POST');
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(done);
      expect(response.headers).not.toHaveProperty('location');
      expect(response.headers).not.toHaveProperty('set-cookie');
    }
    expect(await store.subscriberExists(email)).toBe(false);
  });

  test.each([false, true])('acepta multipart/form-data (base64: %s)', async (base64) => {
    const { call, store } = await setup();
    const response = await call('POST', {
      type: 'multipart/form-data; boundary=XyZ',
      body: multipart('List-Unsubscribe', 'One-Click'),
      base64,
    });
    expect(response.statusCode).toBe(200);
    expect(await store.subscriberExists(email)).toBe(false);
  });

  test('un token bien formado pero desconocido responde igual y no borra', async () => {
    const { call, store } = await setup();
    const response = await call('POST', { token: 'A'.repeat(43) });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(done);
    expect(await store.subscriberExists(email)).toBe(true);
  });

  test.each([
    ['sin token', { token: null }],
    ['token corto', { token: 'abc' }],
    ['token con ruta', { token: `../${'a'.repeat(40)}` }],
    ['token repetido', { token: `${'a'.repeat(43)}&t=${'b'.repeat(43)}` }],
    ['sin campo', { body: '' }],
    ['otro valor', { body: 'List-Unsubscribe=Otro' }],
    ['texto plano', { type: 'text/plain' }],
    ['json', { type: 'application/json', body: '{"List-Unsubscribe":"One-Click"}' }],
    [
      'multipart ajeno',
      { type: 'multipart/form-data; boundary=XyZ', body: multipart('otro', 'One-Click') },
    ],
  ])('rechaza con 400 y sin mutar: %s', async (_name, options) => {
    const { call, store } = await setup();
    expect((await call('POST', options)).statusCode).toBe(400);
    expect(await store.subscriberExists(email)).toBe(true);
  });

  test.each(['GET', 'HEAD'])('%s nunca da de baja y deriva al flujo manual', async (method) => {
    const { call, store, storage } = await setup();
    const before = storage.commands.length;
    const response = await call(method);
    expect(response.statusCode).toBe(303);
    expect(response.headers!.location).toBe('https://matiasgaleano.dev/blog/unsubscribe');
    expect(storage.commands.length).toBe(before);
    expect(await store.subscriberExists(email)).toBe(true);
  });

  test('un fallo de almacenamiento nunca simula éxito', async () => {
    const { call, storage } = await setup();
    storage.failure = new Error(`R2 down ${email}`);
    expect((await call('POST')).statusCode).toBe(502);
  });

  test('no registra token ni correo', async () => {
    const { call, token } = await setup();
    await call('POST');
    expect(logs.join('\n')).not.toContain(token);
    expect(logs.join('\n')).not.toContain(email);
  });

  test('la cuota propia no consume la de la baja manual y limita abusos', async () => {
    const { call } = await setup();
    let last = 200;
    for (let attempt = 0; attempt < 61; attempt++) last = (await call('POST')).statusCode!;
    expect(last).toBe(429);
  });
});
