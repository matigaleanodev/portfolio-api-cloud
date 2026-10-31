import { repositoryPath } from './support/paths.js';
import { createApiHandler as createManagedHandler } from '../packages/runtime/src/handlers/api.js';
import {
  managedEnvironment,
  runtimeSecret,
  SimulatedControlStore,
  SimulatedObjectStorage,
  simulatedSubscribers,
} from './support/control.js';
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createApplication } from '../packages/runtime/src/application.js';
import {
  readConfiguration,
  readSubscriptionConfiguration,
} from '../packages/runtime/src/config.js';
import { validateSubscription } from '../packages/runtime/src/subscriptions/dto.js';
import {
  createSubscriptionSender,
  SubscriptionError,
  type SubscriberOperations,
  type SubscriptionMethod,
} from '../packages/runtime/src/subscriptions/facade.js';
import { createSubscriberStore } from '../packages/runtime/src/subscriptions/store.js';
import { handler } from '../packages/runtime/src/handlers/api.js';
import { httpEvent } from './fixtures.js';

interface Reference {
  validation: {
    label: string;
    input: unknown;
    expected: { statusCode: number; dto?: unknown; body?: unknown };
  }[];
}

const reference = JSON.parse(
  readFileSync(repositoryPath('test/subscriptions-reference.json'), 'utf8'),
) as Reference;
const methods: SubscriptionMethod[] = ['POST', 'DELETE'];
const config = readSubscriptionConfiguration({
  SUBSCRIBERS_R2_ENDPOINT: ' https://r2.example.invalid/ ',
  SUBSCRIBERS_R2_BUCKET: ' subscribers ',
  R2_SUBSCRIBERS_ACCESS_KEY_ID: 'fake',
  R2_SUBSCRIBERS_SECRET_ACCESS_KEY: 'fake',
});
const valid = { email: 'test@example.com' };
const storeSender = (storage = new SimulatedObjectStorage()) =>
  createSubscriptionSender(createSubscriberStore(config, storage));
const unavailable = {
  message: 'No se pudo conectar con el servicio de suscripciones.',
  error: 'Service Unavailable',
  statusCode: 503,
};
const failed = {
  message: 'No se pudo procesar la suscripcion en este momento.',
  error: 'Bad Gateway',
  statusCode: 502,
};

const cors = readConfiguration({ CORS_ORIGIN: 'https://frontend.example.invalid' });

function subscriptionEvent(method: SubscriptionMethod = 'POST', input: unknown = valid) {
  const event = httpEvent(method, '/api/subscriptions');
  event.headers = {
    'content-type': 'application/json',
    origin: 'https://frontend.example.invalid',
  };
  event.body = JSON.stringify(input);
  return event;
}

for (const scenario of reference.validation) {
  const given = scenario.label.startsWith('una ')
    ? 'Dada'
    : scenario.label.startsWith('varios ')
      ? 'Dados'
      : scenario.label.startsWith('claves ')
        ? 'Dadas'
        : 'Dado';
  const rejected =
    scenario.expected.statusCode === 400 ||
    Array.isArray(scenario.input) ||
    scenario.label === 'una clave extra prototype';
  const outcome = rejected
    ? 'se rechaza con los mensajes previstos'
    : 'se normaliza y delega únicamente el correo';
  test(`${given} ${scenario.label}, cuando se valida el alta o la baja, entonces ${outcome}`, async () => {
    let expected = scenario.expected;
    // Las mismas diferencias de contacto se declaran sin reescribir la referencia original.
    if (Array.isArray(scenario.input)) {
      expected = {
        statusCode: 400,
        body: {
          message: ['body must be an object'],
          error: 'Bad Request',
          statusCode: 400,
        },
      };
    }
    if (scenario.label === 'una clave extra prototype') {
      expected = {
        statusCode: 400,
        body: {
          message: ['property prototype should not exist'],
          error: 'Bad Request',
          statusCode: 400,
        },
      };
    }
    const validation = validateSubscription(structuredClone(scenario.input));
    if (validation.errors.length) {
      assert.equal(expected.statusCode, 400);
      assert.deepEqual(
        { message: validation.errors, error: 'Bad Request', statusCode: 400 },
        expected.body,
      );
    } else {
      assert.equal(expected.statusCode, 200);
      assert.deepEqual(JSON.parse(JSON.stringify(validation.dto)), expected.dto);
    }
    // JSON null se rechaza en el parser, antes del DTO.
    if (scenario.input === null) return;

    for (const method of methods) {
      const sent: unknown[] = [];
      const app = createApplication(cors, undefined, async (actualMethod, dto) => {
        sent.push({ method: actualMethod, dto: JSON.parse(JSON.stringify(dto)) });
        return { message: 'Subscribed successfully', email: dto.email };
      });
      const result = await app(subscriptionEvent(method, scenario.input));
      assert.equal(result.statusCode, expected.statusCode);
      assert.deepEqual(
        JSON.parse(result.body ?? ''),
        expected.statusCode === 200
          ? { message: 'Subscribed successfully', email: validation.dto.email }
          : expected.body,
      );
      assert.deepEqual(sent, expected.statusCode === 200 ? [{ method, dto: expected.dto }] : []);
      assert.equal(result.headers?.['x-ratelimit-limit'], '10');
      assert.equal(result.headers?.['x-ratelimit-remaining'], '9');
      assert.equal(
        result.headers?.['access-control-allow-origin'],
        'https://frontend.example.invalid',
      );
      assert.equal(result.headers?.['x-frame-options'], 'DENY');
    }
  });
}

