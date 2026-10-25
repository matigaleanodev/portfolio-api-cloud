import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { Configuration } from './config.js';
import type { ContactDto } from './contact.dto.js';
import { validateContact } from './contact.dto.js';
import { parseBody, bodyError } from './body.js';
import { createContactQuota } from './contact-quota.js';
import { health } from './health.js';

export function createApplication(
  config: Configuration,
  sendContact?: (dto: ContactDto) => Promise<void>,
) {
  const corsOrigins =
    typeof config.corsOrigins === 'boolean' ? config.corsOrigins : [...config.corsOrigins];
  const contactQuota = createContactQuota();

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

    return reply(404, {
      message: `Cannot ${method} ${event.rawPath}`,
      error: 'Not Found',
      statusCode: 404,
    });
  };
}
