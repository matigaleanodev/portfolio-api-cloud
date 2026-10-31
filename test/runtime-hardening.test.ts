import { runtimeMetric } from '../packages/runtime/src/request-scope.js';
import { createResendProvider } from '../packages/runtime/src/contact.js';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  TransactWriteItemsCommand,
} from '@aws-sdk/client-dynamodb';
import {
  createAiAdmission,
  createSharedQuota,
  DynamoControlStore,
  aiDay,
} from '../packages/runtime/src/shared-control.js';
import { abortable, operationSignal, runRequest } from '../packages/runtime/src/request-scope.js';
import { createApiHandler as createManagedHandler } from '../packages/runtime/src/handlers/api.js';
import {
  aiConfigurationValid,
  createParameterReader,
  createRuntimeConfiguration,
  resolveRuntimeConfiguration,
} from '../packages/runtime/src/runtime-config.js';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { createChatHandler } from '../packages/runtime/src/handlers/chat.js';
import { functions } from '@portfolio-api-cloud/contracts/functions';
import { OpenAiService } from '../packages/runtime/src/chat/openai.service.js';
import { httpEvent } from './fixtures.js';
import {
  SimulatedControlStore,
  chatEnvironment,
  simulatedSubscribers,
  managedEnvironment,
  runtimeConfiguration,
  runtimeSecret,
} from './support/control.js';

