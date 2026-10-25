import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApplication } from '../src/application.js';
import { readConfiguration, readContactConfiguration } from '../src/config.js';
import { createContactSender, createResendProvider } from '../src/contact.js';
import { validateContact, type ContactDto } from '../src/contact.dto.js';
import type { ContactEmail } from '../src/contact.js';
import { parseBody, bodyError } from '../src/body.js';
import { httpEvent } from './fixtures.js';

interface Reference {
  validation: {
    label: string;
    input: unknown;
    expected: { statusCode: number; body: unknown; sent: unknown };
  }[];
  parsing: {
    label: string;
    body: string;
    headers: Record<string, string>;
    isBase64Encoded: boolean;
    expected: { statusCode: number; body: unknown };
  }[];
}
const reference = JSON.parse(readFileSync('test/contact-reference.json', 'utf8')) as Reference;

function validationDescription(scenario: Reference['validation'][number]): string {
  const fields: Record<string, string> = {
    name: 'nombre',
    email: 'correo',
    message: 'mensaje',
    company: 'campo trampa',
  };
  const [field, ...parts] = scenario.label.split(' ');
  if (!field || !fields[field])
    return (
      (
        {
          'válido sin normalización': 'un contacto válido con valores sin normalizar',
          null: 'un cuerpo nulo',
          'objeto vacío': 'un objeto sin campos',
          'array vacío': 'un arreglo vacío en la raíz',
          'array de contacto': 'un arreglo de contactos en la raíz',
          'claves de prototipo': 'un objeto con claves de prototipo',
          'campo extra escalar': 'un campo extra escalar',
          'campo extra anidado': 'un campo extra anidado',
          'varios campos extra': 'varios campos extra',
        } as Record<string, string>
      )[scenario.label] ?? scenario.label
    );
  let detail = parts.join(' ');
  if (field === 'email') {
    const emails: Record<string, string> = {
      'a@b': 'sin dominio completo',
      ' a@example.com': 'con espacio inicial',
      'a@example.com ': 'con espacio final',
      'a+b@example.com': 'con alias mediante signo más',
      '"a b"@example.com': 'con espacio entre comillas en la parte local',
      'á@example.com': 'con carácter Unicode en la parte local',
      'a@localhost': 'con dominio local',
      'a@127.0.0.1': 'con dirección IP como dominio',
      'a..b@example.com': 'con puntos consecutivos',
      'a_b@example.com': 'con guion bajo en la parte local',
    };
    detail = emails[detail] ?? detail;
  }
  if (detail.length > 100)
    detail = `de ${String((scenario.input as Record<string, unknown>)[field]).length} caracteres`;
  const descriptions: Record<string, string> = {
    null: 'nulo',
    '""': 'vacío',
    '1': 'numérico',
    true: 'booleano',
    '200': 'numérico',
    '[]': 'como arreglo',
    '{}': 'como objeto',
    '" "': 'con un espacio',
    '"  "': 'con dos espacios',
    ausente: 'ausente',
    'astral en límite': 'con caracteres astrales en el límite',
    'espacios válidos': 'con espacios válidos',
  };
  return `el campo ${fields[field]} ${descriptions[detail] ?? detail}`;
}
function validationOutcome(scenario: Reference['validation'][number]): string {
  if (scenario.expected.statusCode !== 204 || scenario.label === 'claves de prototipo')
    return 'se rechaza con los mensajes de validación previstos';
  return scenario.expected.sent === null
    ? 'se acepta sin solicitar un envío'
    : 'se acepta conservando sus valores originales';
}
const parsingDescriptions = [
  'un JSON válido',
  'un cuerpo JSON vacío',
  'un JSON truncado',
  'un valor JSON nulo',
  'un texto JSON en la raíz',
  'un número JSON en la raíz',
  'un booleano JSON en la raíz',
  'un arreglo JSON vacío',
  'un arreglo JSON numérico',
  'un JSON con coma final',
  'un JSON con marca BOM',
  'un JSON UTF-16',
  'un JSON con charset no soportado',
  'un JSON con MIME no reconocido',
  'un JSON con MIME vendor sin parser',
  'un JSON con MIME en mayúsculas',
  'un JSON de 16 KiB',
  'un JSON mayor a 16 KiB',
  'un JSON gzip',
  'un gzip cuyo contenido expandido excede 16 KiB',
  'un JSON deflate',
  'un deflate cuyo contenido expandido excede 16 KiB',
  'un JSON Brotli',
  'un Brotli cuyo contenido expandido excede 16 KiB',
  'una codificación no soportada',
  'un gzip corrupto',
  'un formulario de contacto válido',
  'un formulario con objetos y arreglos anidados',
  'un formulario con arreglo en el campo trampa',
  'un formulario con claves de prototipo',
  'un formulario con claves repetidas',
  'un formulario con escape UTF-8 incompleto',
  'un formulario de 16 KiB',
  'un formulario mayor a 16 KiB',
  'un formulario Latin-1',
  'un formulario con charset no soportado',
];