test('Dado el almacenamiento R2 de suscriptores, cuando se alta y baja dos veces, entonces conserva mensajes, claves y efecto persistente de portfolio-cloud', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-31T12:00:00Z'));
  const storage = new SimulatedObjectStorage();
  const app = createApplication(cors, undefined, storeSender(storage));
  // El doble indexa por `<bucket>/<clave>`.
  const key = 'subscribers/subscribers/test@example.com.json';
  const expected = [
    ['POST', '{"message":"Subscribed successfully","email":"test@example.com"}'],
    ['POST', '{"message":"Already subscribed"}'],
    ['DELETE', '{"message":"Unsubscribed successfully","email":"test@example.com"}'],
    ['DELETE', '{"message":"Already unsubscribed"}'],
  ] as const;
  for (const [index, [method, body]] of expected.entries()) {
    const result = await app(subscriptionEvent(method, { email: ' TEST@Example.com ' }));
    assert.equal(result.statusCode, 200);
    assert.equal(result.body, body);
    assert.equal(result.headers?.['content-type'], 'application/json; charset=utf-8');
    assert.equal(
      result.headers?.['access-control-allow-origin'],
      'https://frontend.example.invalid',
    );
    assert.equal(result.headers?.['x-content-type-options'], 'nosniff');
    assert.equal(result.headers?.['x-ratelimit-remaining'], String(9 - (index % 2)));
    if (index === 0)
      assert.deepEqual(JSON.parse(storage.objects.get(key) ?? 'null'), {
        email: 'test@example.com',
        createdAt: '2026-10-31T12:00:00.000Z',
      });
  }
  assert.equal(storage.objects.size, 0);
  assert.deepEqual(
    storage.commands.map(({ name, input }) => [name, input.Bucket, input.Key]),
    [
      ['HeadObjectCommand', 'subscribers', 'subscribers/test@example.com.json'],
      ['PutObjectCommand', 'subscribers', 'subscribers/test@example.com.json'],
      ['HeadObjectCommand', 'subscribers', 'subscribers/test@example.com.json'],
      ['HeadObjectCommand', 'subscribers', 'subscribers/test@example.com.json'],
      ['DeleteObjectCommand', 'subscribers', 'subscribers/test@example.com.json'],
      ['HeadObjectCommand', 'subscribers', 'subscribers/test@example.com.json'],
    ],
  );
  assert.equal(storage.commands[1]!.input.ContentType, 'application/json');
});

test('Dada configuración de suscriptores, cuando se lee, entonces exige endpoint HTTPS, bucket privado y credenciales propias', () => {
  assert.deepEqual(config, {
    endpoint: 'https://r2.example.invalid',
    region: 'auto',
    bucket: 'subscribers',
    accessKeyId: 'fake',
    secretAccessKey: 'fake',
  });
  assert.equal(Object.isFrozen(config), true);
  const complete = {
    SUBSCRIBERS_R2_ENDPOINT: 'https://r2.example.invalid',
    SUBSCRIBERS_R2_BUCKET: 'subscribers',
    R2_SUBSCRIBERS_ACCESS_KEY_ID: 'fake',
    R2_SUBSCRIBERS_SECRET_ACCESS_KEY: 'fake',
  };
  for (const key of Object.keys(complete))
    for (const value of [undefined, '', '  '])
      assert.throws(
        () => readSubscriptionConfiguration({ ...complete, [key]: value }),
        new RegExp(`Missing subscription configuration: ${key}`),
      );
  assert.throws(() =>
    readSubscriptionConfiguration({ ...complete, SUBSCRIBERS_R2_ENDPOINT: 'not-a-url' }),
  );
  assert.throws(
    () => readSubscriptionConfiguration({ ...complete, R2_BUCKET: 'subscribers' }),
    /Subscribers bucket must be private/,
  );
  assert.equal(readSubscriptionConfiguration({ ...complete, R2_REGION: 'wnam' }).region, 'wnam');
});

