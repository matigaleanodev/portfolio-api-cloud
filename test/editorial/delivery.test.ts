import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDeliveryLedger,
  reconciliationWindowMs,
} from '../../packages/runtime/src/editorial/delivery-ledger.js';
import {
  createBlogNotifier,
  type SendBlogEmail,
} from '../../packages/runtime/src/editorial/email.js';
import { notifyPost } from '../../packages/runtime/src/editorial/notify-post.js';
import { SimulatedDeliveryStore } from '../support/delivery.js';

const post = { title: 'Post', url: 'https://matiasgaleano.dev/blog/post' };
const config = { apiKey: 're_test', fromEmail: 'blog@example.invalid' };
const secret = 'k'.repeat(32);
type Reply = Awaited<ReturnType<SendBlogEmail>>;
const accepted: Reply = { data: { id: 'email_1' }, error: null };
const failure = (name: string, statusCode: number | null): Reply => ({
  data: null,
  error: { name, statusCode, message: `falló para lector@example.com` },
});
const ambiguous = failure('application_error', null);

let store: SimulatedDeliveryStore;
let now: number;
let subscribers: string[];
let calls: { to: string; key: string; payload: string }[];
let replies: Map<string, Reply[]>;
let logs: string[];

beforeEach(() => {
  store = new SimulatedDeliveryStore();
  now = Date.parse('2026-11-27T12:00:00Z');
  subscribers = ['uno@example.com', 'dos@example.com', 'tres@example.com'];
  calls = [];
  replies = new Map();
  logs = [];
  for (const level of ['info', 'error', 'warn', 'log'] as const)
    vi.spyOn(console, level).mockImplementation((...values: unknown[]) => {
      logs.push(values.map(String).join(' '));
    });
});

const send: SendBlogEmail = async (email, options) => {
  calls.push({ to: email.to, key: options!.idempotencyKey!, payload: JSON.stringify(email) });
  return replies.get(email.to)?.shift() ?? accepted;
};

function run(
  overrides: {
    remainingMs?: () => number;
    send?: SendBlogEmail;
    onUnsubscribeId?: (email: string) => void;
  } = {},
) {
  return notifyPost(
    post,
    async () => ({
      listSubscriberEmails: async () => subscribers,
      unsubscribeId: async (email) => {
        overrides.onUnsubscribeId?.(email);
        return `id-${email.split('@')[0]}`;
      },
      ledger: createDeliveryLedger(store, secret, () => now),
      notify: createBlogNotifier(config, overrides.send ?? send),
      sleep: async () => undefined,
    }),
    overrides.remainingMs ? { remainingMs: overrides.remainingMs } : {},
  );
}
const to = (email: string) => calls.filter((call) => call.to === email);
const statuses = () => [...store.records.values()].map((record) => record.status).sort();
const incomplete = { name: 'NotificationIncompleteError' };