beforeEach(() => vi.spyOn(console, 'info').mockImplementation(() => undefined));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const secret = 'secret'.repeat(8);
const within = <T>(ip: string, task: () => Promise<T>) => runRequest(ip, 25_000, task);
function managedEvent(
  message = 'Compará tu experiencia backend con tu trabajo cloud',
  ip = '192.0.2.1',
  sessionId = 'session',
) {
  const event = httpEvent('POST', '/api/chat');
  event.requestContext.domainName = 'local.execute-api.us-east-1.amazonaws.com';
  event.requestContext.stage = '$default';
  event.requestContext.http.sourceIp = ip;
  event.headers = {
    'content-type': 'application/json',
    origin: 'https://frontend.example.invalid',
  };
  event.body = JSON.stringify({ message, sessionId });
  return event;
}
function modelRequest() {
  return vi.fn<typeof fetch>().mockImplementation(
    async (url) =>
      new Response(
        JSON.stringify(
          String(url).endsWith('/input_tokens')
            ? { input_tokens: 100 }
            : {
                status: 'completed',
                model: 'gpt-6-luna',
                output: [
                  {
                    type: 'message',
                    content: [
                      {
                        type: 'output_text',
                        text: JSON.stringify({
                          answer: 'Respuesta de IA simulada',
                          suggestedQuestions: [],
                        }),
                      },
                    ],
                  },
                ],
                usage: { input_tokens: 100, output_tokens: 50 },
              },
        ),
      ),
  );
}
for (const [prefix, limit, duration] of [
  ['contact', 5, 3600],
  ['subscribe', 10, 3600],
  ['unsubscribe', 10, 3600],
  ['chat', 20, 60],
  ['starters', 20, 60],
] as const) {
  test(`Dada cuota compartida ${prefix}, cuando dos instancias compiten, entonces solo admiten ${limit} intentos conjuntos`, async () => {
    const store = new SimulatedControlStore();
    const first = createSharedQuota(store, secret)(limit, prefix, duration);
    const second = createSharedQuota(store, secret)(limit, prefix, duration);
    const results = await Promise.all(
      Array.from({ length: limit + 4 }, (_, index) => (index % 2 ? first : second)('192.0.2.1')),
    );
    expect(results.filter((result) => !result.blocked)).toHaveLength(limit);
    expect(results.filter((result) => result.blocked)).toHaveLength(4);
    expect([...store.records.keys()].join()).not.toContain('192.0.2.1');
  });
}
test('Dado TTL físico pendiente, cuando vence la ventana o sanción, entonces el reloj lógico libera la cuota sin extender el bloqueo', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  const store = new SimulatedControlStore();
  const quota = createSharedQuota(store, secret)(1, 'contact', 60);
  await quota('ip');
  vi.setSystemTime(1000);
  expect((await quota('ip')).headers['retry-after']).toBe('60');
  vi.setSystemTime(60_999);
  expect((await quota('ip')).headers['retry-after']).toBe('1');
  vi.setSystemTime(61_000);
  expect((await quota('ip')).blocked).toBe(false);
  vi.setSystemTime(121_000);
  expect((await quota('ip')).blocked).toBe(false);
  expect(store.records.size).toBe(1);
});
test('Dadas IP y rutas distintas, cuando se consume una cuota, entonces no cambia la otra', async () => {
  const store = new SimulatedControlStore();
  const quota = createSharedQuota(store, secret);
  await quota(1, 'contact')('a');
  expect((await quota(1, 'contact')('a')).blocked).toBe(true);
  expect((await quota(1, 'contact')('b')).blocked).toBe(false);
  expect((await quota(1, 'chat')('a')).blocked).toBe(false);
});
test('Dado almacenamiento caído o conflicto persistente, cuando se solicita cuota, entonces no habilita un contador local alternativo', async () => {
  const store = new SimulatedControlStore();
  store.unavailable = true;
  await expect(createSharedQuota(store, secret)(1, 'x')('ip')).rejects.toThrow();
  store.unavailable = false;
  vi.spyOn(store, 'replace').mockResolvedValue(false);
  await expect(createSharedQuota(store, secret)(1, 'x')('ip')).rejects.toThrow('contention');
});
test('Dado un presupuesto GLOBAL, cuando veinte personas reservan en paralelo, entonces todas comparten exactamente el mismo contador monetario', async () => {
  const store = new SimulatedControlStore();
  const budget = 325_000;
  const admission = createAiAdmission(store, secret, budget);
  const results = await Promise.all(
    Array.from({ length: 20 }, (_, index) =>
      within(`192.0.2.${index + 1}`, () => admission.reserve(100, 300, `s${index}`)),
    ),
  );
  expect(results.filter(Boolean)).toHaveLength(2);
  const monetary = [...store.records].filter(([key]) => key.startsWith('ai:budget:'));
  expect(monetary).toHaveLength(1);
  expect(monetary[0]![1].used).toBe(budget);
  expect(store.reservations.reduce((sum, item) => sum + item.cost, 0)).toBe(budget);
});
test.each([null, 'same', 'rotating'])(
  'Dado cupo por origen con sesión %s, cuando se omite o renueva sessionId, entonces nunca supera cinco reservas',
  async (mode) => {
    const store = new SimulatedControlStore();
    const admission = createAiAdmission(store, secret, 1_000_000_000);
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        within('192.0.2.1', () =>
          admission.reserve(10, 300, mode === 'rotating' ? String(index) : mode),
        ),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
    await within('192.0.2.1', async () => expect(await admission.available('another')).toBe(false));
    expect(await within('192.0.2.2', () => admission.available('another'))).toBe(true);
  },
);
test('Dada medianoche argentina, cuando cambia el día, entonces renueva el presupuesto global y no usa TTL físico como reloj', async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-25T02:59:59Z'));
  const store = new SimulatedControlStore();
  const admission = createAiAdmission(store, secret, 625);
  expect(await within('ip', () => admission.reserve(1, 1))).toBe(true);
  expect(await within('other', () => admission.reserve(1, 1))).toBe(false);
  vi.setSystemTime(new Date('2026-10-25T03:00:00Z'));
  expect(await within('other', () => admission.reserve(1, 1))).toBe(true);
  expect([...store.records.keys()].filter((key) => key.startsWith('ai:budget:'))).toHaveLength(2);
  expect(aiDay(Date.now()).expiresAt).toBe(Date.parse('2026-10-26T03:00:00Z'));
});
test.each([
  [-1, 300],
  [NaN, 300],
  [1.5, 300],
  [10, -1],
  [Number.MAX_SAFE_INTEGER, 300],
])(
  'Dada reserva inválida %s/%s, cuando se evalúa, entonces no modifica consumo',
  async (input, output) => {
    const store = new SimulatedControlStore();
    expect(
      await within('ip', () => createAiAdmission(store, secret, 1e9).reserve(input, output)),
    ).toBe(false);
    expect(store.records.size).toBe(0);
  },
);
test('Dada reserva confirmada o de resultado ambiguo, cuando no llega respuesta del proveedor, entonces no se libera presupuesto', async () => {
  const store = new SimulatedControlStore();
  const admission = createAiAdmission(store, secret, 625);
  expect(await within('ip', () => admission.reserve(1, 1))).toBe(true);
  expect(await within('other', () => admission.reserve(1, 1))).toBe(false);
  store.unavailable = true;
  expect(await within('other', () => admission.available())).toBe(false);
  expect(await within('other', () => admission.reserve(1, 1))).toBe(false);
});
test('Dado adaptador DynamoDB, cuando lee y reemplaza un contador, entonces exige lectura fuerte y condición de versión', async () => {
  const send = vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({} as never);
  const store = new DynamoControlStore(
    new DynamoDBClient({
      region: 'us-east-1',
      credentials: { accessKeyId: 'fake', secretAccessKey: 'fake' },
    }),
    'control',
  );
  expect(await store.get('key')).toBeNull();
  expect(send.mock.calls[0]![0]).toBeInstanceOf(GetItemCommand);
  expect(send.mock.calls[0]![0].input).toMatchObject({ ConsistentRead: true });
  const record = { used: 1, version: 'v', expiresAt: 10_000, blocked: false };
  expect(await store.replace('key', null, record)).toBe(true);
  expect(send.mock.calls[1]![0]).toBeInstanceOf(PutItemCommand);
  expect(send.mock.calls[1]![0].input).toMatchObject({
    ConditionExpression: 'attribute_not_exists(pk)',
  });
  await store.replace('key', record, { ...record, version: 'next' });
  expect(send.mock.calls[2]![0].input).toMatchObject({
    ConditionExpression: '#version = :previous',
    ExpressionAttributeValues: { ':previous': { S: 'v' } },
  });
  await store.reserveAi({
    keys: ['session', 'visitor', 'ai:budget:day'],
    budget: 2000,
    cost: 1000,
    expiresAt: 10_000,
  });
  expect(send.mock.calls[3]![0]).toBeInstanceOf(TransactWriteItemsCommand);
  const command = send.mock.calls[3]![0] as TransactWriteItemsCommand;
  expect(command.input.TransactItems).toHaveLength(3);
  expect(command.input.TransactItems![2]!.Update).toMatchObject({
    Key: { pk: { S: 'ai:budget:day' } },
    ExpressionAttributeValues: { ':available': { N: '1000' } },
  });
});
test('Dado un error condicional y uno de red, cuando falla DynamoDB, entonces solo el conflicto conocido admite relectura', async () => {
  const send = vi
    .spyOn(DynamoDBClient.prototype, 'send')
    .mockRejectedValue(Object.assign(new Error(), { name: 'ConditionalCheckFailedException' }));
  const store = new DynamoControlStore(new DynamoDBClient({ region: 'us-east-1' }), 'control');
  const record = { used: 1, version: 'v', expiresAt: 10, blocked: false };
  expect(await store.replace('k', null, record)).toBe(false);
  send.mockRejectedValue(new Error('network'));
  await expect(store.replace('k', null, record)).rejects.toThrow('network');
});
test('Dado el handler administrado, cuando llega una FAQ o se agota la sesión, entonces no invoca IA y ofrece el contacto', async () => {
  const store = new SimulatedControlStore();
  const request = modelRequest();
  const handler = createManagedHandler(managedEnvironment, {
    store,
    request,
    readParameter: async () => JSON.stringify(runtimeSecret()),
  });
  expect(JSON.parse((await handler(managedEvent('¿Qué tecnologías usás?'))).body!).source).toBe(
    'faq',
  );
  expect(request).not.toHaveBeenCalled();
  for (let index = 0; index < 5; index++)
    expect(
      JSON.parse(
        (
          await handler(
            managedEvent(`Compará tu experiencia backend con tu trabajo cloud ${index}`),
          )
        ).body!,
      ).source,
    ).toBe('ai');
  const result = await handler(
    managedEvent('Compará tu experiencia backend con tu trabajo cloud 6', '192.0.2.1', 'new'),
  );
  expect(JSON.parse(result.body!)).toMatchObject({
    source: 'fallback',
    answer: expect.stringContaining('contacto@matiasgaleano.dev'),
  });
  expect(request).toHaveBeenCalledTimes(10);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toMatch(
    /Compará|contacto@|192\.0\.2|session|secretsecret/,
  );
});
test('Dadas dos composiciones administradas, cuando cambia la IP pero se agota el presupuesto GLOBAL, entonces ambas dejan de generar', async () => {
  const store = new SimulatedControlStore();
  const request = modelRequest();
  const environment = { ...managedEnvironment, AI_DAILY_BUDGET_MICROUSD: '313' };
  const deps = { store, request, readParameter: async () => JSON.stringify(runtimeSecret()) };
  const first = createManagedHandler(environment, deps);
  const second = createManagedHandler(environment, deps);
  expect(JSON.parse((await first(managedEvent())).body!).source).toBe('ai');
  expect(
    JSON.parse((await second(managedEvent(undefined, '192.0.2.99', 'new-person'))).body!).source,
  ).toBe('fallback');
  expect(request).toHaveBeenCalledTimes(3);
});
test('Dado un ingress desconocido o IP inválida, cuando llega un evento, entonces no carga secretos ni proveedores', async () => {
  const readParameter = vi.fn();
  const handler = createManagedHandler(managedEnvironment, { readParameter });
  for (const event of [httpEvent('POST', '/api/chat'), managedEvent(undefined, 'not-an-ip')])
    expect((await handler(event)).statusCode).toBe(403);
  expect(readParameter).not.toHaveBeenCalled();
});
test('Dado control compartido caído, cuando llega negocio, entonces falla cerrado con CORS y sin detalles internos', async () => {
  const store = new SimulatedControlStore();
  store.unavailable = true;
  const request = modelRequest();
  const handler = createManagedHandler(managedEnvironment, {
    store,
    request,
    readParameter: async () => JSON.stringify(runtimeSecret()),
  });
  const result = await handler(managedEvent());
  expect(result.statusCode).toBe(503);
  expect(result.headers?.['access-control-allow-origin']).toBe('https://frontend.example.invalid');
  expect(result.body).not.toContain('sensitive');
  expect(request).not.toHaveBeenCalled();
});
test('Dado un deadline total, cuando el proveedor ignora el abort, entonces devuelve 503 y no continúa al modelo', async () => {
  vi.useFakeTimers();
  const readParameter = vi.fn(() => new Promise<string>(() => undefined));
  const handler = createManagedHandler(managedEnvironment, { readParameter });
  const result = handler(managedEvent(), { getRemainingTimeInMillis: () => 1100 });
  await vi.advanceTimersByTimeAsync(100);
  expect((await result).statusCode).toBe(503);
});
for (const field of [
  'QUOTA_KEY_SECRET',
  'RESEND_CONTACT_API_KEY',
  'R2_SUBSCRIBERS_ACCESS_KEY_ID',
  'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
] as const) {
  test(`Dado secreto sin ${field}, cuando se valida startup, entonces se rechaza antes de efectos`, () => {
    const config = runtimeSecret();
    delete config[field];
    expect(() => resolveRuntimeConfiguration(managedEnvironment, JSON.stringify(config))).toThrow(
      field,
    );
  });
}
for (const field of [
  'CONTACT_FROM_EMAIL',
  'CONTACT_TO_EMAIL',
  'SUBSCRIBERS_R2_ENDPOINT',
  'SUBSCRIBERS_R2_BUCKET',
] as const) {
  test(`Dado ambiente sin ${field}, cuando se valida startup, entonces se rechaza antes de efectos`, () => {
    const environment: Record<string, string> = { ...managedEnvironment };
    delete environment[field];
    expect(() =>
      resolveRuntimeConfiguration(environment, JSON.stringify(runtimeSecret())),
    ).toThrow();
  });
}
test.each(['0', '-1', '1000001', '1.5', 'NaN'])(
  'Dado presupuesto diario inválido %s, cuando se configura, entonces no habilita IA',
  (amount) => {
    expect(
      aiConfigurationValid({
        ...runtimeSecret(),
        ...runtimeConfiguration(),
        AI_DAILY_BUDGET_MICROUSD: amount,
      }),
    ).toBe(false);
  },
);
test('Dado secreto con TTL, cuando falla la renovación, entonces no usa el snapshot vencido', async () => {
  vi.useFakeTimers();
  const read = vi.fn(async () => JSON.stringify(runtimeSecret()));
  const load = createRuntimeConfiguration(managedEnvironment, read);
  await load();
  await load();
  expect(read).toHaveBeenCalledTimes(1);
  read.mockRejectedValue(new Error('secret expired'));
  await vi.advanceTimersByTimeAsync(300_000);
  await expect(load()).rejects.toThrow();
  expect(read).toHaveBeenCalledTimes(2);
});
test('Dado conteo previo inválido o reserva denegada, cuando se solicita generación, entonces nunca envía POST al modelo', async () => {
  for (const counted of [null, { input_tokens: -1 }, { input_tokens: 100 }]) {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify(counted)));
    const admission = { available: async () => true, reserve: vi.fn(async () => false) };
    const provider = new OpenAiService(
      { ...runtimeSecret(), ...runtimeConfiguration() },
      request,
      admission,
    );
    expect(
      await provider.generateChatResponse({
        userMessage: 'a',
        contextItems: [{ sourceType: 'profile', title: 'a', text: 'b' }],
      }),
    ).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
    expect(String(request.mock.calls[0]![0])).toContain('/input_tokens');
  }
});
test('Dado body OpenAI pendiente, cuando vence la operación, entonces el timeout cubre también response.json', async () => {
  vi.useFakeTimers();
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValue({ ok: true, json: () => new Promise(() => undefined) } as Response);
  const response = new OpenAiService({ OPENAI_API_KEY: 'fake' }, request).generateChatResponse({
    userMessage: 'a',
    contextItems: [{ sourceType: 'profile', title: 'a', text: 'b' }],
  });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(await response).toBeNull();
});
test('Dado abort de operación, cuando la promesa no coopera, entonces termina sin esperar efectos pendientes', async () => {
  vi.useFakeTimers();
  const signal = operationSignal(10);
  const result = abortable(signal, () => new Promise(() => undefined)).catch(() => 'aborted');
  await vi.advanceTimersByTimeAsync(10);
  expect(await result).toBe('aborted');
});

