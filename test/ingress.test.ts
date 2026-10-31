import { test, expect, vi, afterEach } from 'vitest';
import { verifiedVisitorIp, verifyOriginSecret } from '../packages/runtime/src/ingress.js';
import { createApiHandler as createManagedHandler } from '../packages/runtime/src/handlers/api.js';
import { httpEvent } from './fixtures.js';
import { managedEnvironment, runtimeSecret, SimulatedControlStore } from './support/control.js';
afterEach(() => vi.restoreAllMocks());
const secret = 'origin'.repeat(8);
function event(source = '173.245.48.1', visitor = '192.0.2.10') {
  const value = httpEvent('GET', '/api/health');
  value.requestContext.domainName = 'api.matiasgaleano.dev';
  value.requestContext.stage = '$default';
  value.requestContext.http.sourceIp = source;
  value.headers = {
    'cf-connecting-ip': visitor,
    'x-portfolio-origin': secret,
    'x-forwarded-for': '192.0.2.99',
  };
  return value;
}
test('Dada entrada Cloudflare, cuando se verifica el origen y la IP, entonces solo admite el header individual válido', () => {
  expect(verifiedVisitorIp(event())).toBe('192.0.2.10');
  expect(verifiedVisitorIp(event('2606:4700::1', '2001:db8::1'))).toBe('2001:db8::1');
  expect(verifiedVisitorIp(event('192.0.2.1'))).toBeNull();
  expect(verifiedVisitorIp(event(undefined, '192.0.2.1, 192.0.2.2'))).toBeNull();
  expect(verifyOriginSecret(event(), secret)).toBe(true);
  expect(verifyOriginSecret(event(), 'wrong'.repeat(10))).toBe(false);
  expect(verifyOriginSecret(event())).toBe(false);
});
test('Dado dominio definitivo, cuando se falsifica dominio, IP o secreto, entonces rechaza antes de los proveedores', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const readParameter = vi.fn(async () =>
    JSON.stringify({ ...runtimeSecret(), ORIGIN_VERIFY_SECRET: secret }),
  );
  const handler = createManagedHandler(
    { ...managedEnvironment, TRUSTED_CUSTOM_DOMAIN: 'api.matiasgaleano.dev' },
    { readParameter, store: new SimulatedControlStore() },
  );
  expect((await handler(event())).statusCode).toBe(200);
  const direct = event('192.0.2.1');
  expect((await handler(direct)).statusCode).toBe(403);
  const spoofed = event();
  spoofed.headers['x-portfolio-origin'] = 'wrong';
  expect((await handler(spoofed)).statusCode).toBe(403);
  const domain = event();
  domain.requestContext.domainName = 'evil.invalid';
  expect((await handler(domain)).statusCode).toBe(403);
});
test('Dados visitantes diferentes tras un mismo proxy, cuando consumen contacto, entonces conservan cuotas independientes', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const sendEmail = vi.fn(async () => undefined);
  const handler = createManagedHandler(
    { ...managedEnvironment, TRUSTED_CUSTOM_DOMAIN: 'api.matiasgaleano.dev' },
    {
      store: new SimulatedControlStore(),
      sendEmail,
      readParameter: async () =>
        JSON.stringify({ ...runtimeSecret(), ORIGIN_VERIFY_SECRET: secret }),
    },
  );
  function contact(visitor: string) {
    const value = event(undefined, visitor);
    value.requestContext.http.method = 'POST';
    value.rawPath = '/api/contact';
    value.headers['content-type'] = 'application/json';
    value.body = JSON.stringify({
      name: 'Prueba',
      email: 'test@example.invalid',
      message: 'Mensaje de prueba controlado suficientemente largo',
      company: '',
    });
    return value;
  }
  for (let i = 0; i < 5; i++) expect((await handler(contact('192.0.2.1'))).statusCode).toBe(204);
  expect((await handler(contact('192.0.2.1'))).statusCode).toBe(429);
  expect((await handler(contact('192.0.2.2'))).statusCode).toBe(204);
  expect(sendEmail).toHaveBeenCalledTimes(6);
});
