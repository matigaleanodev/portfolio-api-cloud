import { matchesRoute, routes, type OperationId } from '@portfolio-api-cloud/contracts/routes';
import { validateChat } from '../chat/chat.dto.js';
import { ChatUnavailableError } from '../chat/chat.errors.js';
import { getChatStarters, type ChatService } from '../chat/chat.service.js';
import { validateContact, type ContactDto } from '../contact.dto.js';
import { health } from '../health.js';
import { validateSubscription } from '../subscriptions/dto.js';
import { SubscriptionError, type SubscriptionSender } from '../subscriptions/facade.js';
import type { HttpEvent, RouteResult } from './responses.js';

export type QuotaOperation = Exclude<OperationId, 'health'>;
export type QuotaCheck = (
  ip: string,
) => Promise<{ blocked: boolean; headers: Record<string, string> }>;

/** Dependencias de negocio de una operación; las ausentes responden 500 como el original. */
export interface Services {
  readonly quota: (operation: QuotaOperation) => QuotaCheck;
  readonly sendContact?: ((dto: ContactDto) => Promise<void>) | undefined;
  readonly sendSubscription?: SubscriptionSender | undefined;
  readonly chat?: Pick<ChatService, 'reply'> | undefined;
}

/** El control compartido no respondió: se traduce en 503 con la forma de configuración. */
export class ControlUnavailableError extends Error {}

export const chatOperations = ['chatStarters', 'chat'] as const satisfies readonly OperationId[];
export const allOperations = Object.keys(routes) as OperationId[];

export function resolveOperation(
  method: string,
  rawPath: string,
  operations: readonly OperationId[],
): OperationId | undefined {
  return operations.find((id) => matchesRoute(routes[id], method, rawPath));
}

export const isChatOperation = (operation: OperationId | undefined) =>
  operation === 'chatStarters' || operation === 'chat';

const throttled: RouteResult = {
  statusCode: 429,
  body: { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
};
const internal: RouteResult = {
  statusCode: 500,
  body: { statusCode: 500, message: 'Internal server error' },
};

/** Router por regex de contracts/routes: cuota → DTO → servicio; sin coincidencia → 404. */
export async function route(
  event: HttpEvent,
  operation: OperationId | undefined,
  body: unknown,
  headers: Record<string, string>,
  services: Services | undefined,
): Promise<RouteResult> {
  const method = event.requestContext.http.method;
  if (operation === 'health') return { statusCode: 200, body: health() };
  if (!operation || !services)
    return {
      statusCode: 404,
      body: { message: `Cannot ${method} ${event.rawPath}`, error: 'Not Found', statusCode: 404 },
    };

  let quota: Awaited<ReturnType<QuotaCheck>>;
  try {
    quota = await services.quota(operation)(event.requestContext.http.sourceIp);
  } catch (error) {
    throw new ControlUnavailableError('Quota unavailable', { cause: error });
  }
  Object.assign(headers, quota.headers);
  if (quota.blocked) return throttled;

  if (operation === 'contact') {
    let validation: ReturnType<typeof validateContact>;
    try {
      validation = validateContact(body);
    } catch {
      return internal;
    }
    const { dto, errors } = validation;
    if (errors.length)
      return { statusCode: 400, body: { message: errors, error: 'Bad Request', statusCode: 400 } };
    if (dto.company) return { statusCode: 204 };
    try {
      if (!services.sendContact) throw new Error('Contact provider is not configured');
      await services.sendContact(dto);
      return { statusCode: 204 };
    } catch {
      return {
        statusCode: 500,
        body: {
          message: 'No se pudo procesar el mensaje de contacto.',
          error: 'Internal Server Error',
          statusCode: 500,
        },
      };
    }
  }

  if (operation === 'subscribe' || operation === 'unsubscribe') {
    try {
      const { dto, errors } = validateSubscription(body);
      if (errors.length)
        return {
          statusCode: 400,
          body: { message: errors, error: 'Bad Request', statusCode: 400 },
        };
      if (!services.sendSubscription) throw new Error('Subscription provider is not configured');
      return {
        statusCode: 200,
        body: await services.sendSubscription(operation === 'subscribe' ? 'POST' : 'DELETE', dto),
      };
    } catch (error) {
      if (!(error instanceof SubscriptionError)) return internal;
      const names = { 400: 'Bad Request', 502: 'Bad Gateway', 503: 'Service Unavailable' };
      return {
        statusCode: error.statusCode,
        body: error.message
          ? { message: error.message, error: names[error.statusCode], statusCode: error.statusCode }
          : { message: names[error.statusCode], statusCode: error.statusCode },
      };
    }
  }

  try {
    if (operation === 'chatStarters') return { statusCode: 200, body: await getChatStarters() };
    const { dto, errors } = validateChat(body);
    if (errors.length)
      return { statusCode: 400, body: { message: errors, error: 'Bad Request', statusCode: 400 } };
    if (!services.chat) throw new Error('Chat provider is not configured');
    return { statusCode: 201, body: await services.chat.reply(dto) };
  } catch (error) {
    if (error instanceof ChatUnavailableError)
      return {
        statusCode: 503,
        body: { message: error.message, error: 'Service Unavailable', statusCode: 503 },
      };
    return internal;
  }
}