test('Dado un correo que el DTO admite pero portfolio-cloud rechaza, cuando se delega, entonces responde 400 Invalid email sin tocar el almacenamiento', async () => {
  const storage = new SimulatedObjectStorage();
  for (const method of methods)
    await assert.rejects(
      storeSender(storage)(method, { email: 'user@localhost' }),
      (error: unknown) =>
        error instanceof SubscriptionError &&
        error.statusCode === 400 &&
        error.message === 'Invalid email',
    );
  assert.equal(storage.commands.length, 0);
});

test('Dado un almacenamiento pendiente, cuando se envía una baja, entonces se espera su resultado antes de responder 200', async () => {
  let resolve!: (value: 'deleted') => void;
  const deleteSubscriber = vi.fn(
    () =>
      new Promise<'deleted'>((done) => {
        resolve = done;
      }),
  );
  const store: SubscriberOperations = { createSubscriber: vi.fn(), deleteSubscriber };
  const app = createApplication(cors, undefined, createSubscriptionSender(store));
  let finished = false;
  const result = app(subscriptionEvent('DELETE')).then((response) => {
    finished = true;
    return response;
  });
  await vi.waitFor(() => assert.equal(deleteSubscriber.mock.calls.length, 1));
  assert.equal(finished, false);
  resolve('deleted');
  assert.equal(
    (await result).body,
    '{"message":"Unsubscribed successfully","email":"test@example.com"}',
  );
});

for (const failure of [
  Object.assign(new Error('private storage detail'), { name: 'InternalError' }),
  Object.assign(new Error('private network detail'), { name: 'TimeoutError' }),
  'failure',
]) {
  test(`Dado un fallo de almacenamiento ${failure instanceof Error ? failure.name : 'sin Error'}, cuando se solicita alta o baja, entonces responde 502 sin detalles, reintentos ni correos en logs`, async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    for (const method of methods) {
      const storage = new SimulatedObjectStorage();
      storage.failure = failure as Error;
      const result = await createApplication(
        cors,
        undefined,
        storeSender(storage),
      )(subscriptionEvent(method));
      assert.equal(result.statusCode, 502);
      assert.deepEqual(JSON.parse(result.body ?? ''), failed);
      assert.equal(storage.commands.length, 1);
    }
    assert.doesNotMatch(JSON.stringify(info.mock.calls), /test@example|private/);
    assert.deepEqual(
      info.mock.calls.map(([line]) => JSON.parse(String(line)).outcome),
      ['error', 'error'],
    );
  });
}

test('Dado el límite propio de ocho segundos, cuando el almacenamiento no responde, entonces aborta la operación y devuelve 503', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const storages = [new SimulatedObjectStorage(), new SimulatedObjectStorage()];
  for (const storage of storages) storage.pending = true;
  const pendingResponses = Promise.all(
    methods.map((method, index) =>
      createApplication(cors, undefined, storeSender(storages[index]))(subscriptionEvent(method)),
    ),
  );
  await vi.advanceTimersByTimeAsync(7999);
  assert.equal(
    storages.every((storage) => storage.commands.length === 1),
    true,
  );
  await vi.advanceTimersByTimeAsync(1);
  const responses = await pendingResponses;
  assert.deepEqual(
    responses.map((response) => [response.statusCode, JSON.parse(response.body ?? '')]),
    [
      [503, unavailable],
      [503, unavailable],
    ],
  );
}, 11000);

test('Dado un almacenamiento que ignora el abort, cuando vence el límite, entonces responde 503 sin esperar el efecto', async () => {
  vi.useFakeTimers();
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const store: SubscriberOperations = {
    createSubscriber: () => new Promise(() => undefined),
    deleteSubscriber: () => new Promise(() => undefined),
  };
  const response = createApplication(
    cors,
    undefined,
    createSubscriptionSender(store),
  )(subscriptionEvent());
  await vi.advanceTimersByTimeAsync(8000);
  assert.equal((await response).statusCode, 503);
});

