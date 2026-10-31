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

export type SubscriberOperations = Pick<SubscriberStore, 'createSubscriber' | 'deleteSubscriber'>;

const unavailable = 'No se pudo conectar con el servicio de suscripciones.';
const failed = 'No se pudo procesar la suscripcion en este momento.';

/**
 * Alta y baja en proceso con el contrato que exponía portfolio-cloud: mismos mensajes,
 * claves `subscribers/<email>.json`, fallo de almacenamiento → 502 y abort/deadline → 503.
 * No registra correos.
 */
export function createSubscriptionSender(store: SubscriberOperations): SubscriptionSender {
  return async (method, dto) => {
    const signal = operationSignal(8_000);
    const startedAt = performance.now();
    const email = normalizeSubscriberEmail(dto.email);
    try {
      if (!isValidSubscriberEmail(email)) throw new SubscriptionError(400, 'Invalid email');
      const result = await abortable(signal, async (): Promise<SubscriptionResponse> => {
        if (method === 'POST')
          return (await store.createSubscriber(email, signal)) === 'exists'
            ? { message: 'Already subscribed' }
            : { message: 'Subscribed successfully', email };
        return (await store.deleteSubscriber(email, signal)) === 'missing'
          ? { message: 'Already unsubscribed' }
          : { message: 'Unsubscribed successfully', email };
      });
      runtimeMetric('subscription_provider', 'success', {
        durationMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (error) {
      if (error instanceof SubscriptionError) throw error;
      runtimeMetric('subscription_provider', signal.aborted ? 'timeout' : 'error', {
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw new SubscriptionError(
        signal.aborted ? 503 : 502,
        signal.aborted ? unavailable : failed,
      );
    }
  };
}