test('Dadas direcciones IPv6 equivalentes, cuando cambia su escritura, entonces conserva el mismo cupo diario por origen', async () => {
  const store = new SimulatedControlStore();
  const request = modelRequest();
  const handler = createManagedHandler(managedEnvironment, {
    store,
    request,
    readParameter: async () => JSON.stringify(runtimeSecret()),
  });
  for (let index = 0; index < 5; index++)
    expect(
      JSON.parse(
        (
          await handler(
            managedEvent(`Compará tu experiencia backend con cloud ${index}`, '2001:db8::1'),
          )
        ).body!,
      ).source,
    ).toBe('ai');
  const event = managedEvent(undefined, '2001:0db8:0000:0000:0000:0000:0000:0001', 'new');
  event.headers['x-forwarded-for'] = '192.0.2.200';
  expect(JSON.parse((await handler(event)).body!).source).toBe('fallback');
  expect(request).toHaveBeenCalledTimes(10);
});
test('Dada caché IA, cuando se reutiliza una respuesta, entonces consume cupo de sesión sin reservar dinero adicional', async () => {
  const store = new SimulatedControlStore();
  const request = modelRequest();
  const handler = createManagedHandler(managedEnvironment, {
    store,
    request,
    readParameter: async () => JSON.stringify(runtimeSecret()),
  });
  for (let index = 0; index < 5; index++)
    expect(JSON.parse((await handler(managedEvent())).body!).source).toBe('ai');
  expect(JSON.parse((await handler(managedEvent())).body!).source).toBe('fallback');
  expect(request).toHaveBeenCalledTimes(2);
  expect(store.reservations.map((reservation) => reservation.cost)).toEqual([312_500, 0, 0, 0, 0]);
});
test('Dada IA deshabilitada por configuración, cuando se pregunta por el perfil o proyectos, entonces mantiene FAQ y contacto sin usar el proveedor', async () => {
  const store = new SimulatedControlStore();
  const request = modelRequest();
  const config = runtimeSecret();
  delete config.OPENAI_API_KEY;
  const handler = createManagedHandler(managedEnvironment, {
    store,
    request,
    readParameter: async () => JSON.stringify(config),
  });
  expect(
    JSON.parse((await handler(managedEvent('¿Cómo puedo contactarte?'))).body!).answer,
  ).toContain('contacto@matiasgaleano.dev');
  expect(JSON.parse((await handler(managedEvent('¿Qué hace Modo Playa?'))).body!).source).toBe(
    'fallback',
  );
  vi.spyOn(process, 'cwd').mockReturnValue('/tmp/portfolio-no-editorial-artifact');
  const cold = createManagedHandler(managedEnvironment, {
    store,
    request,
    readParameter: async () => JSON.stringify(config),
  });
  expect(JSON.parse((await cold(managedEvent('¿Cómo puedo contactarte?'))).body!).source).toBe(
    'faq',
  );
  expect((await cold(managedEvent('¿Qué hace Modo Playa?'))).statusCode).toBe(503);
  expect(request).not.toHaveBeenCalled();
});
test('Dado modelo sin tarifa o revisión expirada, cuando se valida, entonces deshabilita únicamente la generación paga', () => {
  const config = { ...runtimeSecret(), ...runtimeConfiguration() };
  expect(aiConfigurationValid({ ...config, OPENAI_CHAT_MODEL: 'unpriced' })).toBe(false);
  const expired = { ...managedEnvironment, AI_PRICING_VALID_UNTIL: new Date(0).toISOString() };
  const resolved = resolveRuntimeConfiguration(expired, JSON.stringify(runtimeSecret()));
  expect(aiConfigurationValid(resolved)).toBe(false);
});
test('Dado parámetro ajeno al ambiente, cuando se configura, entonces no intenta leerlo', async () => {
  const read = vi.fn();
  const load = createRuntimeConfiguration({ RUNTIME_PARAMETER_NAME: '/other/prod/api' }, read);
  await expect(load()).rejects.toThrow();
  expect(read).not.toHaveBeenCalled();
});
test('Dadas métricas de runtime con campos extra, cuando se emiten, entonces descarta identidad, texto y números inválidos', () => {
  runtimeMetric('http_request', 'completed', {
    durationMs: NaN,
    statusCode: 200,
    ...{ email: 'private@example.invalid', message: 'secret' },
  });
  expect(JSON.parse(vi.mocked(console.info).mock.calls[0]![0])).toEqual({
    event: 'http_request',
    outcome: 'completed',
    statusCode: 200,
  });
});
test('Dado SDK de contacto pendiente, cuando vence su timeout, entonces recibe abort y no se reintenta el envío', async () => {
  vi.useFakeTimers();
  const request = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Promise(() => undefined));
  const send = createResendProvider({
    apiKey: 'fake',
    fromEmail: 'from@example.invalid',
    toEmail: 'to@example.invalid',
  });
  const pending = send({
    from: 'from@example.invalid',
    to: 'to@example.invalid',
    subject: 'test',
    text: 'private body',
  }).catch(() => 'aborted');
  await vi.advanceTimersByTimeAsync(8000);
  expect(await pending).toBe('aborted');
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('private body');
});

