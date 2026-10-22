import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApplication } from '../src/application.js';
import { readConfiguration } from '../src/config.js';
import { handler } from '../src/handler.js';
import { httpEvent } from './fixtures.js';

const application = createApplication(readConfiguration({}));

test('health conserva el contrato 200 y los headers funcionales sin proveedores', async () => {
  const result = await handler(httpEvent());
  assert.equal(result.statusCode, 200);
  assert.equal(result.body, '{"status":"ok"}');
  assert.equal(result.isBase64Encoded, false);
  assert.deepEqual(result.headers, {
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer', 'content-type': 'application/json; charset=utf-8',
  });
});

test('rawPath define la ruta sin duplicar stage ni incorporar query', () => {
  const event = httpEvent();
  event.requestContext.http.path = '/test/api/health';
  event.rawQueryString = 'ignored=true';
  assert.equal(application(event).statusCode, 200);
  assert.equal(application(httpEvent('GET', '/test/api/health')).statusCode, 404);
});

test('conserva barra final, mayúsculas y HEAD del routing original', () => {
  assert.equal(application(httpEvent('GET', '/API/HEALTH/')).statusCode, 200);
  const result = application(httpEvent('HEAD'));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body, '');
});

test('health no comparte estado ni impone cuotas entre invocaciones', () => {
  for (let index = 0; index < 100; index++) {
    const result = application(httpEvent());
    assert.equal(result.body, '{"status":"ok"}');
    if (result.headers) result.headers['x-mutated'] = 'true';
  }
  assert.equal(application(httpEvent()).headers?.['x-mutated'], undefined);
});

for (const [method, path] of [
  ['POST', '/api/contact'], ['GET', '/api/chat/starters'], ['POST', '/api/chat'],
  ['POST', '/api/subscriptions'], ['DELETE', '/api/subscriptions'], ['POST', '/api/health'],
  ['GET', '/health'], ['GET', '/api/health/extra'],
]) {
  test(`ruta pendiente o desconocida devuelve 404: ${method} ${path}`, () => {
    const result = application(httpEvent(method, path));
    assert.equal(result.statusCode, 404);
    assert.deepEqual(JSON.parse(result.body ?? ''), {
      message: `Cannot ${method} ${path}`, error: 'Not Found', statusCode: 404,
    });
  });
}

test('rechaza versión de evento no soportada sin éxito ficticio', () => {
  const event = httpEvent();
  event.version = '1.0';
  assert.equal(application(event).statusCode, 400);
});

test('JSON válido de 16 KiB se acepta; un byte adicional devuelve 413', () => {
  const event = httpEvent();
  event.headers['content-type'] = 'application/json; charset=utf-8';
  // Un array de espacios permite fijar el tamaño sin agregar datos de negocio.
  event.body = '[' + ' '.repeat(16382) + ']';
  assert.equal(Buffer.byteLength(event.body), 16384);
  assert.equal(application(event).statusCode, 200);
  event.body = '[' + ' '.repeat(16383) + ']';
  assert.equal(application(event).statusCode, 413);
});

test('límite UTF-8 mide bytes decodificados también en base64', () => {
  const event = httpEvent();
  event.headers['content-type'] = 'application/json';
  const exact = JSON.stringify({ text: 'á'.repeat(8186) + 'a' });
  assert.equal(Buffer.byteLength(exact), 16384);
  event.isBase64Encoded = true;
  event.body = Buffer.from(exact).toString('base64');
  assert.equal(application(event).statusCode, 200);
  event.body = Buffer.from(exact + ' ').toString('base64');
  assert.equal(application(event).statusCode, 413);
});

test('urlencoded conserva el límite de 16 KiB', () => {
  const event = httpEvent();
  event.headers['content-type'] = 'application/x-www-form-urlencoded';
  event.body = 'key=' + 'a'.repeat(16380);
  assert.equal(application(event).statusCode, 200);
  event.body += 'a';
  assert.equal(application(event).statusCode, 413);
});

for (const body of ['{', 'null', '"text"', '123']) {
  test(`JSON inválido o primitivo se rechaza: ${body}`, () => {
    const event = httpEvent();
    event.headers['content-type'] = 'application/json';
    event.body = body;
    assert.equal(application(event).statusCode, 400);
  });
}

test('CORS incluye origen permitido y Vary tanto en éxito como error', () => {
  const app = createApplication(readConfiguration({ CORS_ORIGIN: 'https://frontend.example.invalid' }));
  for (const path of ['/api/health', '/missing']) {
    const event = httpEvent('GET', path);
    event.headers.origin = 'https://frontend.example.invalid';
    const result = app(event);
    assert.equal(result.headers?.['access-control-allow-origin'], event.headers.origin);
    assert.equal(result.headers?.vary, 'Origin');
  }
});

test('CORS no refleja un origen no listado; wildcard refleja el origen recibido', () => {
  const event = httpEvent();
  event.headers.origin = 'https://visitor.example.invalid';
  const denied = createApplication(readConfiguration({ CORS_ORIGIN: 'https://frontend.example.invalid' }))(event);
  assert.equal(denied.headers?.['access-control-allow-origin'], undefined);
  assert.equal(denied.headers?.vary, 'Origin');
  const reflected = createApplication(readConfiguration({ CORS_ORIGIN: '*' }))(event);
  assert.equal(reflected.headers?.['access-control-allow-origin'], event.headers.origin);
});

test('preflight termina en 204 vacío antes de los headers de seguridad como en origen', () => {
  const event = httpEvent('OPTIONS');
  event.headers.origin = 'https://frontend.example.invalid';
  const result = createApplication(readConfiguration({ CORS_ORIGIN: '*' }))(event);
  assert.equal(result.statusCode, 204);
  assert.equal(result.body, '');
  assert.equal(result.headers?.['access-control-allow-methods'], 'GET,POST,DELETE,OPTIONS');
  assert.equal(result.headers?.['access-control-allow-headers'], 'Content-Type');
  assert.equal(result.headers?.['x-frame-options'], undefined);
  assert.equal(application(event).statusCode, 404);
});
