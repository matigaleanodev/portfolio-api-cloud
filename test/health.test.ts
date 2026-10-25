import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createApplication } from '../src/application.js';
import { readConfiguration } from '../src/config.js';
import { handler } from '../src/handler.js';
import { httpEvent } from './fixtures.js';

const application = createApplication(readConfiguration({}));

test('Dado el servicio sin proveedores, cuando se consulta health, entonces responde 200 con estado ok y headers de seguridad', async () => {
  const result = await handler(httpEvent());
  assert.equal(result.statusCode, 200);
  assert.equal(result.body, '{"status":"ok"}');
  assert.equal(result.isBase64Encoded, false);
  assert.deepEqual(result.headers, {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'content-type': 'application/json; charset=utf-8',
  });
});

test('Dado un evento con stage y query, cuando se resuelve health, entonces se utiliza rawPath sin duplicar el prefijo', async () => {
  const event = httpEvent();
  event.requestContext.http.path = '/test/api/health';
  event.rawQueryString = 'ignored=true';
  assert.equal((await application(event)).statusCode, 200);
  assert.equal((await application(httpEvent('GET', '/test/api/health'))).statusCode, 404);
});

test('Dada la ruta health, cuando cambia el uso de mayúsculas, barra final o método HEAD, entonces conserva el contrato', async () => {
  assert.equal((await application(httpEvent('GET', '/API/HEALTH/'))).statusCode, 200);
  const result = await application(httpEvent('HEAD'));
  assert.equal(result.statusCode, 200);
  assert.equal(result.body, '');
});

test('Dadas invocaciones sucesivas de health, cuando se modifica una respuesta, entonces las siguientes permanecen independientes y sin cuota', async () => {
  for (let index = 0; index < 100; index++) {
    const result = await application(httpEvent());
    assert.equal(result.body, '{"status":"ok"}');
    if (result.headers) result.headers['x-mutated'] = 'true';
  }
  assert.equal((await application(httpEvent())).headers?.['x-mutated'], undefined);
});

for (const [method, path] of [
  ['GET', '/api/chat/starters'],
  ['POST', '/api/chat'],
  ['POST', '/api/subscriptions'],
  ['DELETE', '/api/subscriptions'],
  ['POST', '/api/health'],
  ['GET', '/health'],
  ['GET', '/api/health/extra'],
]) {
  test(`Dada una ruta pendiente o no admitida, cuando se solicita ${method} ${path}, entonces responde 404 con el error esperado`, async () => {
    const result = await application(httpEvent(method, path));
    assert.equal(result.statusCode, 404);
    assert.deepEqual(JSON.parse(result.body ?? ''), {
      message: `Cannot ${method} ${path}`,
      error: 'Not Found',
      statusCode: 404,
    });
  });
}

test('Dado un evento de versión no soportada, cuando ingresa a la aplicación, entonces responde 400', async () => {
  const event = httpEvent();
  event.version = '1.0';
  assert.equal((await application(event)).statusCode, 400);
});

test('Dado un cuerpo JSON, cuando alcanza 16 KiB o supera el límite por un byte, entonces responde 200 o 413 respectivamente', async () => {
  const event = httpEvent();
  event.headers['content-type'] = 'application/json; charset=utf-8';
  // Un array de espacios permite fijar el tamaño sin agregar datos de negocio.
  event.body = '[' + ' '.repeat(16382) + ']';
  assert.equal(Buffer.byteLength(event.body), 16384);
  assert.equal((await application(event)).statusCode, 200);
  event.body = '[' + ' '.repeat(16383) + ']';
  assert.equal((await application(event)).statusCode, 413);
});

test('Dado un cuerpo UTF-8 en base64, cuando se evalúa su tamaño, entonces aplica el límite sobre los bytes decodificados', async () => {
  const event = httpEvent();
  event.headers['content-type'] = 'application/json';
  const exact = JSON.stringify({ text: 'á'.repeat(8186) + 'a' });
  assert.equal(Buffer.byteLength(exact), 16384);
  event.isBase64Encoded = true;
  event.body = Buffer.from(exact).toString('base64');
  assert.equal((await application(event)).statusCode, 200);
  event.body = Buffer.from(exact + ' ').toString('base64');
  assert.equal((await application(event)).statusCode, 413);
});

test('Dado un formulario URL encoded, cuando supera los 16 KiB, entonces responde 413', async () => {
  const event = httpEvent();
  event.headers['content-type'] = 'application/x-www-form-urlencoded';
  event.body = 'key=' + 'a'.repeat(16380);
  assert.equal((await application(event)).statusCode, 200);
  event.body += 'a';
  assert.equal((await application(event)).statusCode, 413);
});

for (const body of ['{', 'null', '"text"', '123']) {
  test(`Dado un JSON inválido o primitivo (${body}), cuando se procesa el cuerpo, entonces responde 400`, async () => {
    const event = httpEvent();
    event.headers['content-type'] = 'application/json';
    event.body = body;
    assert.equal((await application(event)).statusCode, 400);
  });
}

test('Dado un origen permitido, cuando la respuesta es exitosa o de error, entonces incluye el origen y Vary', async () => {
  const app = createApplication(
    readConfiguration({ CORS_ORIGIN: 'https://frontend.example.invalid' }),
  );
  for (const path of ['/api/health', '/missing']) {
    const event = httpEvent('GET', path);
    event.headers.origin = 'https://frontend.example.invalid';
    const result = await app(event);
    assert.equal(result.headers?.['access-control-allow-origin'], event.headers.origin);
    assert.equal(result.headers?.vary, 'Origin');
  }
});

test('Dado un origen visitante, cuando se usa una lista o comodín CORS, entonces solo se refleja según la configuración', async () => {
  const event = httpEvent();
  event.headers.origin = 'https://visitor.example.invalid';
  const denied = await createApplication(
    readConfiguration({ CORS_ORIGIN: 'https://frontend.example.invalid' }),
  )(event);
  assert.equal(denied.headers?.['access-control-allow-origin'], undefined);
  assert.equal(denied.headers?.vary, 'Origin');
  const reflected = await createApplication(readConfiguration({ CORS_ORIGIN: '*' }))(event);
  assert.equal(reflected.headers?.['access-control-allow-origin'], event.headers.origin);
});

test('Dado un preflight permitido, cuando se procesa OPTIONS, entonces responde 204 vacío con los headers CORS del contrato', async () => {
  const event = httpEvent('OPTIONS');
  event.headers.origin = 'https://frontend.example.invalid';
  const result = await createApplication(readConfiguration({ CORS_ORIGIN: '*' }))(event);
  assert.equal(result.statusCode, 204);
  assert.equal(result.body, '');
  assert.equal(result.headers?.['access-control-allow-methods'], 'GET,POST,DELETE,OPTIONS');
  assert.equal(result.headers?.['access-control-allow-headers'], 'Content-Type');
  assert.equal(result.headers?.['x-frame-options'], undefined);
  assert.equal((await application(event)).statusCode, 404);
});