test('Dadas altas concurrentes, cuando once solicitudes compiten por una IP, entonces solo diez llegan al proveedor', async () => {
  let calls = 0;
  const app = createApplication(cors, undefined, async () => {
    calls++;
    return { message: 'ok' };
  });
  const responses = await Promise.all(Array.from({ length: 11 }, () => app(subscriptionEvent())));
  assert.deepEqual(responses.map((response) => response.statusCode).sort(), [
    ...Array<number>(10).fill(200),
    429,
  ]);
  assert.equal(calls, 10);
});

test('Dadas cuotas por método e IP, cuando alta, baja y contacto se agotan, entonces sus contadores son independientes y XFF no cambia identidad', async () => {
  let calls = 0;
  const app = createApplication(
    cors,
    async () => {},
    async () => {
      calls++;
      return { message: 'ok' };
    },
  );
  for (const method of methods) {
    for (let index = 0; index < 10; index++) {
      const event = subscriptionEvent(method);
      event.headers['x-forwarded-for'] = '198.51.100.' + index;
      const result = await app(event);
      assert.equal(result.statusCode, 200);
      assert.equal(result.headers?.['x-ratelimit-remaining'], String(9 - index));
    }
    const blocked = await app(subscriptionEvent(method));
    assert.equal(blocked.statusCode, 429);
    assert.deepEqual(JSON.parse(blocked.body ?? ''), {
      statusCode: 429,
      message: 'ThrottlerException: Too Many Requests',
    });
    assert.equal(blocked.headers?.['retry-after'], '3600');
    assert.equal(
      blocked.headers?.['access-control-allow-origin'],
      'https://frontend.example.invalid',
    );
    const otherIp = subscriptionEvent(method);
    otherIp.requestContext.http.sourceIp = '192.0.2.2';
    assert.equal((await app(otherIp)).headers?.['x-ratelimit-remaining'], '9');
  }
  const contact = httpEvent('POST', '/api/contact');
  contact.headers['content-type'] = 'application/json';
  contact.body = JSON.stringify({
    name: 'Prueba',
    email: 'test@example.com',
    message: 'Mensaje de prueba.',
  });
  for (let index = 0; index < 5; index++) assert.equal((await app(contact)).statusCode, 204);
  assert.equal((await app(contact)).statusCode, 429);
  assert.equal((await app(httpEvent())).statusCode, 200);
  assert.equal(calls, 22);
});

test('Dado un bloqueo de suscripciones, cuando se reintenta y vence, entonces no se extiende ni altera otra IP o método', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(0);
  const app = createApplication(cors, undefined, async () => ({ message: 'ok' }));
  for (let index = 0; index < 10; index++) await app(subscriptionEvent());
  vi.advanceTimersByTime(1000);
  assert.equal((await app(subscriptionEvent())).statusCode, 429);
  const other = subscriptionEvent();
  other.requestContext.http.sourceIp = '192.0.2.2';
  await app(other);
  await app(subscriptionEvent('DELETE'));
  vi.advanceTimersByTime(3_599_999);
  assert.equal((await app(subscriptionEvent())).headers?.['retry-after'], '1');
  vi.advanceTimersByTime(1);
  assert.equal((await app(subscriptionEvent())).headers?.['x-ratelimit-remaining'], '9');
  assert.equal((await app(other)).headers?.['x-ratelimit-remaining'], '9');
  assert.equal((await app(subscriptionEvent('DELETE'))).headers?.['x-ratelimit-remaining'], '9');
});

test('Dada una ventana fija y composiciones distintas, cuando vence una hora, entonces libera diez puntos sin depender de timers', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(0);
  const sender = async () => ({ message: 'ok' });
  const app = createApplication(cors, undefined, sender);
  for (const method of methods) {
    await app(subscriptionEvent(method));
    assert.equal((await app(subscriptionEvent(method))).headers?.['x-ratelimit-remaining'], '8');
    const separate = createApplication(cors, undefined, sender);
    assert.equal(
      (await separate(subscriptionEvent(method))).headers?.['x-ratelimit-remaining'],
      '9',
    );
  }
  vi.setSystemTime(3_600_000);
  for (const method of methods)
    assert.equal((await app(subscriptionEvent(method))).headers?.['x-ratelimit-remaining'], '9');
});

