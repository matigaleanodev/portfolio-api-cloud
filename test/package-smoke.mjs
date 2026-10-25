import { ChatKnowledgeRepository } from './dist/chat/chat-knowledge.repository.js';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { createChat } from './dist/chat/chat.providers.js';
import { handler } from './dist/handler.js';
import { createApplication } from './dist/application.js';
import {
  readConfiguration,
  readContactConfiguration,
  readSubscriptionConfiguration,
} from './dist/config.js';
import { createContactSender, createResendProvider } from './dist/contact.js';
import { createSubscriptionSender } from './dist/subscriptions.js';

// Las métricas se prueban en Vitest; el smoke solo muestra su resultado final.
console.info = () => undefined;

assert.equal(existsSync('node_modules'), true);
assert.equal(existsSync('dist/validation'), false);
assert.equal(existsSync('validation.json'), false);

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
  requestContext: { http: { method: 'GET', sourceIp: '192.0.2.1' } },
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
  503,
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
  assert.equal((await handler(subscriptionEvent)).statusCode, 503);

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

assert.equal(existsSync('node_modules/reflect-metadata'), true);
assert.equal(existsSync('node_modules/@aws-sdk/client-s3'), true);

const chatEvent = {
  ...event,
  rawPath: '/api/chat',
  requestContext: { http: { method: 'POST', sourceIp: '192.0.2.3' } },
  body: '{"message":"¿Qué hace Modo Playa?"}',
};
assert.equal(
  (
    await handler({
      ...chatEvent,
      rawPath: '/api/chat/starters',
      requestContext: { http: { method: 'GET', sourceIp: '192.0.2.3' } },
    })
  ).statusCode,
  503,
);
assert.equal((await handler(chatEvent)).statusCode, 503);

const knowledge = {
  generatedAt: '2026-10-09T00:00:00Z',
  projects: [{ slug: 'modo-playa', title: 'Modo Playa', excerpt: 'Alojamientos de prueba.' }],
  posts: [],
};
mkdirSync('.generated/chat', { recursive: true });
writeFileSync('.generated/chat/knowledge.json', JSON.stringify(knowledge));

let chatCalls = 0;
const chat = createChat(
  { OPENAI_API_KEY: 'fake' },
  async (url, options) => {
    chatCalls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const payload = JSON.parse(options.body);
    assert.equal(payload.model, 'gpt-4.1-mini');
    assert.ok(payload.input[0].content.includes('Alojamientos de prueba.'));
    return new Response(
      JSON.stringify({
        output: [
          {
            content: [
              {
                text: JSON.stringify({
                  answer: 'Respuesta de prueba',
                  suggestedQuestions: ['Primera', 'Segunda'],
                }),
              },
            ],
          },
        ],
      }),
    );
  },
  process.cwd(),
);
const chatApplication = createApplication(readConfiguration({}), undefined, undefined, chat);
for (let index = 0; index < 20; index++) {
  const response = await chatApplication(chatEvent);
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).source, 'ai');
}
assert.equal(chatCalls, 1);
assert.equal((await chatApplication(chatEvent)).statusCode, 429);
assert.equal(
  (
    await chatApplication({
      ...chatEvent,
      rawPath: '/api/chat/starters',
      requestContext: { http: { method: 'GET', sourceIp: '192.0.2.3' } },
    })
  ).statusCode,
  200,
);

const originalSend = S3Client.prototype.send;
let r2Calls = 0;
S3Client.prototype.send = async function (command) {
  r2Calls++;
  assert.ok(command instanceof GetObjectCommand);
  assert.deepEqual(command.input, { Bucket: 'fake', Key: 'artifacts/chat/knowledge.json' });
  return {
    Body: {
      transformToString: async () =>
        JSON.stringify({
          version: 1,
          generatedAt: knowledge.generatedAt,
          source: { repository: 'portfolio', artifactPath: '.generated/chat/knowledge.json' },
          contentHash:
            'sha256:' + createHash('sha256').update(JSON.stringify(knowledge)).digest('hex'),
          knowledge,
        }),
    },
  };
};
try {
  const remoteChat = createChat(
    {
      R2_ENDPOINT: 'https://r2.example.invalid',
      R2_BUCKET: 'fake',
      R2_ACCESS_KEY_ID: 'fake',
      R2_SECRET_ACCESS_KEY: 'fake',
    },
    blockedFetch,
    process.cwd(),
  );
  assert.equal((await remoteChat.reply({ message: '¿Qué hace Modo Playa?' })).source, 'fallback');
  assert.equal(r2Calls, 1);
} finally {
  S3Client.prototype.send = originalSend;
}

console.log(
  'Chat empaquetado: 201/503, cachés, cuotas independientes, fallback sintético, SDK S3 simulado y sin red.',
);

assert.equal(existsSync('fallback/chat-knowledge.v1.json'), true);
const packagedKnowledge = await new ChatKnowledgeRepository(
  null,
  null,
  process.cwd(),
  true,
).getKnowledge();
assert.ok(packagedKnowledge.projects.some((project) => project.slug === 'foodly-notes'));
assert.ok(packagedKnowledge.projects.some((project) => project.slug === 'modo-playa'));
assert.deepEqual(packagedKnowledge.posts, []);
console.log('Fallback real versionado, integridad y lectura en frío verificados desde el paquete.');