const valid = {
  name: 'Juan Perez',
  email: 'User@Example.COM',
  message: 'Hola, mensaje de contacto.',
};
const config = readContactConfiguration({
  RESEND_API_KEY: 're_test_fake',
  CONTACT_FROM_EMAIL: 'from@example.invalid',
  CONTACT_TO_EMAIL: 'to@example.invalid',
});

function contactEvent(input: unknown = valid) {
  const event = httpEvent('POST', '/api/contact');
  event.headers['content-type'] = 'application/json';
  event.body = JSON.stringify(input);
  return event;
}

for (const scenario of reference.validation) {
  test(`Dado ${validationDescription(scenario)}, cuando se valida el contacto, entonces ${validationOutcome(scenario)}`, async () => {
    let expected = scenario.expected;
    // Cambios explícitos al usar las librerías directamente, sin reproducir ValidationPipe.
    if (scenario.label === 'array vacío' || scenario.label === 'array de contacto') {
      expected = {
        statusCode: 400,
        body: {
          message: ['body must be an object'],
          error: 'Bad Request',
          statusCode: 400,
        },
        sent: null,
      };
    }
    if (scenario.label === 'claves de prototipo') {
      expected = {
        statusCode: 400,
        body: {
          message: ['property prototype should not exist'],
          error: 'Bad Request',
          statusCode: 400,
        },
        sent: null,
      };
    }
    const validation = validateContact(structuredClone(scenario.input));
    if (validation.errors.length) {
      assert.deepEqual(
        { message: validation.errors, error: 'Bad Request', statusCode: 400 },
        expected.body,
      );
    } else {
      assert.equal(expected.statusCode, 204);
      assert.deepEqual(
        validation.dto.company ? null : JSON.parse(JSON.stringify(validation.dto)),
        expected.sent,
      );
    }
    // null y cuerpos grandes se rechazan antes del DTO; su transporte tiene fixtures propios.
    if (scenario.input === null || Buffer.byteLength(JSON.stringify(scenario.input)) > 16384)
      return;
    let sent: unknown = null;
    const app = createApplication(readConfiguration({}), async (dto) => {
      sent = JSON.parse(JSON.stringify(dto));
    });
    const result = await app(contactEvent(scenario.input));
    assert.equal(result.statusCode, expected.statusCode);
    assert.deepEqual(
      result.statusCode === 204 ? result.body : JSON.parse(result.body ?? ''),
      expected.body,
    );
    assert.deepEqual(sent, expected.sent);
    assert.equal(result.headers?.['x-ratelimit-remaining'], '4');
    if (result.statusCode === 204) assert.equal(result.headers?.['content-type'], undefined);
  });
}

for (const [index, scenario] of reference.parsing.entries()) {
  test(`Dado ${parsingDescriptions[index]}, cuando se interpreta el cuerpo, entonces ${scenario.expected.statusCode === 200 ? 'se obtiene el contenido esperado' : 'se rechaza con estado ' + scenario.expected.statusCode}`, async () => {
    const event = contactEvent();
    event.body = scenario.body;
    event.headers = scenario.headers;
    event.isBase64Encoded = scenario.isBase64Encoded;
    let actual: { statusCode: number; body: unknown };
    try {
      actual = { statusCode: 200, body: (await parseBody(event)) ?? null };
    } catch (error) {
      actual = bodyError(error);
    }
    assert.deepEqual(actual, scenario.expected);
  });
}

