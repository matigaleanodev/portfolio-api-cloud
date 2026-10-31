import { quotas } from '@portfolio-api-cloud/contracts/quotas';
import type { QuotaCheck, QuotaOperation, Services } from './router.js';

export type QuotaFactory = (limit: number, prefix: string, windowSeconds?: number) => QuotaCheck;

/** Una cuota por operación con la política y el prefijo de contracts/quotas. */
export function createQuotas(factory: QuotaFactory): Services['quota'] {
  const checks = Object.fromEntries(
    Object.entries(quotas).map(([id, { limit, prefix, windowSeconds }]) => [
      id,
      factory(limit, prefix, windowSeconds),
    ]),
  ) as Record<QuotaOperation, QuotaCheck>;
  return (operation) => checks[operation];
}