describe('envío sin duplicados', () => {
  it('registra cada aceptación y no reenvía al repetir la publicación', async () => {
    await expect(run()).resolves.toMatchObject({ statusCode: 200 });
    expect(statuses()).toEqual(['sent', 'sent', 'sent']);
    now += 30 * 86400_000;
    const repeated = await run();
    expect(JSON.parse(repeated.body).recipients).toBe(3);
    expect(calls).toHaveLength(3);
  });

  it('tras un fallo parcial sigue con el resto y reintenta solo lo pendiente', async () => {
    replies.set('dos@example.com', [failure('validation_error', 422)]);
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(calls).toHaveLength(3);
    await expect(run()).resolves.toMatchObject({ statusCode: 200 });
    expect(calls).toHaveLength(4);
    expect(to('uno@example.com')).toHaveLength(1);
    // Rechazo definitivo: clave nueva, porque el proveedor no aceptó la anterior.
    expect(to('dos@example.com')[1]!.key).not.toBe(to('dos@example.com')[0]!.key);
  });

  it.each([
    ['timeout o red', ambiguous],
    ['5xx', failure('application_error', 500)],
    ['petición concurrente', failure('concurrent_idempotent_requests', 409)],
    ['aceptación sin id', { data: null, error: null }],
  ])(
    'respuesta ambigua (%s): reintenta con la misma clave y el mismo cuerpo',
    async (_n, reply) => {
      replies.set('uno@example.com', [reply]);
      await expect(run()).rejects.toMatchObject(incomplete);
      now += 3600_000;
      await expect(run()).resolves.toMatchObject({ statusCode: 200 });
      const [first, second] = to('uno@example.com');
      expect(second).toEqual(first);
      expect(first!.key.length).toBeLessThanOrEqual(256);
    },
  );

  it('una excepción del transporte también es ambigua', async () => {
    const throwing: SendBlogEmail = async () => {
      throw new Error('socket hang up uno@example.com');
    };
    await expect(run({ send: throwing })).rejects.toMatchObject(incomplete);
    expect(statuses()).toEqual(['uncertain', 'uncertain', 'uncertain']);
  });

  it('un rechazo posterior no borra la duda de un intento ambiguo', async () => {
    subscribers = ['uno@example.com'];
    replies.set('uno@example.com', [ambiguous, failure('rate_limit_exceeded', 429)]);
    await expect(run()).rejects.toMatchObject(incomplete);
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(statuses()).toEqual(['uncertain']);
    await run();
    expect(new Set(calls.map((call) => call.key)).size).toBe(1);
  });

  it('fuera de la ventana no reenvía lo dudoso y lo deja en revisión', async () => {
    subscribers = ['uno@example.com'];
    replies.set('uno@example.com', [ambiguous]);
    await expect(run()).rejects.toMatchObject(incomplete);
    now += reconciliationWindowMs;
    await expect(run()).rejects.toMatchObject(incomplete);
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(calls).toHaveLength(1);
    expect(statuses()).toEqual(['review']);
  });

  it('justo antes del límite todavía reconcilia', async () => {
    subscribers = ['uno@example.com'];
    replies.set('uno@example.com', [ambiguous]);
    await expect(run()).rejects.toMatchObject(incomplete);
    now += reconciliationWindowMs - 1;
    await expect(run()).resolves.toMatchObject({ statusCode: 200 });
    expect(calls).toHaveLength(2);
  });

  it('la ventana queda por debajo de las 24 h del proveedor', () => {
    expect(reconciliationWindowMs).toBe(23 * 3600_000);
  });

  it('clave reutilizada con otro cuerpo pasa a revisión', async () => {
    subscribers = ['uno@example.com'];
    replies.set('uno@example.com', [failure('invalid_idempotent_request', 409)]);
    await expect(run()).rejects.toMatchObject(incomplete);
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(calls).toHaveLength(1);
    expect(statuses()).toEqual(['review']);
  });

  it('si no puede guardar la aceptación, la reconcilia con la misma clave', async () => {
    subscribers = ['uno@example.com'];
    store.failWrites = (record) => record.status === 'sent';
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(statuses()).toEqual(['sending']);
    store.failWrites = undefined;
    // Con la reserva vigente nadie más envía.
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(calls).toHaveLength(1);
    now += 61_000;
    await expect(run()).resolves.toMatchObject({ statusCode: 200 });
    expect(calls[1]).toEqual(calls[0]);
  });

  it('lo ya resuelto no vuelve a consultar al almacenamiento de suscriptores', async () => {
    replies.set('dos@example.com', [failure('invalid_idempotent_request', 409)]);
    await expect(run()).rejects.toMatchObject(incomplete);
    const asked: string[] = [];
    await expect(run({ onUnsubscribeId: (email) => asked.push(email) })).rejects.toMatchObject(
      incomplete,
    );
    expect(asked).toEqual([]);
    expect(calls).toHaveLength(3);
  });

  it('cada envío pendiente queda identificable en logs por su registro, sin correos', async () => {
    replies.set('uno@example.com', [failure('invalid_idempotent_request', 409)]);
    await expect(run()).rejects.toMatchObject(incomplete);
    const pk = [...store.records.values()].find((record) => record.status === 'review')!.pk;
    for (const attempt of [
      logs.join('\n'),
      ((logs.length = 0), await run().catch(() => logs.join('\n'))),
    ])
      expect(attempt).toContain(pk);
    expect(logs.join('\n')).not.toMatch(/@example\.com/);
  });

  it('sin registro disponible no envía', async () => {
    store.failWrites = () => true;
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(calls).toHaveLength(0);
  });

  it('dos ejecuciones concurrentes envían una sola vez a cada destinatario', async () => {
    // Cada corrida puede terminar incompleta si encuentra reservas de la otra.
    await Promise.allSettled([run(), run()]);
    await expect(run()).resolves.toMatchObject({ statusCode: 200 });
    expect(calls.map((call) => call.to).sort()).toEqual([...subscribers].sort());
  });

  it('otro post es otro envío', async () => {
    subscribers = ['uno@example.com'];
    await run();
    const ledger = createDeliveryLedger(store, secret, () => now);
    expect((await ledger.claim('https://matiasgaleano.dev/blog/otro', subscribers[0]!)).kind).toBe(
      'send',
    );
    for (const variant of [`${post.url}/`, `${post.url}?ref=x`])
      expect((await ledger.claim(variant, ' UNO@example.com ')).kind).toBe('sent');
  });
});

describe('límites de la ejecución y del proveedor', () => {
  it('deja sin reservar lo que no entra en el tiempo disponible', async () => {
    let remaining = 30_000;
    const slow: SendBlogEmail = async (email, options) => {
      remaining -= 15_000;
      return send(email, options);
    };
    await expect(run({ send: slow, remainingMs: () => remaining })).rejects.toMatchObject(
      incomplete,
    );
    expect(calls).toHaveLength(2);
    expect(store.records.size).toBe(2);
  });

  it.each([
    ['daily_quota_exceeded', 429],
    ['monthly_quota_exceeded', 429],
    ['invalid_api_key', 403],
  ])('corta la corrida ante %s', async (name, status) => {
    replies.set('uno@example.com', [failure(name, status)]);
    await expect(run()).rejects.toMatchObject(incomplete);
    expect(calls).toHaveLength(1);
    await expect(run()).resolves.toMatchObject({ statusCode: 200 });
  });

  it('omite a quien se dio de baja entre el listado y el envío', async () => {
    const response = await notifyPost(post, async () => ({
      listSubscriberEmails: async () => ['baja@example.com'],
      unsubscribeId: async () => null,
      ledger: createDeliveryLedger(store, secret, () => now),
      notify: createBlogNotifier(config, send),
      sleep: async () => undefined,
    }));
    expect(JSON.parse(response.body).recipients).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it('usa los encabezados de baja en un clic con el identificador opaco', async () => {
    subscribers = ['uno@example.com'];
    await run();
    expect(JSON.parse(calls[0]!.payload).headers).toEqual({
      'List-Unsubscribe': '<https://api.matiasgaleano.dev/api/subscriptions/one-click?t=id-uno>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });

  it('ni el registro, ni la clave, ni los logs, ni el error conservan correos', async () => {
    replies.set('uno@example.com', [failure('validation_error', 422)]);
    const error = await run().catch((reason: Error) => reason);
    const persisted = JSON.stringify([...store.records.values()]);
    for (const text of [persisted, logs.join('\n'), String((error as Error).message)])
      expect(text).not.toMatch(/@example\.com/);
    expect(calls.map((call) => call.key).join()).not.toContain('example');
  });
});