test('Dado un contacto válido, cuando el envío sigue pendiente, entonces espera al proveedor y conserva texto, fecha argentina, asunto y destinos', async () => {
  let email: ContactEmail | undefined;
  let finish: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const sender = createContactSender(
    config,
    async (value) => {
      email = value;
      await gate;
    },
    () => new Date('2026-10-24T02:03:04Z'),
  );
  const app = createApplication(readConfiguration({}), sender);
  let completed = false;
  const pending = app(contactEvent()).then((result) => {
    completed = true;
    return result;
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(completed, false);
  assert.deepEqual(email, {
    from: config.fromEmail,
    to: config.toEmail,
    subject: 'Nuevo mensaje desde el portfolio',
    text:
      'Nuevo mensaje de contacto\n\n          Nombre: Juan Perez\n          Email: User@Example.COM\n          Fecha: ' +
      new Date('2026-10-24T02:03:04Z').toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }) +
      '\n\n          Mensaje:\n          Hola, mensaje de contacto.',
  });
  finish!();
  assert.equal((await pending).statusCode, 204);
});

test('Dado el campo trampa company, cuando tiene un valor válido o inválido, entonces omite el envío o responde 400 respectivamente', async () => {
  let calls = 0;
  const app = createApplication(readConfiguration({}), async () => {
    calls++;
  });
  assert.equal((await app(contactEvent({ ...valid, company: 'ACME' }))).statusCode, 204);
  assert.equal((await app(contactEvent({ ...valid, company: 1 }))).statusCode, 400);
  assert.equal(calls, 0);
});

test('Dada la ruta de contacto, cuando varían mayúsculas, barra final, stage o método, entonces conserva el enrutamiento acordado', async () => {
  const app = createApplication(readConfiguration({}), async () => {});
  const event = contactEvent();
  event.rawPath = '/API/CONTACT/';
  event.requestContext.http.path = '/stage/api/contact';
  event.rawQueryString = 'ignored=1';
  assert.equal((await app(event)).statusCode, 204);
  for (const method of ['GET', 'HEAD', 'DELETE', 'PUT'])
    assert.equal((await app(httpEvent(method, '/api/contact'))).statusCode, 404);
  event.rawPath = '/stage/api/contact';
  assert.equal((await app(event)).statusCode, 404);
});

test('Dado un contacto en formulario o base64 UTF-8, cuando se procesa, entonces respeta el DTO y conserva los caracteres originales', async () => {
  const calls: ContactDto[] = [];
  const app = createApplication(readConfiguration({}), async (dto) => {
    calls.push(dto);
  });
  const event = contactEvent();
  event.headers['content-type'] = 'application/x-www-form-urlencoded';
  event.body = new URLSearchParams(valid).toString();
  assert.equal((await app(event)).statusCode, 204);
  event.body += '&company[nested]=value';
  assert.equal((await app(event)).statusCode, 400);
  event.headers['content-type'] = 'application/json';
  event.body = Buffer.from(JSON.stringify({ ...valid, name: 'José 😀' })).toString('base64');
  event.isBase64Encoded = true;
  assert.equal((await app(event)).statusCode, 204);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.name, 'José 😀');
});

test('Dado un cuerpo mal formado, cuando ingresa a contacto, entonces falla antes de CORS, seguridad, cuota y proveedor', async () => {
  let calls = 0;
  const app = createApplication(readConfiguration({ CORS_ORIGIN: '*' }), async () => {
    calls++;
  });
  const event = contactEvent();
  event.headers.origin = 'https://frontend.example.invalid';
  event.body = '{';
  for (let index = 0; index < 8; index++) {
    const result = await app(event);
    assert.equal(result.statusCode, 400);
    assert.equal(result.headers?.['access-control-allow-origin'], undefined);
    assert.equal(result.headers?.['x-frame-options'], undefined);
    assert.equal(result.headers?.['x-ratelimit-limit'], undefined);
  }
  event.body = JSON.stringify(valid);
  const success = await app(event);
  assert.equal(success.statusCode, 204);
  assert.equal(success.headers?.['access-control-allow-origin'], event.headers.origin);
  assert.equal(success.headers?.['x-ratelimit-remaining'], '4');
  assert.equal(calls, 1);
});