test('Dadas validaciones y fallos de almacenamiento, cuando consumen diez intentos, entonces bloquean el siguiente sin llamar al almacenamiento', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  for (const method of methods) {
    const storage = new SimulatedObjectStorage();
    storage.failure = new Error('unavailable');
    const app = createApplication(cors, undefined, storeSender(storage));
    for (let index = 0; index < 5; index++)
      assert.equal((await app(subscriptionEvent(method, { email: 'invalid' }))).statusCode, 400);
    for (let index = 0; index < 5; index++)
      assert.equal((await app(subscriptionEvent(method))).statusCode, 502);
    assert.equal((await app(subscriptionEvent(method))).statusCode, 429);
    assert.equal(storage.commands.length, 5);
  }
});

test('Dados JSON inválidos, MIME incorrecto o preflight, cuando preceden al DTO, entonces no llaman al proveedor y solo el MIME consume cuota', async () => {
  let calls = 0;
  const app = createApplication(cors, undefined, async () => {
    calls++;
    return { message: 'ok' };
  });
  for (const method of methods) {
    for (const body of ['null', '123', '"text"', '{']) {
      const event = subscriptionEvent(method);
      event.body = body;
      const result = await app(event);
      assert.equal(result.statusCode, 400);
      assert.equal(result.headers?.['x-ratelimit-limit'], undefined);
      assert.equal(result.headers?.['access-control-allow-origin'], undefined);
    }
    const unsupported = subscriptionEvent(method);
    unsupported.headers['content-type'] = 'text/plain';
    const invalid = await app(unsupported);
    assert.equal(invalid.statusCode, 400);
    assert.equal(invalid.headers?.['x-ratelimit-remaining'], '9');
    const preflight = httpEvent('OPTIONS', '/api/subscriptions');
    preflight.headers.origin = 'https://frontend.example.invalid';
    assert.equal((await app(preflight)).statusCode, 204);
    assert.equal((await app(subscriptionEvent(method))).headers?.['x-ratelimit-remaining'], '8');
  }
  assert.equal(calls, 2);
});

test('Dado JSON de 16 KiB, cuando se recibe directo, en base64 o comprimido, entonces aplica el límite decodificado también para DELETE', async () => {
  for (const method of methods) {
    const app = createApplication(cors, undefined, async () => ({ message: 'ok' }));
    const json = JSON.stringify(valid);
    const exact = json + ' '.repeat(16384 - Buffer.byteLength(json));
    for (const mode of ['plain', 'base64', 'gzip']) {
      const event = subscriptionEvent(method);
      if (mode === 'gzip') event.headers['content-encoding'] = 'gzip';
      for (const [body, status] of [
        [exact, 200],
        [exact + ' ', 413],
      ] as const) {
        event.isBase64Encoded = mode !== 'plain';
        event.body =
          mode === 'gzip'
            ? gzipSync(body).toString('base64')
            : mode === 'base64'
              ? Buffer.from(body).toString('base64')
              : body;
        const result = await app(event);
        assert.equal(result.statusCode, status);
        if (status === 413) {
          assert.equal(result.headers?.['x-ratelimit-limit'], undefined);
          assert.equal(result.headers?.['x-frame-options'], undefined);
        }
      }
    }
  }
});

test('Dado un formulario de alta o baja, cuando contiene email repetido o anidado, entonces rechaza tipos inválidos sin coerción', async () => {
  for (const method of methods) {
    const sent: unknown[] = [];
    const app = createApplication(cors, undefined, async (_method, dto) => {
      sent.push(dto.email);
      return { message: 'ok', email: dto.email };
    });
    for (const [body, status] of [
      ['email=%20TEST%40example.com%20', 200],
      ['email=a%40example.com&email=b%40example.com', 400],
      ['email[value]=test%40example.com', 400],
    ] as const) {
      const event = subscriptionEvent(method);
      event.headers['content-type'] = 'application/x-www-form-urlencoded';
      event.body = body;
      assert.equal((await app(event)).statusCode, status);
    }
    assert.deepEqual(sent, ['test@example.com']);
  }
});

