import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { repositoryPath } from './paths.js';

const packagedKnowledge = JSON.parse(
  readFileSync(repositoryPath('packages/runtime/fallback/chat-knowledge.v1.json'), 'utf8'),
) as { generatedAt: string };

/**
 * Instante controlado: un día después de generado el conocimiento empaquetado. Los handlers
 * administrados lo leen del paquete real y lo rechazan pasados 30 días, así que el reloj real
 * haría vencer los tests.
 */
export const testNow = Date.parse(packagedKnowledge.generatedAt) + 86400_000;

/** Fija solo `Date`; los temporizadores siguen siendo reales salvo que el test los simule. */
export const useTestClock = () => vi.useFakeTimers({ toFake: ['Date'], now: testNow });