test.each([
  { AI_PRICING_VALID_UNTIL: '' },
  { AI_PRICING_VALID_UNTIL: new Date(0).toISOString() },
  { AI_DAILY_BUDGET_MICROUSD: 'NaN' },
])(
  'Dada IA inválida %j, cuando llegan los contratos, entonces conserva FAQ, starters, contacto y suscripciones sin gasto',
  async (invalid) => {
    const environment = { ...managedEnvironment, ...invalid };
    const sendEmail = vi.fn(async () => undefined);
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => new Response(JSON.stringify({ message: 'Listo' })));
    const handler = createManagedHandler(environment, {
      store: new SimulatedControlStore(),
      sendEmail,
      request,
      ...simulatedSubscribers(),
      readParameter: async () => JSON.stringify(runtimeSecret()),
    });
    const faq = await handler(managedEvent('¿Cómo puedo contactarte?'));
    expect(JSON.parse(faq.body!).source).toBe('faq');
    expect(JSON.parse((await handler(managedEvent())).body!).source).toBe('fallback');
    for (const [method, path, body, status] of [
      ['GET', '/api/chat/starters', undefined, 200],
      [
        'POST',
        '/api/contact',
        {
          name: 'Prueba',
          email: 'test@example.invalid',
          message: 'Mensaje controlado suficientemente largo',
          company: '',
        },
        204,
      ],
      ['POST', '/api/subscriptions', { email: 'test@example.invalid' }, 200],
      ['DELETE', '/api/subscriptions', { email: 'test@example.invalid' }, 200],
    ] as const) {
      const event = managedEvent();
      event.requestContext.http.method = method;
      event.rawPath = path;
      if (body) event.body = JSON.stringify(body);
      else delete event.body;
      expect((await handler(event)).statusCode).toBe(status);
    }
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.every(([url]) => !String(url).includes('openai.com'))).toBe(true);
  },
);

