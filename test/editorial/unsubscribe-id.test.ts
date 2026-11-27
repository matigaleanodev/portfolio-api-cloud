import { beforeEach, describe, expect, it } from 'vitest';
import { createSubscriberStore } from '../../packages/runtime/src/subscriptions/store.js';
import { SimulatedObjectStorage } from '../support/control.js';

const config = {
  endpoint: 'https://r2.example.invalid',
  bucket: 'subscribers',
  accessKeyId: 'id',
  secretAccessKey: 'secret',
};
const email = 'lector@example.com';
const recordKey = `subscribers/subscribers/${email}.json`;
let storage: SimulatedObjectStorage;
let store: ReturnType<typeof createSubscriberStore>;
const indexKeys = () => [...storage.objects.keys()].filter((key) => key.includes('index/'));

beforeEach(() => {
  storage = new SimulatedObjectStorage();
  store = createSubscriberStore(config, storage);
});

describe('identificador de baja', () => {
  it('es opaco, estable y conserva el registro heredado', async () => {
    storage.objects.set(recordKey, JSON.stringify({ email, createdAt: '2026-01-01T00:00:00Z' }));
    const id = (await store.ensureUnsubscribeId(email))!;
    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await store.ensureUnsubscribeId(email)).toBe(id);
    expect(JSON.parse(storage.objects.get(recordKey)!)).toEqual({
      email,
      createdAt: '2026-01-01T00:00:00Z',
      unsubscribeId: id,
    });
    expect(indexKeys()).toEqual([`subscribers/unsubscribe-index/${id}.json`]);
  });

  it('dos emisores concurrentes obtienen el mismo identificador', async () => {
    await store.createSubscriber(email);
    const [first, second] = await Promise.all([
      store.ensureUnsubscribeId(email),
      store.ensureUnsubscribeId(email),
    ]);
    expect(first).toBe(second);
  });

  it('un alta concurrente no pisa el registro ni su identificador', async () => {
    const results = await Promise.all([
      store.createSubscriber(email),
      store.createSubscriber(email),
    ]);
    expect(results.sort()).toEqual(['created', 'exists']);
  });

  it('no recrea un suscriptor inexistente', async () => {
    expect(await store.ensureUnsubscribeId(email)).toBeNull();
    expect(storage.objects.size).toBe(0);
  });

  it('da de baja una vez y las repeticiones no tienen efecto', async () => {
    await store.createSubscriber(email);
    const id = (await store.ensureUnsubscribeId(email))!;
    expect(await store.unsubscribeByToken(id)).toBe('deleted');
    expect(await store.unsubscribeByToken(id)).toBe('missing');
    expect(storage.objects.size).toBe(0);
  });

  it('un identificador desconocido o manipulado no borra nada', async () => {
    await store.createSubscriber(email);
    const id = (await store.ensureUnsubscribeId(email))!;
    const forged = `${id[0] === 'A' ? 'B' : 'A'}${id.slice(1)}`;
    expect(await store.unsubscribeByToken(forged)).toBe('missing');
    expect(await store.subscriberExists(email)).toBe(true);
  });

  it('un enlace viejo no da de baja una suscripción nueva', async () => {
    await store.createSubscriber(email);
    const old = (await store.ensureUnsubscribeId(email))!;
    const staleIndex = storage.objects.get(`subscribers/unsubscribe-index/${old}.json`)!;
    await store.deleteSubscriber(email);
    await store.createSubscriber(email);
    storage.objects.set(`subscribers/unsubscribe-index/${old}.json`, staleIndex);
    expect(await store.unsubscribeByToken(old)).toBe('missing');
    expect(await store.subscriberExists(email)).toBe(true);
  });

  it('la baja manual también elimina el índice', async () => {
    await store.createSubscriber(email);
    await store.ensureUnsubscribeId(email);
    expect(await store.deleteSubscriber(email)).toBe('deleted');
    expect(storage.objects.size).toBe(0);
  });

  it('un fallo al limpiar el índice no deshace la baja', async () => {
    await store.createSubscriber(email);
    await store.ensureUnsubscribeId(email);
    storage.failOn = (name, key) => name === 'DeleteObjectCommand' && key.includes('index/');
    expect(await store.deleteSubscriber(email)).toBe('deleted');
    expect(await store.subscriberExists(email)).toBe(false);
  });
});
