import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { functions, type FunctionContract } from '@portfolio-api-cloud/contracts/functions';
import type { OperationId } from '@portfolio-api-cloud/contracts/routes';
import { readConfiguration, type SubscriptionConfiguration } from '../config.js';
import type { SendEmail } from '../contact.js';
import { verifyOriginSecret } from '../ingress.js';
import { runtimeMetric } from '../request-scope.js';
import {
  createParameterReader,
  createRuntimeConfiguration,
  type ParameterReader,
  type RuntimeEnvironment,
} from '../runtime-config.js';
import { DynamoControlStore, type ControlStore } from '../shared-control.js';
import type { SubscriberOperations } from '../subscriptions/facade.js';
import { createPipeline, type Preparation } from './pipeline.js';
import { failure, type HttpEvent } from './responses.js';
import { allOperations, chatOperations, isChatOperation, type Services } from './router.js';
import { isCustomDomain, withRequestScope } from './scope.js';

export interface RuntimeDependencies {
  readonly readParameter?: ParameterReader;
  readonly store?: ControlStore;
  readonly request?: typeof fetch;
  readonly sendEmail?: SendEmail;
  /** Construye el store de suscriptores; por defecto R2 con cliente S3 diferido. */
  readonly subscribers?: (config: SubscriptionConfiguration) => SubscriberOperations;
  /** Verificación adicional de cada configuración resuelta (variante de validación). */
  readonly validateConfiguration?: (config: RuntimeEnvironment, contract: FunctionContract) => void;
}

export interface CompositionContext {
  readonly controlStore: () => ControlStore;
  readonly dependencies: RuntimeDependencies;
}

export type ServiceFactory = (values: RuntimeEnvironment, context: CompositionContext) => Services;

export type FunctionKind = 'api' | 'chat';

export interface FunctionComposition {
  readonly kind: FunctionKind;
  /** Servicios de las operaciones propias con el parámetro `RUNTIME_PARAMETER_NAME`. */
  readonly main: ServiceFactory;
  /** Servicios de chat; en api se componen con el parámetro `CHAT_PARAMETER_NAME`. */
  readonly chat: ServiceFactory;
}

/**
 * Compone ingress + cadena Middy para una función HTTP. api atiende las seis operaciones
 * (incluidas las variantes no canónicas de chat, con el parámetro de chat cargado de forma
 * diferida); chat atiende solo sus dos operaciones y responde 404 al resto sin configuración.
 * Cada handler importa solo sus fábricas para no empaquetar proveedores ajenos.
 */
export function createManagedHandler(
  env: RuntimeEnvironment,
  dependencies: RuntimeDependencies,
  { kind, main, chat }: FunctionComposition,
) {
  const config = readConfiguration(env);
  const contract = kind === 'api' ? functions.api : functions.chat;
  let reader: ParameterReader | undefined;
  const read: ParameterReader = (name, signal) =>
    (dependencies.readParameter ?? (reader ??= createParameterReader()))(name, signal);
  const loadMain = createRuntimeConfiguration(env, read, contract);
  const loadChat =
    kind === 'api'
      ? createRuntimeConfiguration(env, read, functions.chat, {
          parameterName: env.CHAT_PARAMETER_NAME,
        })
      : loadMain;
  let store: ControlStore | undefined;
  const context: CompositionContext = {
    dependencies,
    controlStore: () =>
      (store ??=
        dependencies.store ??
        new DynamoControlStore(new DynamoDBClient({ maxAttempts: 1 }), env.QUOTA_TABLE_NAME!)),
  };
  // Se recompone solo cuando cambia el snapshot de configuración.
  const cached = (compose: ServiceFactory) => {
    let entry: { source: RuntimeEnvironment; value: Services } | undefined;
    return (source: RuntimeEnvironment) => {
      if (entry?.source !== source) {
        entry = { source, value: compose(source, context) };
        runtimeMetric('runtime_startup', 'ready');
      }
      return entry.value;
    };
  };
  const mainServices = cached(main);
  const chatServices = kind === 'api' ? cached(chat) : mainServices;

  const isPublic = (event: HttpEvent, operation: OperationId | undefined) =>
    event.requestContext.http.method === 'OPTIONS' ||
    operation === 'health' ||
    (kind === 'chat' && !operation);

  const prepare = async (
    event: HttpEvent,
    operation: OperationId | undefined,
  ): Promise<Preparation> => {
    try {
      if (isCustomDomain(env, event)) {
        const ingress = await loadMain();
        if (!verifyOriginSecret(event, ingress.ORIGIN_VERIFY_SECRET))
          return { response: failure(config, event, 403) };
      }
      if (isPublic(event, operation)) return {};
      if (!env.TRUSTED_API_ID || !env.QUOTA_TABLE_NAME)
        throw new Error('Missing ingress/control configuration');
      if (isChatOperation(operation)) {
        const values = await loadChat();
        dependencies.validateConfiguration?.(values, functions.chat);
        return { services: chatServices(values) };
      }
      const values = await loadMain();
      dependencies.validateConfiguration?.(values, contract);
      return { services: mainServices(values) };
    } catch {
      runtimeMetric('runtime_failure', 'unavailable');
      return { response: failure(config, event, 503) };
    }
  };

  const pipeline = createPipeline({
    config,
    operations: kind === 'api' ? allOperations : chatOperations,
    prepare,
  });
  return withRequestScope(env, config, pipeline);
}