test('Dada una instancia caliente, cuando vencen tarifas entre respuestas, entonces no reutiliza caché paga ni genera', async () => {
  vi.useFakeTimers();
  const environment = {
    ...managedEnvironment,
    AI_PRICING_VALID_UNTIL: new Date(Date.now() + 1000).toISOString(),
  };
  const request = modelRequest();
  const handler = createManagedHandler(environment, {
    store: new SimulatedControlStore(),
    request,
    readParameter: async () => JSON.stringify(runtimeSecret()),
  });
  expect(JSON.parse((await handler(managedEvent())).body!).source).toBe('ai');
  await vi.advanceTimersByTimeAsync(1001);
  expect(JSON.parse((await handler(managedEvent())).body!).source).toBe('fallback');
  expect(JSON.parse((await handler(managedEvent('¿Cómo puedo contactarte?'))).body!).source).toBe(
    'faq',
  );
  expect(request).toHaveBeenCalledTimes(2);
});

test('Dado tipo JSON inválido en OPENAI_API_KEY, cuando el resto del secreto es válido, entonces deshabilita IA sin rechazar la configuración común', () => {
  const value = resolveRuntimeConfiguration(
    managedEnvironment,
    JSON.stringify({ ...runtimeSecret(), OPENAI_API_KEY: 42 }),
  );
  expect(aiConfigurationValid(value)).toBe(false);
  expect(value.CONTACT_FROM_EMAIL).toBe('from@example.invalid');
  expect(value.SUBSCRIBERS_R2_ENDPOINT).toBe('https://r2.example.invalid');
});

