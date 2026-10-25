import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { handler } from './dist/handler.js';
import { createApplication } from './dist/application.js';
import {
  readConfiguration,
  readContactConfiguration,
  readSubscriptionConfiguration,
} from './dist/config.js';
import { createContactSender, createResendProvider } from './dist/contact.js';
import { createSubscriptionSender } from './dist/subscriptions.js';

assert.equal(existsSync('node_modules'), true);

for (const name of [
  'typescript',
  'prettier',
  '@nestjs',
  'express',
  'react',
  '@react-email/render',
  '@types/react',
]) {
  assert.equal(existsSync('node_modules/' + name), false);
}

assert.equal(existsSync('.env'), true);
assert.equal(existsSync('LICENSE'), true);
assert.equal(existsSync('NOTICE'), false);
assert.equal(process.env.CORS_ORIGIN, undefined);

const result = await handler({
  version: '2.0',
  rawPath: '/api/health',
  headers: { origin: 'https://dotenv.example.invalid' },
  requestContext: { http: { method: 'GET' } },
  isBase64Encoded: false,
});

assert.equal(result.statusCode, 200);
assert.equal(result.body, '{"status":"ok"}');
assert.equal(result.headers['access-control-allow-origin'], undefined);

const config = readContactConfiguration({
  RESEND_API_KEY: 're_fake',
  CONTACT_FROM_EMAIL: 'from@example.invalid',
  CONTACT_TO_EMAIL: 'to@example.invalid',
});

let calls = 0;
const blockedFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  calls++;
  assert.equal(url, 'https://api.resend.com/emails');
  assert.equal(JSON.parse(options.body).to, config.toEmail);
  return new Response('{"id":"fake"}', { status: 200 });
};

const provider = createResendProvider(config);
const app = createApplication(readConfiguration({}), createContactSender(config, provider));
const event = {
  version: '2.0',
  rawPath: '/api/contact',
  headers: { 'content-type': 'application/json' },
  requestContext: { http: { method: 'POST', sourceIp: '192.0.2.1' } },
  isBase64Encoded: false,
  body: JSON.stringify({
    name: 'Prueba',
    email: 'test@example.com',
    message: 'Mensaje de prueba.',
  }),
};

assert.equal((await app(event)).statusCode, 204);

event.body = JSON.stringify({
  name: 'Prueba',
  email: 'test@example.com',
  message: 'Mensaje de prueba.',
  company: 'ACME',
});

assert.equal((await app(event)).body, '');
assert.equal(calls, 1);

globalThis.fetch = blockedFetch;
assert.equal(
  (
    await handler({
      ...event,
      body: JSON.stringify({
        name: 'Prueba',
        email: 'test@example.com',
        message: 'Mensaje de prueba.',
      }),
    })
  ).statusCode,
  500,
);

const subscriptionConfig = readSubscriptionConfiguration({
  PORTFOLIO_CLOUD_API_URL: ' https://cloud.example.invalid/base/// ',
});
const subscriptionCalls = [];
const subscriptions = createApplication(
  readConfiguration({}),
  undefined,
  createSubscriptionSender(subscriptionConfig, async (url, options) => {
    subscriptionCalls.push(options.method);
    assert.equal(url, 'https://cloud.example.invalid/base/subscriptions');
    assert.equal(options.body, '{"email":"test@example.com"}');
    return new Response('{"message":"ok","email":"test@example.com"}');
  }),
);

for (const method of ['POST', 'DELETE']) {
  const subscriptionEvent = {
    ...event,
    rawPath: '/api/subscriptions',
    requestContext: { http: { method, sourceIp: '192.0.2.2' } },
    body: '{"email":" TEST@Example.com "}',
  };
  const response = await subscriptions(subscriptionEvent);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body, '{"message":"ok","email":"test@example.com"}');
  assert.equal(response.headers['x-ratelimit-remaining'], '9');
  assert.equal((await handler(subscriptionEvent)).statusCode, 500);

  for (let index = 1; index < 10; index++)
    assert.equal((await subscriptions(subscriptionEvent)).statusCode, 200);
  assert.equal((await subscriptions(subscriptionEvent)).statusCode, 429);
}
assert.equal(subscriptionCalls.filter((method) => method === 'POST').length, 10);
assert.equal(subscriptionCalls.filter((method) => method === 'DELETE').length, 10);
await assert.rejects(fetch('https://example.invalid'), /Red y proveedores reales bloqueados/);

console.log(
  'Paquete ESM verificado fuera del checkout: dependencias de producción, health/contacto/suscripciones, cuotas, .env ignorado y red bloqueada.',
);
