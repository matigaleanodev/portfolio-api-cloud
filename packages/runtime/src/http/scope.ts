import { isIP } from 'node:net';
import type { Context } from 'aws-lambda';
import type { Configuration } from '../config.js';
import { verifiedVisitorIp } from '../ingress.js';
import { currentRequest, runRequest, runtimeMetric } from '../request-scope.js';
import type { RuntimeEnvironment } from '../runtime-config.js';
import { failure, type HttpEvent, type HttpResult } from './responses.js';

export type LambdaContext = Pick<Context, 'getRemainingTimeInMillis'>;
export type ScopedHandler = (event: HttpEvent) => Promise<HttpResult>;

/** El dominio custom solo es confiable cuando coincide con el declarado en el ambiente. */
export const isCustomDomain = (env: RuntimeEnvironment, event: HttpEvent) =>
  Boolean(
    env.TRUSTED_CUSTOM_DOMAIN && event.requestContext.domainName === env.TRUSTED_CUSTOM_DOMAIN,
  );

/**
 * Capa externa a Middy: ingress (403), visitante Cloudflare, ALS con deadline
 * min(25 s, restante − 1 s) → 503, `x-request-id` y log `http_request`.
 * La identidad del cliente reemplaza `sourceIp` en el evento que recibe la cadena interna.
 */
export function withRequestScope(
  env: RuntimeEnvironment,
  config: Configuration,
  inner: ScopedHandler,
) {
  return async (event: HttpEvent, context?: LambdaContext): Promise<HttpResult> => {
    const startedAt = performance.now();
    const ip = event.requestContext?.http?.sourceIp;
    if (!ip || !isIP(ip) || event.version !== '2.0') return failure(config, event, 403);
    const customDomain = isCustomDomain(env, event);
    if (
      env.TRUSTED_API_ID &&
      (event.requestContext.apiId !== env.TRUSTED_API_ID ||
        (!customDomain &&
          event.requestContext.domainName !==
            `${env.TRUSTED_API_ID}.execute-api.us-east-1.amazonaws.com`) ||
        event.requestContext.stage !== '$default')
    )
      return failure(config, event, 403);
    const visitorIp = customDomain ? verifiedVisitorIp(event) : ip;
    if (!visitorIp) return failure(config, event, 403);
    const clientIp =
      isIP(visitorIp) === 6 ? new URL(`http://[${visitorIp}]/`).hostname.slice(1, -1) : visitorIp;
    const requestEvent: HttpEvent = {
      ...event,
      requestContext: {
        ...event.requestContext,
        http: { ...event.requestContext.http, sourceIp: clientIp },
      },
    };
    let requestId: string | undefined;
    const timeout = Math.max(
      1,
      Math.min(25_000, (context?.getRemainingTimeInMillis() ?? 28_000) - 1000),
    );
    try {
      return await runRequest(clientIp, timeout, async () => {
        requestId = currentRequest()!.requestId;
        const result = await inner(requestEvent);
        result.headers = { ...result.headers, 'x-request-id': requestId };
        runtimeMetric('http_request', 'completed', {
          statusCode: result.statusCode ?? 200,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return result;
      });
    } catch {
      runtimeMetric('http_request', 'deadline', {
        statusCode: 503,
        durationMs: Math.round(performance.now() - startedAt),
        ...(requestId ? { requestId } : {}),
      });
      const result = failure(config, event, 503);
      if (requestId) result.headers = { ...result.headers, 'x-request-id': requestId };
      return result;
    }
  };
}
