import { isIP } from 'node:net';
import { verifiedVisitorIp, verifyOriginSecret } from './ingress.js';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { createApplication } from './application.js';
import {
  readConfiguration,
  readContactConfiguration,
  readSubscriptionConfiguration,
} from './config.js';
import { createContactSender, createResendProvider, type SendEmail } from './contact.js';
import { createSubscriptionSender } from './subscriptions.js';
import { createChat } from './chat/chat.providers.js';
import {
  createAiAdmission,
  createSharedQuota,
  DynamoControlStore,
  type ControlStore,
} from './shared-control.js';
import {
  aiConfigurationValid,
  createRuntimeConfiguration,
  createSecretReader,
  type RuntimeEnvironment,
  type SecretReader,
} from './runtime-config.js';
import { currentRequest, runRequest, runtimeMetric } from './request-scope.js';

interface RuntimeDependencies {
  readonly readSecret?: SecretReader;
  readonly store?: ControlStore;
  readonly request?: typeof fetch;
  readonly sendEmail?: SendEmail;
  readonly validateSecret?: (env: RuntimeEnvironment) => void;
}
export function createManagedHandler(
  env: RuntimeEnvironment,
  dependencies: RuntimeDependencies = {},
) {
  const config = readConfiguration(env);
  let load: ReturnType<typeof createRuntimeConfiguration> | undefined;
  let application: ReturnType<typeof createApplication> | undefined;
  let configured: RuntimeEnvironment | undefined;
  const publicApplication = createApplication(config);
  const failure = (
    event: APIGatewayProxyEventV2,
    statusCode: number,
  ): APIGatewayProxyStructuredResultV2 => {
    const headers: Record<string, string> = {
      'content-type': 'application/json; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
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
  };
  return async (
    event: APIGatewayProxyEventV2,
    context?: Pick<Context, 'getRemainingTimeInMillis'>,
  ) => {
    const startedAt = performance.now();
    const ip = event.requestContext?.http?.sourceIp;
    if (!ip || !isIP(ip) || event.version !== '2.0') return failure(event, 403);
    const customDomain = Boolean(
      env.TRUSTED_CUSTOM_DOMAIN && event.requestContext.domainName === env.TRUSTED_CUSTOM_DOMAIN,
    );
    if (
      env.TRUSTED_API_ID &&
      (event.requestContext.apiId !== env.TRUSTED_API_ID ||
        (!customDomain &&
          event.requestContext.domainName !==
            `${env.TRUSTED_API_ID}.execute-api.us-east-1.amazonaws.com`) ||
        event.requestContext.stage !== '$default')
    )
      return failure(event, 403);
    const visitorIp = customDomain ? verifiedVisitorIp(event) : ip;
    if (!visitorIp) return failure(event, 403);
    const clientIp =
      isIP(visitorIp) === 6 ? new URL(`http://[${visitorIp}]/`).hostname.slice(1, -1) : visitorIp;
    const requestEvent = {
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
        let result: APIGatewayProxyStructuredResultV2;
        try {
          load ??= createRuntimeConfiguration(env, dependencies.readSecret ?? createSecretReader());
          const ingressSecrets = customDomain ? await load() : undefined;
          if (customDomain && !verifyOriginSecret(event, ingressSecrets?.ORIGIN_VERIFY_SECRET))
            return failure(event, 403);
          const method = event.requestContext.http.method;
          const publicRoute =
            method === 'OPTIONS' ||
            ((method === 'GET' || method === 'HEAD') && /^\/api\/health\/?$/i.test(event.rawPath));
          if (publicRoute) result = await publicApplication(requestEvent);
          else {
            if (!env.TRUSTED_API_ID || !env.QUOTA_TABLE_NAME)
              throw new Error('Missing ingress/control configuration');
            load ??= createRuntimeConfiguration(
              env,
              dependencies.readSecret ?? createSecretReader(),
            );
            const secrets = ingressSecrets ?? (await load());
            dependencies.validateSecret?.(secrets);
            if (!application || configured !== secrets) {
              const store =
                dependencies.store ??
                new DynamoControlStore(
                  new DynamoDBClient({ maxAttempts: 1 }),
                  env.QUOTA_TABLE_NAME,
                );
              const request = dependencies.request ?? fetch;
              const admission = createAiAdmission(
                store,
                secrets.QUOTA_KEY_SECRET!,
                aiConfigurationValid(secrets) ? Number(secrets.AI_DAILY_BUDGET_MICROUSD) * 1000 : 0,
              );
              const chat = createChat(
                {
                  ...secrets,
                  OPENAI_CHAT_MODEL: 'gpt-6-luna',
                  OPENAI_API_KEY: aiConfigurationValid(secrets)
                    ? secrets.OPENAI_API_KEY
                    : undefined,
                },
                request,
                process.cwd(),
                admission,
                true,
              );
              const contact = readContactConfiguration(secrets);
              application = createApplication(
                config,
                createContactSender(
                  contact,
                  dependencies.sendEmail ?? createResendProvider(contact),
                ),
                createSubscriptionSender(readSubscriptionConfiguration(secrets), request),
                chat,
                createSharedQuota(store, secrets.QUOTA_KEY_SECRET!),
              );
              configured = secrets;
              runtimeMetric('runtime_startup', 'ready');
            }
            result = await application(requestEvent);
          }
        } catch {
          runtimeMetric('runtime_failure', 'unavailable');
          result = failure(event, 503);
        }
        result.headers = { ...result.headers, 'x-request-id': currentRequest()!.requestId };
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
      const result = failure(event, 503);
      if (requestId) result.headers = { ...result.headers, 'x-request-id': requestId };
      return result;
    }
  };
}
export const handler = createManagedHandler(process.env);