test('Dado un origen permitido, cuando contacto responde 400, 429 o 500, entonces conserva los headers CORS y de seguridad', async () => {
  const app = createApplication(readConfiguration({ CORS_ORIGIN: '*' }), async () => {
    throw new Error('dato sensible simulado');
  });
  const event = contactEvent();
  event.headers.origin = 'https://frontend.example.invalid';
  for (const [input, status] of [
    [{ ...valid, name: 'x' }, 400],
    [valid, 500],
  ] as const) {
    event.body = JSON.stringify(input);
    const result = await app(event);
    assert.equal(result.statusCode, status);
    assert.equal(result.headers?.['access-control-allow-origin'], event.headers.origin);
    assert.equal(result.headers?.['x-frame-options'], 'DENY');
    assert.equal(result.body?.includes('dato sensible'), false);
  }
  for (let index = 0; index < 3; index++) await app(event);
  const limited = await app(event);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers?.['access-control-allow-origin'], event.headers.origin);
  assert.equal(limited.headers?.['x-frame-options'], 'DENY');
});

test('Dada la cuota de cinco intentos por hora e IP, cuando hay validaciones, trampas o fallos, entonces cuentan y health u otros métodos quedan fuera', async () => {
  let calls = 0;
  const app = createApplication(readConfiguration({}), async () => {
    calls++;
  });
  for (let index = 0; index < 20; index++) {
    assert.equal((await app(httpEvent())).statusCode, 200);
    assert.equal((await app(httpEvent('DELETE', '/api/contact'))).statusCode, 404);
    assert.equal((await app(httpEvent('POST', '/api/chat'))).statusCode, 400);
  }
  for (let index = 0; index < 5; index++) {
    const event = contactEvent(index % 2 ? { ...valid, name: '' } : { ...valid, company: 'bot' });
    event.headers['x-forwarded-for'] = `203.0.113.${index}`;
    const result = await app(event);
    assert.equal(result.statusCode, index % 2 ? 400 : 204);
    assert.equal(result.headers?.['x-ratelimit-remaining'], String(4 - index));
  }
  const limited = await app(contactEvent());
  assert.equal(limited.statusCode, 429);
  assert.deepEqual(JSON.parse(limited.body ?? ''), {
    statusCode: 429,
    message: 'ThrottlerException: Too Many Requests',
  });
  assert.equal(limited.headers?.['retry-after'], '3600');
  assert.equal(limited.headers?.['x-ratelimit-limit'], undefined);
  const other = contactEvent();
  other.requestContext.http.sourceIp = '192.0.2.2';
  assert.equal((await app(other)).statusCode, 204);
  assert.equal(calls, 1);
});

test('Dadas solicitudes simultáneas, cuando esperan al proveedor, entonces reservan cuota antes del envío y solo admiten cinco', async () => {
  let calls = 0;
  const app = createApplication(readConfiguration({}), async () => {
    calls++;
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => app(contactEvent())));
  assert.equal(results.filter((result) => result.statusCode === 204).length, 5);
  assert.equal(results.filter((result) => result.statusCode === 429).length, 5);
  assert.equal(calls, 5);
});

test('Dada la configuración de contacto, cuando faltan sus claves o contienen espacios, entonces valida su presencia sin transformar valores', () => {
  assert.throws(
    () => readContactConfiguration({}),
    /RESEND_API_KEY, CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL/,
  );
  assert.throws(
    () =>
      readContactConfiguration({
        RESEND_API_KEY: ' ',
        CONTACT_FROM_EMAIL: 'from',
        CONTACT_TO_EMAIL: 'to',
      }),
    /RESEND_API_KEY/,
  );
  const actual = readContactConfiguration({
    RESEND_API_KEY: ' key ',
    CONTACT_FROM_EMAIL: ' from ',
    CONTACT_TO_EMAIL: ' to ',
  });
  assert.deepEqual(actual, {
    apiKey: ' key ',
    fromEmail: ' from ',
    toEmail: ' to ',
  });
  assert.equal(Object.isFrozen(actual), true);
});

test('Dado un proveedor ausente, cuando se solicita contacto y luego health, entonces responde 500 controlado y mantiene health disponible', async () => {
  const app = createApplication(readConfiguration({}));
  assert.equal((await app(contactEvent())).statusCode, 500);
  assert.equal((await app(httpEvent())).statusCode, 200);
});

