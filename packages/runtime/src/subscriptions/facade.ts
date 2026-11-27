import { abortable, operationSignal, runtimeMetric } from '../request-scope.js';
import type { SubscriptionEmailDto } from './dto.js';
import { isValidSubscriberEmail, normalizeSubscriberEmail, type SubscriberStore } from './store.js';

export interface SubscriptionResponse {
  message: string;
  email?: string | undefined;
}

export type SubscriptionMethod = 'POST' | 'DELETE';
export type SubscriptionSender = (
  method: SubscriptionMethod,
  dto: SubscriptionEmailDto,
) => Promise<SubscriptionResponse>;

export class SubscriptionError extends Error {
  constructor(
    readonly statusCode: 400 | 502 | 503,
    message: string,
  ) {
    super(message);
  }
}

export type SubscriberOperations = Pick<
  SubscriberStore,
  'createSubscriber' | 'deleteSubscriber' | 'unsubscribeByToken'
>;
export type OneClickUnsubscriber = (token: string) => Promise<void>;

const unavailable = 'No se pudo conectar con el servicio de suscripciones.';
const failed = 'No se pudo procesar la suscripcion en este momento.';

/** Deadline, métrica y traducción de fallos de almacenamiento (502, o 503 si venció). */
async function withStorage<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const signal = operationSignal(8_000);
  const startedAt = performance.now();
  const metric = (outcome: 'success' | 'timeout' | 'error') =>
    runtimeMetric('subscription_provider', outcome, {
      durationMs: Math.round(performance.now() - startedAt),
    });
  try {
    const result = await abortable(signal, () => operation(signal));
    metric('success');
    return result;
  } catch (error) {
    if (error instanceof SubscriptionError) throw error;
    metric(signal.aborted ? 'timeout' : 'error');
    throw new SubscriptionError(signal.aborted ? 503 : 502, signal.aborted ? unavailable : failed);
  }
}

/** Baja por identificador opaco; no distingue si existía y no registra el identificador. */
export function createOneClickUnsubscriber(store: SubscriberOperations): OneClickUnsubscriber {
  return async (token) => {
    await withStorage((signal) => store.unsubscribeByToken(token, signal));
  };
}

/**
 * Alta y baja en proceso con el contrato que exponía portfolio-cloud: mismos mensajes,
 * claves `subscribers/<email>.json`, fallo de almacenamiento → 502 y abort/deadline → 503.
 * No registra correos.
 */
export function createSubscriptionSender(store: SubscriberOperations): SubscriptionSender {
  return async (method, dto) => {
    const email = normalizeSubscriberEmail(dto.email);
    return withStorage(async (signal): Promise<SubscriptionResponse> => {
      if (!isValidSubscriberEmail(email)) throw new SubscriptionError(400, 'Invalid email');
      if (method === 'POST')
        return (await store.createSubscriber(email, signal)) === 'exists'
          ? { message: 'Already subscribed' }
          : { message: 'Subscribed successfully', email };
      return (await store.deleteSubscriber(email, signal)) === 'missing'
        ? { message: 'Already unsubscribed' }
        : { message: 'Unsubscribed successfully', email };
    });
  };
}