test('Dadas claves no sensibles dentro del secreto, cuando se resuelve la configuración, entonces prevalece el ambiente declarado', () => {
  const value = resolveRuntimeConfiguration(
    managedEnvironment,
    JSON.stringify({
      ...runtimeSecret(),
      CONTACT_TO_EMAIL: 'other@example.invalid',
      SUBSCRIBERS_R2_ENDPOINT: 42,
      AI_DAILY_BUDGET_MICROUSD: '1',
      RESEND_API_KEY: 'legacy',
    }),
  );
  expect(value.CONTACT_TO_EMAIL).toBe('to@example.invalid');
  expect(value.SUBSCRIBERS_R2_ENDPOINT).toBe('https://r2.example.invalid');
  expect(value.AI_DAILY_BUDGET_MICROUSD).toBe('1000000');
  expect(value.RESEND_API_KEY).toBeUndefined();
  expect(Object.isFrozen(value)).toBe(true);
});

test('Dada una clave requerida con tipo inválido, cuando se valida, entonces se rechaza sin componer proveedores', () => {
  expect(() =>
    resolveRuntimeConfiguration(
      managedEnvironment,
      JSON.stringify({ ...runtimeSecret(), QUOTA_KEY_SECRET: 42 }),
    ),
  ).toThrow('Invalid runtime configuration');
  for (const raw of ['[]', 'null', '{', '"text"'])
    expect(() => resolveRuntimeConfiguration(managedEnvironment, raw)).toThrow();
});

