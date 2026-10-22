import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:https';
import { connect } from 'node:net';
import { connect as tlsConnect } from 'node:tls';
import { createSocket } from 'node:dgram';
import { lookup } from 'node:dns/promises';
import { execSync } from 'node:child_process';
import { createApplication } from '../src/application.js';
import { readConfiguration } from '../src/config.js';
import { handler } from '../src/handler.js';
import { httpEvent } from './fixtures.js';

test('configuración explícita conserva normalización de CORS y no requiere credenciales', () => {
  assert.deepEqual(readConfiguration({}), { corsOrigins: false });
  assert.deepEqual(readConfiguration({ CORS_ORIGIN: '  ' }), { corsOrigins: false });
  assert.deepEqual(readConfiguration({ CORS_ORIGIN: ' * ' }), { corsOrigins: true });
  assert.deepEqual(readConfiguration({ CORS_ORIGIN: ' https://a.invalid, , https://b.invalid ' }), {
    corsOrigins: ['https://a.invalid', 'https://b.invalid'],
  });
  assert.deepEqual(readConfiguration({ CORS_ORIGIN: ' , ' }), { corsOrigins: false });
});

test('composiciones independientes capturan su configuración sin leer el ambiente global', () => {
  const env = { CORS_ORIGIN: 'https://a.invalid' };
  const app = createApplication(readConfiguration(env));
  env.CORS_ORIGIN = 'https://b.invalid';
  const event = httpEvent();
  event.headers.origin = 'https://a.invalid';
  assert.equal(app(event).headers?.['access-control-allow-origin'], event.headers.origin);
  const other = createApplication(readConfiguration(env));
  assert.equal(other(event).headers?.['access-control-allow-origin'], undefined);
});

test('handler importa y responde sin configuración ni proveedores reales', async () => {
  assert.equal(process.env.RESEND_API_KEY, undefined);
  assert.equal(process.env.OPENAI_API_KEY, undefined);
  assert.equal(process.env.PORTFOLIO_CLOUD_API_URL, undefined);
  assert.equal(process.env.CORS_ORIGIN, undefined);
  assert.equal((await handler(httpEvent())).statusCode, 200);
});

test('cerco de red bloquea fetch, HTTPS, sockets, TLS, UDP, DNS y procesos hijos', async () => {
  const blocked = /Red y proveedores reales bloqueados/;
  await assert.rejects(fetch('https://example.invalid'), blocked);
  assert.throws(() => request('https://example.invalid'), blocked);
  assert.throws(() => connect(443, 'example.invalid'), blocked);
  assert.throws(() => tlsConnect(443, 'example.invalid'), blocked);
  assert.throws(() => createSocket('udp4'), blocked);
  assert.throws(() => lookup('example.invalid'), blocked);
  assert.throws(() => execSync('echo inesperado'), blocked);
});

test('lista CORS sin orígenes deshabilita preflight igual que en origen', () => {
  const app = createApplication(readConfiguration({ CORS_ORIGIN: ' , ' }));
  const event = httpEvent('OPTIONS');
  event.headers.origin = 'https://example.invalid';
  const result = app(event);
  assert.equal(result.statusCode, 404);
  assert.equal(result.headers?.vary, undefined);
  assert.equal(result.headers?.['access-control-allow-origin'], undefined);
});