test('Dado rawPath con mayúsculas y barra final, cuando se solicita alta o baja, entonces conserva ruta y no confunde stage, query o métodos', async () => {
  const app = createApplication(cors, undefined, async () => ({ message: 'ok' }));
  for (const method of methods) {
    const event = subscriptionEvent(method);
    event.rawPath = '/API/SUBSCRIPTIONS/';
    event.requestContext.http.path = '/test/api/subscriptions';
    event.rawQueryString = 'email=ignored@example.com';
    assert.equal((await app(event)).body, '{"message":"ok"}');
    event.rawPath = '/test/api/subscriptions';
    assert.equal((await app(event)).statusCode, 404);
    const queryOnly = subscriptionEvent(method);
    delete queryOnly.body;
    queryOnly.rawQueryString = 'email=test@example.com';
    assert.equal((await app(queryOnly)).statusCode, 400);
  }
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH']) {
    const result = await app(httpEvent(method, '/api/subscriptions'));
    assert.equal(result.statusCode, 404);
    assert.equal(result.headers?.['x-ratelimit-limit'], undefined);
  }
});

test('Dado un origen no permitido, cuando se suscribe por fuera del navegador, entonces CORS no autentica ni evita el efecto', async () => {
  let calls = 0;
  const app = createApplication(cors, undefined, async () => {
    calls++;
    return { message: 'ok' };
  });
  const event = subscriptionEvent();
  event.headers.origin = 'https://other.example.invalid';
  const result = await app(event);
  assert.equal(result.statusCode, 200);
  assert.equal(result.headers?.['access-control-allow-origin'], undefined);
  assert.equal(result.headers?.vary, 'Origin');
  assert.equal(calls, 1);
});

test('Dada ausencia o falla inesperada del proveedor, cuando llega una suscripción válida, entonces devuelve 500 controlado y health sigue disponible', async () => {
  for (const app of [
    createApplication(cors),
    createApplication(cors, undefined, async () => {
      throw new Error('private detail');
    }),
  ]) {
    for (const method of methods) {
      const result = await app(subscriptionEvent(method));
      assert.equal(result.statusCode, 500);
      assert.deepEqual(JSON.parse(result.body ?? ''), {
        statusCode: 500,
        message: 'Internal server error',
      });
    }
    assert.equal((await app(httpEvent())).statusCode, 200);
  }
  assert.equal(process.env.SUBSCRIBERS_R2_ENDPOINT, undefined);
  for (const method of methods)
    assert.equal((await handler(subscriptionEvent(method))).statusCode, 503);
});

test('Dado el handler Lambda con configuración ficticia, cuando solicita alta y baja, entonces usa el store R2 en proceso con las credenciales del parámetro api', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const fetch = vi.spyOn(globalThis, 'fetch');
  const { storage, subscribers } = simulatedSubscribers();
  const configurations: unknown[] = [];
  const readParameter = vi.fn(async (_name: string) => JSON.stringify(runtimeSecret()));
  const managed = createManagedHandler(
    { ...managedEnvironment, SUBSCRIBERS_R2_ENDPOINT: ' https://r2.example.invalid/ ' },
    {
      store: new SimulatedControlStore(),
      readParameter,
      subscribers: (value) => {
        configurations.push(value);
        return subscribers(value);
      },
    },
  );
  for (const [method, body] of [
    ['POST', '{"message":"Subscribed successfully","email":"test@example.com"}'],
    ['POST', '{"message":"Already subscribed"}'],
    ['DELETE', '{"message":"Unsubscribed successfully","email":"test@example.com"}'],
  ] as const) {
    const event = subscriptionEvent(method, { email: ' TEST@Example.com ' });
    event.requestContext.stage = '$default';
    event.requestContext.domainName = 'local.execute-api.us-east-1.amazonaws.com';
    const result = await managed(event);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body, body);
    assert.match(String(result.headers?.['x-request-id']), /^[0-9a-f-]{36}$/);
  }
  assert.deepEqual(configurations, [
    {
      endpoint: 'https://r2.example.invalid',
      region: 'auto',
      bucket: 'subscribers',
      accessKeyId: 'fake',
      secretAccessKey: 'fake',
    },
  ]);
  assert.deepEqual(
    readParameter.mock.calls.map(([name]) => name),
    ['/portfolio/prod/api'],
  );
  assert.equal(storage.objects.size, 0);
  assert.equal(fetch.mock.calls.length, 0);
  // Sin configuración de suscriptores la función api falla cerrada como faltaba la URL cloud.
  const missing = createManagedHandler(
    { ...managedEnvironment, SUBSCRIBERS_R2_BUCKET: '' },
    { store: new SimulatedControlStore(), readParameter, subscribers },
  );
  const event = subscriptionEvent();
  event.requestContext.stage = '$default';
  event.requestContext.domainName = 'local.execute-api.us-east-1.amazonaws.com';
  assert.equal((await missing(event)).statusCode, 503);
});
