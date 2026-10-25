import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { handler } from './dist/handler.js';
import { createApplication } from './dist/application.js';
import { readConfiguration, readContactConfiguration } from './dist/config.js';
import { createContactSender, createResendProvider } from './dist/contact.js';

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

console.log(
  'Paquete ESM verificado fuera del checkout: dependencias de producción, health/contacto, .env ignorado y red bloqueada.',
);
