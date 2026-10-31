import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { Configuration } from '../config.js';

export type HttpEvent = APIGatewayProxyEventV2;
export type HttpResult = APIGatewayProxyStructuredResultV2;

export const securityHeaders = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
} as const;

/** Resultado del router antes de serializar: estado y cuerpo JSON sin headers. */
export interface RouteResult {
  readonly statusCode: number;
  readonly body?: unknown;
}

/**
 * Serialización compartida por el `after` y por los cortes tempranos: HEAD y 204 sin cuerpo,
 * 204 sin content-type e `isBase64Encoded` false. Muta `headers` como el bootstrap original.
 */
export function serialize(
  method: string,
  headers: Record<string, string>,
  { statusCode, body }: RouteResult,
): HttpResult {
  if (statusCode !== 204) headers['content-type'] = 'application/json; charset=utf-8';
  return {
    statusCode,
    headers,
    body: method === 'HEAD' || statusCode === 204 ? '' : JSON.stringify(body),
    isBase64Encoded: false,
  };
}

/** Rechazos de ingress (403) y de configuración o control (503) con la forma vigente. */
export function failure(
  config: Configuration,
  event: HttpEvent,
  statusCode: 403 | 503,
): HttpResult {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    ...securityHeaders,
  };
  const origin = event.headers?.origin;
  if (config.corsOrigins !== false) {
    headers.vary = 'Origin';
    if (origin && (config.corsOrigins === true || config.corsOrigins.includes(origin)))
      headers['access-control-allow-origin'] = origin;
  }
  return {
    statusCode,
    headers,
    body:
      event.requestContext?.http?.method === 'HEAD'
        ? ''
        : JSON.stringify({
            statusCode,
            message: statusCode === 403 ? 'Forbidden' : 'Service unavailable',
          }),
  };
}
