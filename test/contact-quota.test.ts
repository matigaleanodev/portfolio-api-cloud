import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { createQuota } from '../packages/runtime/src/quota.js';
const HOUR = 3_600_000;

test('Dados cinco intentos por IP, cuando llega el sexto y se reintenta, entonces bloquea una hora sin extender el vencimiento', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(0);
  const quota = createQuota(5, 'contact');
  for (let index = 0; index < 5; index++)
    assert.equal((await quota('a')).headers['x-ratelimit-remaining'], String(4 - index));
  vi.advanceTimersByTime(100);
  assert.deepEqual(await quota('a'), {
    blocked: true,
    headers: { 'retry-after': '3600' },
  });
  vi.advanceTimersByTime(HOUR - 1);
  assert.deepEqual(await quota('a'), {
    blocked: true,
    headers: { 'retry-after': '1' },
  });
  vi.advanceTimersByTime(1);
  assert.equal((await quota('a')).headers['x-ratelimit-remaining'], '4');
});

test('Dada una ventana iniciada por el primer intento, cuando transcurre una hora, entonces recupera todos sus puntos', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(0);
  const quota = createQuota(5, 'contact');
  await quota('a');
  vi.advanceTimersByTime(HOUR - 1);
  assert.equal((await quota('a')).headers['x-ratelimit-remaining'], '3');
  vi.advanceTimersByTime(1);
  const result = await quota('a');
  assert.equal(result.headers['x-ratelimit-remaining'], '4');
  assert.equal(result.headers['x-ratelimit-reset'], '3600');
});

test('Dadas dos IP con ventanas distintas, cuando vence el bloqueo de una, entonces se conserva el vencimiento independiente de la otra', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(0);
  const quota = createQuota(5, 'contact');
  for (let index = 0; index < 6; index++) await quota('a');
  vi.advanceTimersByTime(HOUR - 1000);
  assert.equal((await quota('b')).headers['x-ratelimit-remaining'], '4');
  vi.advanceTimersByTime(1001);
  assert.equal((await quota('a')).blocked, false);
  vi.advanceTimersByTime(HOUR);
  assert.equal((await quota('b')).headers['x-ratelimit-remaining'], '4');
});

test('Dada una ventana vencida, cuando no se ejecutó el timer de limpieza, entonces el vencimiento lógico permite otro intento', async () => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(0);
  const quota = createQuota(5, 'contact');
  await quota('a');
  vi.setSystemTime(HOUR);
  assert.equal((await quota('a')).headers['x-ratelimit-remaining'], '4');
});

test('Dadas dos composiciones de aplicación, cuando consumen cuota, entonces sus contadores locales permanecen independientes', async () => {
  const quota = createQuota(5, 'contact');
  await quota('a');
  assert.equal((await quota('a')).headers['x-ratelimit-remaining'], '3');
  assert.equal((await createQuota(5, 'contact')('a')).headers['x-ratelimit-remaining'], '4');
});
