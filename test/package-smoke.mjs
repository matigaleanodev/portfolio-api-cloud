import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { handler } from './dist/handler.js';

assert.equal(existsSync('node_modules'), false);
assert.equal(existsSync('.env'), true);
assert.equal(process.env.CORS_ORIGIN, undefined);
const result = await handler({
  version: '2.0', rawPath: '/api/health', headers: { origin: 'https://dotenv.example.invalid' },
  requestContext: { http: { method: 'GET' } }, isBase64Encoded: false,
});
assert.equal(result.statusCode, 200);
assert.equal(result.body, '{"status":"ok"}');
assert.equal(result.headers['access-control-allow-origin'], undefined);
console.log('Paquete ESM verificado fuera del checkout, sin node_modules, .env ignorado y red bloqueada.');
