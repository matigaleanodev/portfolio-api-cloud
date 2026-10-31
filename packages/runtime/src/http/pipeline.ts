import middy from '@middy/core';
import type { Context } from 'aws-lambda';
import type { OperationId } from '@portfolio-api-cloud/contracts/routes';
import { bodyError, parseBody } from '../body.js';
import type { Configuration } from '../config.js';
import { runtimeMetric } from '../request-scope.js';
import {
  failure,
  securityHeaders,
  serialize,
  type HttpEvent,
  type HttpResult,
  type RouteResult,
} from './responses.js';
import { ControlUnavailableError, resolveOperation, route, type Services } from './router.js';

/** Resultado de preparar la configuración: servicios del grupo o un corte (403/503). */
export type Preparation =
  { readonly services?: Services | undefined } | { readonly response: HttpResult };

export interface PipelineOptions {
  readonly config: Configuration;
  /** Operaciones que atiende esta función; el resto responde 404. */
  readonly operations: readonly OperationId[];
  /** Secreto, origen y composición por operación; nunca debe lanzar. */
  readonly prepare: (event: HttpEvent, operation: OperationId | undefined) => Promise<Preparation>;
}

interface State {
  readonly operation: OperationId | undefined;
  readonly headers: Record<string, string>;
  services?: Services | undefined;
  body?: unknown;
}

type Request = middy.Request<HttpEvent, HttpResult | RouteResult, Error, Context>;

/**
 * Cadena Middy común a api y chat. Un `before` que devuelve respuesta corta la cadena y en
 * Middy 7.9.2 omite el handler y todos los `after`: esos cortes ya vienen serializados.
 */
export function createPipeline({ config, operations, prepare }: PipelineOptions) {
  const states = new WeakMap<object, State>();
  const state = (request: Request) => states.get(request.context)!;
  const method = (request: Request) => request.event.requestContext.http.method;

  const runtimeConfig: middy.MiddlewareObj<HttpEvent, HttpResult | RouteResult> = {
    async before(request) {
      const operation = resolveOperation(method(request), request.event.rawPath, operations);
      const current: State = { operation, headers: {} };
      states.set(request.context, current);
      const prepared = await prepare(request.event, operation);
      if ('response' in prepared) return prepared.response;
      current.services = prepared.services;
      return undefined;
    },
  };

  // El bootstrap original registra los parsers antes de CORS y seguridad.
  const body: middy.MiddlewareObj<HttpEvent, HttpResult | RouteResult> = {
    async before(request) {
      const current = state(request);
      if (request.event.version !== '2.0')
        return serialize(method(request), current.headers, {
          statusCode: 400,
          body: { message: 'Unsupported event version', error: 'Bad Request', statusCode: 400 },
        });
      try {
        current.body = await parseBody(request.event);
        return undefined;
      } catch (error) {
        const parsed = bodyError(error);
        return serialize(method(request), current.headers, {
          statusCode: parsed.statusCode,
          body: parsed.body,
        });
      }
    },
  };

  const corsOrigins =
    typeof config.corsOrigins === 'boolean' ? config.corsOrigins : [...config.corsOrigins];
  const cors: middy.MiddlewareObj<HttpEvent, HttpResult | RouteResult> = {
    before(request) {
      if (corsOrigins === false) return undefined;
      const { headers } = state(request);
      const origin = request.event.headers.origin;
      headers.vary = 'Origin';
      if (origin && (corsOrigins === true || corsOrigins.includes(origin)))
        headers['access-control-allow-origin'] = origin;
      if (method(request) !== 'OPTIONS') return undefined;
      headers['access-control-allow-methods'] = 'GET,POST,DELETE,OPTIONS';
      headers['access-control-allow-headers'] = 'Content-Type';
      return serialize(method(request), headers, { statusCode: 204 });
    },
  };

  const security: middy.MiddlewareObj<HttpEvent, HttpResult | RouteResult> = {
    before(request) {
      Object.assign(state(request).headers, securityHeaders);
    },
  };

  const serializer: middy.MiddlewareObj<HttpEvent, HttpResult | RouteResult> = {
    after(request) {
      request.response = serialize(
        method(request),
        state(request).headers,
        request.response as RouteResult,
      );
    },
    onError(request) {
      if (request.error instanceof ControlUnavailableError) {
        runtimeMetric('runtime_failure', 'unavailable');
        return failure(config, request.event, 503);
      }
      const headers = states.get(request.context)?.headers ?? {};
      return serialize(method(request), headers, {
        statusCode: 500,
        body: { statusCode: 500, message: 'Internal server error' },
      });
    },
  };

  const chain = middy<HttpEvent, HttpResult | RouteResult, Error, Context>({
    timeoutEarlyInMillis: 0,
  })
    // `serializer` primero: su `after` y su `onError` corren al final de la pila.
    .use([serializer, runtimeConfig, body, cors, security])
    .handler(async (event, context) => {
      const current = states.get(context)!;
      return route(event, current.operation, current.body, current.headers, current.services);
    });

  // Cada invocación recibe su propio contexto: el estado no se comparte entre eventos.
  return async (event: HttpEvent): Promise<HttpResult> =>
    (await chain(event, {} as Context)) as HttpResult;
}
