import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { Configuration } from './config.js';
import { health } from './health.js';

const BODY_LIMIT = 16 * 1024;

export function createApplication(config: Configuration) {
  const corsOrigins = typeof config.corsOrigins === 'boolean' ? config.corsOrigins : [...config.corsOrigins];

  return (event: APIGatewayProxyEventV2): APIGatewayProxyStructuredResultV2 => {
    const headers: Record<string, string> = {};
    const origin = event.headers.origin;
    const method = event.requestContext.http.method;

    if (corsOrigins !== false) {
      headers.vary = 'Origin';
      if (origin && (corsOrigins === true || corsOrigins.includes(origin))) {
        headers['access-control-allow-origin'] = origin;
      }
      if (method === 'OPTIONS') {
        headers['access-control-allow-methods'] = 'GET,POST,DELETE,OPTIONS';
        headers['access-control-allow-headers'] = 'Content-Type';
        return { statusCode: 204, headers, body: '', isBase64Encoded: false };
      }
    }

    headers['x-content-type-options'] = 'nosniff';
    headers['x-frame-options'] = 'DENY';
    headers['referrer-policy'] = 'no-referrer';
    headers['content-type'] = 'application/json; charset=utf-8';

    const reply = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
      statusCode, headers, body: method === 'HEAD' ? '' : JSON.stringify(body), isBase64Encoded: false,
    });

    if (event.version !== '2.0') {
      return reply(400, { message: 'Unsupported event version', error: 'Bad Request', statusCode: 400 });
    }

    // shortcut: parser básico; completar errores, encodings y DTOs antes de exponer rutas de negocio.
    const contentType = event.headers['content-type']?.split(';')[0]?.trim().toLowerCase();
    if (event.body && (contentType === 'application/json' || contentType === 'application/x-www-form-urlencoded')) {
      const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
      if (body.byteLength > BODY_LIMIT) {
        return reply(413, { message: 'request entity too large', error: 'Payload Too Large', statusCode: 413 });
      }
      if (contentType === 'application/json' && body.byteLength > 0) {
        try {
          const text = body.toString('utf8');
          if (!/^[\s]*[\[{]/.test(text)) throw new SyntaxError();
          JSON.parse(text);
        } catch {
          return reply(400, { message: 'Invalid JSON body', error: 'Bad Request', statusCode: 400 });
        }
      }
    }

    if ((method === 'GET' || method === 'HEAD') && /^\/api\/health\/?$/i.test(event.rawPath)) {
      return reply(200, health());
    }

    return reply(404, { message: `Cannot ${method} ${event.rawPath}`, error: 'Not Found', statusCode: 404 });
  };
}