test('Dado el SDK Resend con respuesta simulada, cuando se envía un contacto, entonces usa endpoint, autorización y payload previstos en un solo intento', async () => {
  const calls: { input: unknown; init: RequestInit | undefined }[] = [];
  const request: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    return new Response('{"id":"fake"}', { status: 200 });
  };
  vi.spyOn(globalThis, 'fetch').mockImplementation(request);
  const sender = createContactSender(config, createResendProvider(config));
  const app = createApplication(readConfiguration({}), sender);
  assert.equal((await app(contactEvent())).statusCode, 204);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.input, 'https://api.resend.com/emails');
  assert.equal(calls[0]?.init?.method, 'POST');
  const headers = new Headers(calls[0]?.init?.headers);
  assert.equal(headers.get('authorization'), 'Bearer re_test_fake');
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('user-agent'), 'portfolio-api-cloud');
  const email = JSON.parse(String(calls[0]?.init?.body)) as ContactEmail;
  assert.equal(email.from, config.fromEmail);
  assert.equal(email.to, config.toEmail);
  assert.equal(email.text.includes(valid.email), true);
});

for (const [label, response] of [
  ['error HTTP', () => new Response('{"message":"privado"}', { status: 429 })],
  [
    'rechazo de red',
    () => {
      throw new Error('privado');
    },
  ],
  ['JSON inválido', () => new Response('{')],
] as const) {
  test(`Dado un ${label} del proveedor, cuando se envía un contacto, entonces responde 500 controlado sin reintentos`, async () => {
    let calls = 0;
    const request: typeof fetch = async () => {
      calls++;
      return response();
    };
    vi.spyOn(globalThis, 'fetch').mockImplementation(request);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const app = createApplication(
      readConfiguration({}),
      createContactSender(config, createResendProvider(config)),
    );
    const result = await app(contactEvent());
    assert.equal(result.statusCode, 500);
    assert.deepEqual(JSON.parse(result.body ?? ''), {
      message: 'No se pudo procesar el mensaje de contacto.',
      error: 'Internal Server Error',
      statusCode: 500,
    });
    assert.equal(calls, 1);
  });
}

test('Dado un error devuelto por el proveedor, cuando finaliza el envío, entonces responde 500 sin exponer el detalle privado', async () => {
  const sender = createContactSender(config, async () => ({
    error: { message: 'privado' },
  }));
  const result = await createApplication(readConfiguration({}), sender)(contactEvent());
  assert.equal(result.statusCode, 500);
  assert.equal(result.body?.includes('privado'), false);
});

test('Dadas respuestas atípicas del SDK Resend, cuando no informa un error, entonces conserva su envelope sin validar data adicional', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  for (const [status, body] of [
    [200, 'null'],
    [200, '{"error":"es data"}'],
    [429, 'null'],
  ] as const) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(body, { status }));
    const provider = createResendProvider(config);
    const result = await createApplication(
      readConfiguration({}),
      createContactSender(config, provider),
    )(contactEvent());
    assert.equal(result.statusCode, 204);
  }
});

test('Dado un contacto codificado o comprimido, cuando su tamaño expandido supera 16 KiB, entonces responde 413 sin enviarlo', async () => {
  const { gzipSync } = await import('node:zlib');
  let calls = 0;
  const app = createApplication(readConfiguration({}), async () => {
    calls++;
  });
  const event = contactEvent();
  const exact = JSON.stringify(valid).padEnd(16384, ' ');
  event.body = exact;
  assert.equal((await app(event)).statusCode, 204);
  event.body += ' ';
  assert.equal((await app(event)).statusCode, 413);
  event.isBase64Encoded = true;
  event.body = Buffer.from(exact).toString('base64');
  assert.equal((await app(event)).statusCode, 204);
  event.headers['content-encoding'] = 'gzip';
  event.body = gzipSync(Buffer.from(exact)).toString('base64');
  assert.equal((await app(event)).statusCode, 204);
  event.body = gzipSync(Buffer.from(exact + ' ')).toString('base64');
  assert.equal((await app(event)).statusCode, 413);
  assert.equal(calls, 3);
});

test('Dado NODE_ENV production, cuando Resend devuelve un error, entonces responde 500 sin registrar detalles del proveedor', async () => {
  const previous = process.env.NODE_ENV;
  const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () => new Response('{"message":"detalle ficticio"}', { status: 429 }),
  );
  try {
    process.env.NODE_ENV = 'production';
    const app = createApplication(
      readConfiguration({}),
      createContactSender(config, createResendProvider(config)),
    );
    assert.equal((await app(contactEvent())).statusCode, 500);
    assert.equal(logs.mock.calls.length, 0);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