test('Dada la validación por función, cuando faltan claves de chat, entonces api conserva contacto y chat no exige contacto', () => {
  const secret = runtimeSecret();
  delete secret.OPENAI_API_KEY;
  expect(() =>
    resolveRuntimeConfiguration(managedEnvironment, JSON.stringify(secret)),
  ).not.toThrow();
  const chatOnly = { QUOTA_KEY_SECRET: 's'.repeat(32) };
  expect(() =>
    resolveRuntimeConfiguration(managedEnvironment, JSON.stringify(chatOnly), functions.chat),
  ).not.toThrow();
  expect(() => resolveRuntimeConfiguration(managedEnvironment, JSON.stringify(chatOnly))).toThrow(
    'RESEND_CONTACT_API_KEY',
  );
  expect(() =>
    resolveRuntimeConfiguration(
      managedEnvironment,
      JSON.stringify({ QUOTA_KEY_SECRET: 'short' }),
      functions.chat,
    ),
  ).toThrow('Missing quota key secret');
});

test('Dado conocimiento R2 incompleto o inválido, cuando se resuelve chat, entonces falla cerrado como en dev sin afectar api', () => {
  const environment = {
    ...managedEnvironment,
    R2_ENDPOINT: 'https://r2.example.invalid',
    R2_BUCKET: 'media',
  };
  const knowledge = {
    ...runtimeSecret(),
    R2_KNOWLEDGE_ACCESS_KEY_ID: 'fake',
    R2_KNOWLEDGE_SECRET_ACCESS_KEY: 'fake',
  };
  expect(() =>
    resolveRuntimeConfiguration(environment, JSON.stringify(runtimeSecret()), functions.chat),
  ).toThrow('Incomplete R2 chat knowledge configuration');
  expect(() =>
    resolveRuntimeConfiguration(
      managedEnvironment,
      JSON.stringify({ ...runtimeSecret(), R2_KNOWLEDGE_ACCESS_KEY_ID: 'fake' }),
      functions.chat,
    ),
  ).toThrow('Incomplete R2 chat knowledge configuration');
  // api no valida conocimiento: su parámetro no lo contiene y health/contacto/suscripciones siguen.
  expect(() =>
    resolveRuntimeConfiguration(environment, JSON.stringify(runtimeSecret())),
  ).not.toThrow();
  const complete = resolveRuntimeConfiguration(
    environment,
    JSON.stringify(knowledge),
    functions.chat,
  );
  expect(complete.R2_ENDPOINT).toBe('https://r2.example.invalid');
  expect(() =>
    resolveRuntimeConfiguration(
      { ...environment, R2_ENDPOINT: 'http://r2.example.invalid' },
      JSON.stringify(knowledge),
      functions.chat,
    ),
  ).toThrow('Invalid R2 endpoint');
  for (const [key, value, message] of [
    ['SUBSCRIBERS_R2_ENDPOINT', 'http://r2.example.invalid', 'Invalid subscribers endpoint'],
    [
      'SUBSCRIBERS_R2_ENDPOINT',
      'https://user:pass@r2.example.invalid',
      'Invalid subscribers endpoint',
    ],
    ['SUBSCRIBERS_R2_BUCKET', 'media', 'Subscribers bucket must be private'],
  ] as const)
    expect(() =>
      resolveRuntimeConfiguration(
        { ...environment, [key]: value },
        JSON.stringify(runtimeSecret()),
      ),
    ).toThrow(message);
});

test('Dado conocimiento R2 incompleto, cuando api y chat atienden, entonces solo las operaciones de chat responden 503 antes de la cuota', async () => {
  const environment = {
    ...managedEnvironment,
    R2_ENDPOINT: 'https://r2.example.invalid',
    R2_BUCKET: 'media',
  };
  const store = new SimulatedControlStore();
  const request = modelRequest();
  const sendEmail = vi.fn(async () => undefined);
  const deps = {
    store,
    request,
    sendEmail,
    ...simulatedSubscribers(),
    readParameter: async () => JSON.stringify(runtimeSecret()),
  };
  const api = createManagedHandler(environment, deps);
  const chat = createChatHandler(
    { ...chatEnvironment, R2_ENDPOINT: 'https://r2.example.invalid', R2_BUCKET: 'media' },
    deps,
  );
  for (const handler of [api, chat]) {
    const reply = await handler(managedEvent());
    expect(reply.statusCode).toBe(503);
    expect(JSON.parse(reply.body!)).toEqual({ statusCode: 503, message: 'Service unavailable' });
    expect(reply.headers?.['access-control-allow-origin']).toBe('https://frontend.example.invalid');
    const starters = managedEvent();
    starters.requestContext.http.method = 'GET';
    starters.rawPath = '/api/chat/starters';
    delete starters.body;
    expect((await handler(starters)).statusCode).toBe(503);
  }
  expect(store.records.size).toBe(0);
  expect(request).not.toHaveBeenCalled();
  const health = managedEvent();
  health.requestContext.http.method = 'GET';
  health.rawPath = '/api/health';
  delete health.body;
  expect((await api(health)).statusCode).toBe(200);
  for (const [method, path, body, status] of [
    [
      'POST',
      '/api/contact',
      {
        name: 'Prueba',
        email: 'test@example.invalid',
        message: 'Mensaje controlado suficientemente largo',
      },
      204,
    ],
    ['POST', '/api/subscriptions', { email: 'test@example.invalid' }, 200],
  ] as const) {
    const event = managedEvent();
    event.requestContext.http.method = method;
    event.rawPath = path;
    event.body = JSON.stringify(body);
    expect((await api(event)).statusCode).toBe(status);
  }
});

