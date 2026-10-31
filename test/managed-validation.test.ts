import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { createApiHandler } from '../packages/runtime/src/handlers/api.js';
import { createChatHandler } from '../packages/runtime/src/handlers/chat.js';
import {
  createValidationProviders,
  readScenario,
  scenarios,
  validateConfiguration,
  validateEnvironment,
} from '../packages/runtime/src/validation/providers.js';
import { httpEvent } from './fixtures.js';
import {
  managedEnvironment,
  productionParameter,
  runtimeSecret,
  SimulatedControlStore,
} from './support/control.js';
const environment = {
  ...managedEnvironment,
  AWS_REGION: 'us-east-1',
  AWS_LAMBDA_FUNCTION_NAME: 'portfolio-api-cloud-test',
  QUOTA_TABLE_NAME: 'portfolio-api-cloud-test-control',
  RUNTIME_PARAMETER_NAME: '/portfolio/validation/api',
  CHAT_PARAMETER_NAME: '/portfolio/validation/chat',
  AI_DAILY_BUDGET_MICROUSD: '1000',
};
const chatEnvironment = {
  ...environment,
  AWS_LAMBDA_FUNCTION_NAME: 'portfolio-api-cloud-test-chat',
  RUNTIME_PARAMETER_NAME: '/portfolio/validation/chat',
  CHAT_PARAMETER_NAME: undefined,
};
const secret = (): Record<string, string> => ({
  ...runtimeSecret(),
  RESEND_CONTACT_API_KEY: 'validation-only',
  OPENAI_API_KEY: 'validation-only',
  R2_SUBSCRIBERS_ACCESS_KEY_ID: 'validation-only',
  R2_SUBSCRIBERS_SECRET_ACCESS_KEY: 'validation-only',
});
const resolved = () => ({ ...environment, ...secret() });
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
test('Dado el destino exclusivo de validación, cuando cambia función, región, tabla o parámetro, entonces falla antes de componer', () => {
  expect(() => validateEnvironment(environment)).not.toThrow();
  expect(() => validateEnvironment(chatEnvironment, 'chat')).not.toThrow();
  expect(() => validateEnvironment(environment, 'chat')).toThrow();
  expect(() => validateEnvironment(chatEnvironment)).toThrow();
  expect(() =>
    validateEnvironment({ ...environment, RUNTIME_PARAMETER_NAME: productionParameter }),
  ).toThrow();
  expect(() =>
    validateEnvironment({ ...environment, CHAT_PARAMETER_NAME: '/portfolio/prod/chat' }),
  ).toThrow();
  for (const key of [
    'AWS_REGION',
    'AWS_LAMBDA_FUNCTION_NAME',
    'QUOTA_TABLE_NAME',
    'RUNTIME_PARAMETER_NAME',
    'CHAT_PARAMETER_NAME',
    'TRUSTED_API_ID',
  ])
    expect(() =>
      validateEnvironment({ ...environment, [key]: key === 'TRUSTED_API_ID' ? '' : 'production' }),
    ).toThrow();
});
for (const [key, value] of [
  ['RESEND_CONTACT_API_KEY', 're_real'],
  ['RESEND_BLOG_API_KEY', 're_real'],
  ['OPENAI_API_KEY', 'sk_real'],
  ['CONTACT_FROM_EMAIL', 'from@example.com'],
  ['CONTACT_TO_EMAIL', 'to@example.com'],
  ['SUBSCRIBERS_R2_ENDPOINT', 'https://real.example.com'],
  ['SUBSCRIBERS_R2_ENDPOINT', 'https://example.invalid.evil.com'],
  ['SUBSCRIBERS_R2_ENDPOINT', 'https://user:password@r2.invalid'],
  ['R2_SUBSCRIBERS_ACCESS_KEY_ID', 'real'],
  ['R2_SUBSCRIBERS_SECRET_ACCESS_KEY', 'real'],
  ['R2_ENDPOINT', 'https://r2.invalid'],
  ['R2_KNOWLEDGE_ACCESS_KEY_ID', 'real'],
  ['R2_MEDIA_ACCESS_KEY_ID', 'real'],
] as const)
  test(`Dada configuración ${key}, cuando contiene un destino o credencial incompatible, entonces el doble rechaza antes del negocio (${value})`, () => {
    for (const contract of [functions.api, functions.chat]) {
      expect(() => validateConfiguration(resolved(), contract)).not.toThrow();
      expect(() => validateConfiguration({ ...resolved(), [key]: value }, contract)).toThrow();
    }
  });
