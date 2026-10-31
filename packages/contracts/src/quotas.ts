import type { OperationId } from './routes.ts';

export interface QuotaPolicy {
  readonly limit: number;
  readonly windowSeconds: number;
  /** Prefijo de la clave por IP; se conserva para no reiniciar contadores existentes. */
  readonly prefix: string;
}

export const quotas = {
  contact: { limit: 5, windowSeconds: 3600, prefix: 'contact' },
  subscribe: { limit: 10, windowSeconds: 3600, prefix: 'subscribe' },
  unsubscribe: { limit: 10, windowSeconds: 3600, prefix: 'unsubscribe' },
  chatStarters: { limit: 20, windowSeconds: 60, prefix: 'starters' },
  chat: { limit: 20, windowSeconds: 60, prefix: 'chat' },
} as const satisfies Record<Exclude<OperationId, 'health'>, QuotaPolicy>;

/** Claves compartidas en la tabla de control: `quota:<prefix>:<hmac>` y `ai:<tipo>:<día>:...`. */
export const controlKeys = {
  quota: 'quota',
  aiSession: 'ai:session',
  aiVisitor: 'ai:visitor',
  aiBudget: 'ai:budget',
} as const;

/** Generaciones pagas admitidas por sesión y por visitante en el día civil argentino. */
export const aiRequestLimit = 5;