test.each([
  ['api productivo', '/portfolio/prod/api', true],
  ['chat productivo', '/portfolio/prod/chat', true],
  ['editorial', '/portfolio/prod/editorial', true],
  ['notificaciones', '/portfolio/prod/notifications', true],
  ['validación api', '/portfolio/validation/api', true],
  ['validación chat', '/portfolio/validation/chat', true],
  ['único anterior', '/portfolio/prod/app-properties', false],
  ['sin barra inicial', 'portfolio/prod/api', false],
  ['con barra final', '/portfolio/prod/api/', false],
  ['ARN de SSM', 'arn:aws:ssm:us-east-1:650387442642:parameter/portfolio/prod/api', false],
  [
    'ARN de Secrets Manager',
    'arn:aws:secretsmanager:us-east-1:650387442642:secret:portfolio/prod/app-properties-AbC123',
    false,
  ],
  ['vacío', '', false],
] as const)(
  'Dado parámetro %s, cuando se configura, entonces solo lee los nombres exactos admitidos',
  async (_name, parameter, accepted) => {
    const read = vi.fn(async (_name: string) => JSON.stringify(runtimeSecret()));
    const load = createRuntimeConfiguration(
      { ...managedEnvironment, RUNTIME_PARAMETER_NAME: parameter },
      read,
    );
    if (accepted) await expect(load()).resolves.toMatchObject({ QUOTA_KEY_SECRET: 's'.repeat(32) });
    else await expect(load()).rejects.toThrow('Runtime parameter is not configured');
    expect(read.mock.calls.map(([name]) => name)).toEqual(accepted ? [parameter] : []);
  },
);

test('Dado el lector SSM, cuando responde, entonces descifra con un intento y exige SecureString sin exponer valores', async () => {
  const send = vi.spyOn(SSMClient.prototype, 'send');
  const read = createParameterReader();
  const signal = new AbortController().signal;
  send.mockResolvedValueOnce({ Parameter: { Type: 'SecureString', Value: '{"a":"b"}' } } as never);
  expect(await read('/portfolio/prod/api', signal)).toBe('{"a":"b"}');
  const [command, options] = send.mock.calls[0]! as unknown as [
    GetParameterCommand,
    { abortSignal: AbortSignal },
  ];
  expect(command).toBeInstanceOf(GetParameterCommand);
  expect(command.input).toEqual({ Name: '/portfolio/prod/api', WithDecryption: true });
  expect(options.abortSignal).toBe(signal);
  expect(await (send.mock.contexts[0] as SSMClient).config.maxAttempts()).toBe(1);
  send.mockResolvedValueOnce({ Parameter: { Value: '{}' } } as never);
  expect(await read('/portfolio/prod/api', signal)).toBe('{}');
  for (const response of [
    { Parameter: { Type: 'String', Value: 'plain-sensitive' } },
    { Parameter: { Type: 'SecureString' } },
    {},
  ]) {
    send.mockResolvedValueOnce(response as never);
    const error = await read('/portfolio/prod/api', signal).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).not.toContain('plain-sensitive');
  }
});

test('Dado SSM pendiente o fallido, cuando se carga la configuración, entonces corta a los 3 s y la API responde 503 sin detalles', async () => {
  vi.useFakeTimers();
  const read = vi.fn(
    (_name: string, signal: AbortSignal) =>
      new Promise<string>((_resolve, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      ),
  );
  const load = createRuntimeConfiguration(managedEnvironment, read);
  const pending = load().catch(() => 'aborted');
  await vi.advanceTimersByTimeAsync(3000);
  expect(await pending).toBe('aborted');
  vi.useRealTimers();
  const handler = createManagedHandler(managedEnvironment, {
    store: new SimulatedControlStore(),
    readParameter: async () => {
      throw new Error('AccessDenied arn:aws:ssm:private-detail');
    },
  });
  const result = await handler(managedEvent());
  expect(result.statusCode).toBe(503);
  expect(result.body).toBe('{"statusCode":503,"message":"Service unavailable"}');
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('private-detail');
});