test('Dado un parámetro de chat sin claves de api, cuando se valida para chat, entonces no exige contacto ni suscriptores', () => {
  const chat = {
    ...chatEnvironment,
    QUOTA_KEY_SECRET: 's'.repeat(32),
    OPENAI_API_KEY: 'validation-only',
  };
  expect(() => validateConfiguration(chat, functions.chat)).not.toThrow();
  expect(() => validateConfiguration(chat, functions.api)).toThrow();
  expect(() =>
    validateConfiguration({ ...chat, OPENAI_API_KEY: undefined }, functions.chat),
  ).toThrow();
});
test('Dado un escenario ajeno al inventario, cuando se selecciona, entonces falla sin transporte alternativo', async () => {
  expect(() => readScenario('from-header')).toThrow();
  const { request } = createValidationProviders('success');
  await expect(request('https://example.com', { method: 'POST' })).rejects.toThrow();
  await expect(
    request('https://cloud.example.invalid/subscriptions', { method: 'POST' }),
  ).rejects.toThrow();
  await expect(request('https://api.openai.com/v1/responses', { method: 'GET' })).rejects.toThrow();
});
for (const scenario of scenarios)
  test(`Dado el escenario ${scenario}, cuando se ejecutan las seis rutas, entonces usa dobles y conserva contratos y reservas`, async () => {
    if (scenario === 'pending-body')
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const store = new SimulatedControlStore();
    const readParameter = vi.fn(async (_name: string) => JSON.stringify(secret()));
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
    const subscriberStore = providers.subscribers();
    const createSubscriber = vi.fn((email: string, signal?: AbortSignal) => {
      const work = subscriberStore.createSubscriber(email, signal);
      notifyStarted();
      return work;
    });
    const deleteSubscriber = vi.fn((email: string, signal?: AbortSignal) => {
      const work = subscriberStore.deleteSubscriber(email, signal);
      notifyStarted();
      return work;
    });
    const handler = createApiHandler(environment, {
      ...providers,
      sendEmail,
      request,
      subscribers: () => ({ createSubscriber, deleteSubscriber }),
      store,
      readParameter,
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
    expect(readParameter).not.toHaveBeenCalled();
    const contact = await invoke(
      event('POST', '/api/contact', {
        name: 'Prueba',
        email: 'test@example.invalid',
        message: 'Mensaje de validación.',
      }),
    );
    expect(contact.statusCode).toBe(scenario === 'success' ? 204 : 500);
    // El almacenamiento en proceso distingue fallo del servicio (502) de abort/deadline (503).
    for (const method of ['POST', 'DELETE'])
      expect(
        (await invoke(event(method, '/api/subscriptions', { email: 'test@example.invalid' })))
          .statusCode,
      ).toBe(scenario === 'success' ? 200 : scenario === 'pending-body' ? 503 : 502);
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
    expect(readParameter.mock.calls.map(([name]) => name)).toEqual([
      '/portfolio/validation/api',
      '/portfolio/validation/chat',
    ]);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(createSubscriber).toHaveBeenCalledTimes(1);
    expect(deleteSubscriber).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledTimes(scenario === 'error' ? 1 : 2);
  });
test('Dada la función chat de validación, cuando atiende sus rutas, entonces lee solo su parámetro y responde 404 al resto', async () => {
  const readParameter = vi.fn(async (_name: string) =>
    JSON.stringify({ QUOTA_KEY_SECRET: 's'.repeat(32), OPENAI_API_KEY: 'validation-only' }),
  );
  const providers = createValidationProviders('success');
  const handler = createChatHandler(chatEnvironment, {
    ...providers,
    store: new SimulatedControlStore(),
    readParameter,
  });
  expect((await handler(event('GET', '/api/chat/starters'))).statusCode).toBe(200);
  expect((await handler(event('GET', '/api/health'))).statusCode).toBe(404);
  expect(readParameter.mock.calls.map(([name]) => name)).toEqual(['/portfolio/validation/chat']);
});
test('Dado un parámetro renovado con transporte real, cuando vence el snapshot, entonces vuelve a validar y devuelve 503 sin efectos', async () => {
  vi.useFakeTimers();
  let current: Record<string, string> = secret();
  const providers = createValidationProviders('success');
  const sendEmail = vi.fn(providers.sendEmail);
  const handler = createApiHandler(environment, {
    ...providers,
    sendEmail,
    store: new SimulatedControlStore(),
    readParameter: async () => JSON.stringify(current),
  });
  const e = event('POST', '/api/contact', {
    name: 'Prueba',
    email: 'test@example.invalid',
    message: 'Mensaje de validación.',
  });
  expect((await handler(e)).statusCode).toBe(204);
  current = { ...current, RESEND_CONTACT_API_KEY: 're_real' };
  await vi.advanceTimersByTimeAsync(300_001);
  expect((await handler(e)).statusCode).toBe(503);
  expect(sendEmail).toHaveBeenCalledTimes(1);
});
