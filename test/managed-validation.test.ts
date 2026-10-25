import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { createManagedHandler } from '../src/handler.js';
import {
  createValidationProviders,
  readScenario,
  scenarios,
  validateEnvironment,
  validateSecret,
} from '../src/validation/providers.js';
import { httpEvent } from './fixtures.js';
import { managedEnvironment, runtimeSecret, SimulatedControlStore } from './support/control.js';
const environment = {
  ...managedEnvironment,
  AWS_REGION: 'us-east-1',
  AWS_LAMBDA_FUNCTION_NAME: 'portfolio-api-cloud-test',
  QUOTA_TABLE_NAME: 'portfolio-api-cloud-test-control',
};
const secret = () => ({
  ...runtimeSecret(),
  RESEND_API_KEY: 'validation-only',
  OPENAI_API_KEY: 'validation-only',
});
function event(method: string, path: string, body?: unknown) {
  const e = httpEvent(method, path);
  e.requestContext.domainName = 'local.execute-api.us-east-1.amazonaws.com';
  e.requestContext.stage = '$default';
  e.headers = { 'content-type': 'application/json', 'x-validation-scenario': 'success' };
  if (body) e.body = JSON.stringify(body);
  return e;
}
beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
test('Dado el destino exclusivo de validación, cuando cambia función, región, tabla o secreto, entonces falla antes de componer', () => {
  expect(() => validateEnvironment(environment)).not.toThrow();
  for (const key of [
    'AWS_REGION',
    'AWS_LAMBDA_FUNCTION_NAME',
    'QUOTA_TABLE_NAME',
    'RUNTIME_SECRET_ARN',
    'TRUSTED_API_ID',
  ])
    expect(() =>
      validateEnvironment({ ...environment, [key]: key === 'TRUSTED_API_ID' ? '' : 'production' }),
    ).toThrow();
});
for (const [key, value] of [
  ['RESEND_API_KEY', 're_real'],
  ['OPENAI_API_KEY', 'sk_real'],
  ['CONTACT_FROM_EMAIL', 'from@example.com'],
  ['CONTACT_TO_EMAIL', 'to@example.com'],
  ['PORTFOLIO_CLOUD_API_URL', 'https://real.example.com'],
  ['PORTFOLIO_CLOUD_API_URL', 'https://example.invalid.evil.com'],
  ['PORTFOLIO_CLOUD_API_URL', 'https://user:password@cloud.invalid'],
  ['R2_ENDPOINT', 'https://r2.invalid'],
  ['R2_ACCESS_KEY_ID', 'real'],
] as const)
  test(`Dada configuración ${key}, cuando contiene un destino o credencial incompatible, entonces el doble rechaza antes del negocio (${value})`, () => {
    expect(() => validateSecret({ ...secret(), [key]: value })).toThrow();
  });
test('Dado un escenario ajeno al inventario, cuando se selecciona, entonces falla sin transporte alternativo', async () => {
  expect(() => readScenario('from-header')).toThrow();
  await expect(
    createValidationProviders('success').request('https://example.com', { method: 'POST' }),
  ).rejects.toThrow();
});
for (const scenario of scenarios)
  test(`Dado el escenario ${scenario}, cuando se ejecutan las seis rutas, entonces usa dobles y conserva contratos y reservas`, async () => {
    if (scenario === 'pending-body')
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const store = new SimulatedControlStore();
    const readSecret = vi.fn(async () => JSON.stringify(secret()));
    const providers = createValidationProviders(scenario);
    let notifyStarted = () => undefined as void;
    const sendEmail = vi.fn((email: Parameters<typeof providers.sendEmail>[0]) => {
      const work = providers.sendEmail(email);
      notifyStarted();
      return work;
    });
    const request = vi.fn<typeof fetch>((input, init) => {
      const work = providers.request(input, init);
      if (!String(input).endsWith('/input_tokens')) notifyStarted();
      return work;
    });
    const handler = createManagedHandler(environment, {
      ...providers,
      sendEmail,
      request,
      store,
      readSecret,
    });
    const invoke = async (e: ReturnType<typeof event>) => {
      let entered = false;
      const started = new Promise<void>((resolve) => {
        notifyStarted = () => {
          entered = true;
          resolve();
        };
      });
      const response = handler(e);
      if (scenario === 'pending-body') {
        // Se espera el I/O real del fallback antes de adelantar el deadline simulado.
        await Promise.race([started, response]);
        if (entered) await vi.advanceTimersByTimeAsync(16000);
      }
      return response;
    };
    expect((await invoke(event('GET', '/api/health'))).statusCode).toBe(200);
    expect(readSecret).not.toHaveBeenCalled();
    const contact = await invoke(
      event('POST', '/api/contact', {
        name: 'Prueba',
        email: 'test@example.invalid',
        message: 'Mensaje de validación.',
      }),
    );
    expect(contact.statusCode).toBe(scenario === 'success' ? 204 : 500);
    for (const method of ['POST', 'DELETE'])
      expect(
        (await invoke(event(method, '/api/subscriptions', { email: 'test@example.invalid' })))
          .statusCode,
      ).toBe(scenario === 'success' ? 200 : scenario === 'error' ? 502 : 503);
    expect((await invoke(event('GET', '/api/chat/starters'))).statusCode).toBe(200);
    const reply = await invoke(
      event('POST', '/api/chat', {
        message: 'Compará tu experiencia backend con tu trabajo cloud',
        sessionId: 'fixture',
      }),
    );
    expect(reply.statusCode).toBe(201);
    expect(JSON.parse(reply.body!).source).toBe(scenario === 'success' ? 'ai' : 'fallback');
    expect(store.reservations).toHaveLength(scenario === 'error' ? 0 : 1);
    expect(readSecret).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(scenario === 'error' ? 3 : 4);
  });
test('Dado un secreto renovado con transporte real, cuando vence el snapshot, entonces vuelve a validar y devuelve 503 sin efectos', async () => {
  vi.useFakeTimers();
  let current: Record<string, string> = secret();
  const providers = createValidationProviders('success');
  const sendEmail = vi.fn(providers.sendEmail);
  const handler = createManagedHandler(environment, {
    ...providers,
    sendEmail,
    store: new SimulatedControlStore(),
    readSecret: async () => JSON.stringify(current),
  });
  const e = event('POST', '/api/contact', {
    name: 'Prueba',
    email: 'test@example.invalid',
    message: 'Mensaje de validación.',
  });
  expect((await handler(e)).statusCode).toBe(204);
  current = { ...current, RESEND_API_KEY: 're_real' };
  await vi.advanceTimersByTimeAsync(300_001);
  expect((await handler(e)).statusCode).toBe(503);
  expect(sendEmail).toHaveBeenCalledTimes(1);
});
