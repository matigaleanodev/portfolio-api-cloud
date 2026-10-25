import { validateChat } from './chat/chat.dto.js';
import { ChatUnavailableError } from './chat/chat.errors.js';
import { getChatStarters, type ChatService } from './chat/chat.service.js';
import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { Configuration } from './config.js';
import type { ContactDto } from './contact.dto.js';
import { validateContact } from './contact.dto.js';
import { parseBody, bodyError } from './body.js';
import { createQuota } from './quota.js';
import { validateSubscription } from './subscriptions.dto.js';
import { SubscriptionError, type SubscriptionSender } from './subscriptions.js';
import { health } from './health.js';

export function createApplication(
  config: Configuration,
  sendContact?: (dto: ContactDto) => Promise<void>,
  sendSubscription?: SubscriptionSender,
  chat?: Pick<ChatService, 'reply'>,
  quotaFactory: typeof createQuota = createQuota,
) {
  const corsOrigins =
    typeof config.corsOrigins === 'boolean' ? config.corsOrigins : [...config.corsOrigins];
  const contactQuota = quotaFactory(5, 'contact');
  const chatQuotas = {
    starters: quotaFactory(20, 'starters', 60),
    chat: quotaFactory(20, 'chat', 60),
  };
  const subscriptionQuotas = {
    POST: quotaFactory(10, 'subscribe'),
    DELETE: quotaFactory(10, 'unsubscribe'),
  };

  return async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyStructuredResultV2> => {
    const headers: Record<string, string> = {};
    const origin = event.headers.origin;
    const method = event.requestContext.http.method;
    const reply = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => {
      if (statusCode !== 204) headers['content-type'] = 'application/json; charset=utf-8';
      return {
        statusCode,
        headers,
        body: method === 'HEAD' || statusCode === 204 ? '' : JSON.stringify(body),
        isBase64Encoded: false,
      };
    };

    if (event.version !== '2.0') {
      return reply(400, {
        message: 'Unsupported event version',
        error: 'Bad Request',
        statusCode: 400,
      });
    }

    let body: unknown;
    try {
      // El bootstrap original registra los parsers antes de CORS y seguridad.
      body = await parseBody(event);
    } catch (error) {
      const failure = bodyError(error);
      return reply(failure.statusCode, failure.body);
    }

    if (corsOrigins !== false) {
      headers.vary = 'Origin';
      if (origin && (corsOrigins === true || corsOrigins.includes(origin))) {
        headers['access-control-allow-origin'] = origin;
      }
      if (method === 'OPTIONS') {
        headers['access-control-allow-methods'] = 'GET,POST,DELETE,OPTIONS';
        headers['access-control-allow-headers'] = 'Content-Type';
        return reply(204, undefined);
      }
    }

    headers['x-content-type-options'] = 'nosniff';
    headers['x-frame-options'] = 'DENY';
    headers['referrer-policy'] = 'no-referrer';

    if ((method === 'GET' || method === 'HEAD') && /^\/api\/health\/?$/i.test(event.rawPath)) {
      return reply(200, health());
    }

    if (method === 'POST' && /^\/api\/contact\/?$/i.test(event.rawPath)) {
      const quota = await contactQuota(event.requestContext.http.sourceIp);
      Object.assign(headers, quota.headers);
      if (quota.blocked)
        return reply(429, {
          statusCode: 429,
          message: 'ThrottlerException: Too Many Requests',
        });
      let validation: ReturnType<typeof validateContact>;
      try {
        validation = validateContact(body);
      } catch {
        return reply(500, {
          statusCode: 500,
          message: 'Internal server error',
        });
      }
      const { dto, errors } = validation;
      if (errors.length)
        return reply(400, {
          message: errors,
          error: 'Bad Request',
          statusCode: 400,
        });
      if (dto.company) return reply(204, undefined);
      try {
        if (!sendContact) throw new Error('Contact provider is not configured');
        await sendContact(dto);
        return reply(204, undefined);
      } catch {
        return reply(500, {
          message: 'No se pudo procesar el mensaje de contacto.',
          error: 'Internal Server Error',
          statusCode: 500,
        });
      }
    }

    if (
      (method === 'POST' || method === 'DELETE') &&
      /^\/api\/subscriptions\/?$/i.test(event.rawPath)
    ) {
      const quota = await subscriptionQuotas[method](event.requestContext.http.sourceIp);
      Object.assign(headers, quota.headers);
      if (quota.blocked)
        return reply(429, {
          statusCode: 429,
          message: 'ThrottlerException: Too Many Requests',
        });

      try {
        const { dto, errors } = validateSubscription(body);
        if (errors.length)
          return reply(400, { message: errors, error: 'Bad Request', statusCode: 400 });

        if (!sendSubscription) throw new Error('Subscription provider is not configured');
        return reply(200, await sendSubscription(method, dto));
      } catch (error) {
        if (error instanceof SubscriptionError) {
          const names = { 400: 'Bad Request', 502: 'Bad Gateway', 503: 'Service Unavailable' };
          if (!error.message)
            return reply(error.statusCode, {
              message: names[error.statusCode],
              statusCode: error.statusCode,
            });
          return reply(error.statusCode, {
            message: error.message,
            error: names[error.statusCode],
            statusCode: error.statusCode,
          });
        }
        return reply(500, { statusCode: 500, message: 'Internal server error' });
      }
    }

    const isStarters =
      (method === 'GET' || method === 'HEAD') && /^\/api\/chat\/starters\/?$/i.test(event.rawPath);
    const isChat = method === 'POST' && /^\/api\/chat\/?$/i.test(event.rawPath);
    if (isStarters || isChat) {
      const quota = await chatQuotas[isStarters ? 'starters' : 'chat'](
        event.requestContext.http.sourceIp,
      );
      Object.assign(headers, quota.headers);
      if (quota.blocked)
        return reply(429, {
          statusCode: 429,
          message: 'ThrottlerException: Too Many Requests',
        });
      try {
        if (isStarters) return reply(200, await getChatStarters());
        const { dto, errors } = validateChat(body);
        if (errors.length)
          return reply(400, { message: errors, error: 'Bad Request', statusCode: 400 });
        if (!chat) throw new Error('Chat provider is not configured');
        return reply(201, await chat.reply(dto));
      } catch (error) {
        if (error instanceof ChatUnavailableError)
          return reply(503, {
            message: error.message,
            error: 'Service Unavailable',
            statusCode: 503,
          });
        return reply(500, { statusCode: 500, message: 'Internal server error' });
      }
    }

    return reply(404, {
      message: `Cannot ${method} ${event.rawPath}`,
      error: 'Not Found',
      statusCode: 404,
    });
  };
}
