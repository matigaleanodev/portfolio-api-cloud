import type { SubscriptionConfiguration } from './config.js';
import { abortable, operationSignal, runtimeMetric } from './request-scope.js';
import type { SubscriptionEmailDto } from './subscriptions.dto.js';

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

export function createSubscriptionSender(
  config: SubscriptionConfiguration,
  request: typeof fetch,
): SubscriptionSender {
  const endpoint = `${config.baseUrl}/subscriptions`;

  return async (method, dto) => {
    const signal = operationSignal(8_000);
    const startedAt = performance.now();
    return abortable(signal, async () => {
      try {
        const response = await request(endpoint, {
          method,
          redirect: 'error',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(dto),
          signal,
        });

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          payload = null;
        }

        if (response.ok) {
          if (
            !payload ||
            typeof payload !== 'object' ||
            !('message' in payload) ||
            typeof payload.message !== 'string' ||
            ('email' in payload && payload.email !== undefined && typeof payload.email !== 'string')
          ) {
            throw new SubscriptionError(
              502,
              'El servicio de suscripciones devolvio una respuesta invalida.',
            );
          }

          return {
            message: payload.message,
            email:
              'email' in payload && typeof payload.email === 'string' ? payload.email : undefined,
          };
        }

        if (response.status >= 400 && response.status < 500) {
          const message =
            payload &&
            typeof payload === 'object' &&
            'error' in payload &&
            typeof payload.error === 'string'
              ? payload.error
              : 'No se pudo validar la solicitud de suscripcion.';
          throw new SubscriptionError(400, message);
        }

        throw new SubscriptionError(502, 'No se pudo procesar la suscripcion en este momento.');
      } catch (error) {
        if (error instanceof SubscriptionError) throw error;
        throw new SubscriptionError(503, 'No se pudo conectar con el servicio de suscripciones.');
      }
    })
      .then((result) => {
        runtimeMetric('subscription_provider', 'success', {
          durationMs: Math.round(performance.now() - startedAt),
        });
        return result;
      })
      .catch((error: unknown) => {
        runtimeMetric('subscription_provider', signal.aborted ? 'timeout' : 'error', {
          durationMs: Math.round(performance.now() - startedAt),
        });
        if (error instanceof SubscriptionError) throw error;
        throw new SubscriptionError(503, 'No se pudo conectar con el servicio de suscripciones.');
      });
  };
}
