import { CfnParameter, CfnRule, Fn } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import {
  productionAccount,
  productionRegion,
  runtimeParameterNames,
  type EnvironmentKey,
  type RuntimeParameterName,
} from '@portfolio-api-cloud/contracts/configuration';
import {
  defaultOgObjectPrefix,
  defaultReleaseStageMaxAttempts,
  type EditorialEnvironmentKey,
} from '@portfolio-api-cloud/contracts/editorial';
import type { FunctionId } from '@portfolio-api-cloud/contracts/functions';
import { r2Region, storageKeys } from '@portfolio-api-cloud/contracts/storage';

export type FunctionEnvironment = Partial<Record<EnvironmentKey | EditorialEnvironmentKey, string>>;

export type ParameterSegment = 'api' | 'chat' | 'editorial' | 'notifications';

/** Segmento SSM por función. */
export const functionParameters: Record<FunctionId, ParameterSegment> = {
  api: 'api',
  chat: 'chat',
  processRelease: 'editorial',
  generateOg: 'editorial',
  notifyPost: 'notifications',
  publishChatKnowledge: 'editorial',
};

/** Nombre del parámetro SecureString; la validación solo existe para las funciones HTTP. */
export function parameterName(
  segment: ParameterSegment,
  validation: boolean,
): RuntimeParameterName {
  if (!validation) return runtimeParameterNames[segment];
  if (segment === 'api') return runtimeParameterNames.validationApi;
  if (segment === 'chat') return runtimeParameterNames.validationChat;
  throw new Error(`Sin parámetro de validación para ${segment}`);
}

export const parameterArn = (name: string) =>
  `arn:aws:ssm:${productionRegion}:${productionAccount}:parameter${name}`;

const address = '[^\\r\\n@]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}>?';
const https = 'https://[A-Za-z0-9.-]+';
const bucket = '[a-z0-9][a-z0-9-]{1,61}[a-z0-9]';

/** Valores ficticios de la variante de validación: el runtime rechaza destinos reales. */
export const validationEnvironment = {
  CONTACT_FROM_EMAIL: 'from@example.invalid',
  CONTACT_TO_EMAIL: 'to@example.invalid',
  AI_DAILY_BUDGET_MICROUSD: '1000',
  SUBSCRIBERS_R2_ENDPOINT: 'https://subscribers.example.invalid',
  SUBSCRIBERS_R2_BUCKET: 'validation-subscribers',
} as const satisfies FunctionEnvironment;

function parameterFactory(scope: Construct) {
  return (id: string, allowedPattern: string, description: string) =>
    new CfnParameter(scope, id, { type: 'String', allowedPattern, description }).valueAsString;
}

/** Parámetros R2 compartidos (endpoint de la cuenta y buckets) creados una sola vez. */
export function storageParameters(scope: Construct) {
  const parameter = parameterFactory(scope);
  const storage = {
    endpoint: parameter('R2Endpoint', https, 'Endpoint HTTPS de la cuenta R2.'),
    mediaBucket: parameter(
      'R2Bucket',
      bucket,
      'Bucket R2 de medios: conocimiento de chat, estado editorial e imágenes OG.',
    ),
    subscribersBucket: parameter(
      'R2SubscribersBucket',
      bucket,
      'Bucket R2 privado de suscriptores; distinto del bucket de medios.',
    ),
  };
  // Los suscriptores nunca comparten el bucket público (el runtime también lo rechaza).
  new CfnRule(scope, 'PrivateSubscribersBucket', {
    assertions: [
      {
        assert: Fn.conditionNot(Fn.conditionEquals(storage.mediaBucket, storage.subscribersBucket)),
        assertDescription: 'R2SubscribersBucket debe ser distinto de R2Bucket.',
      },
    ],
  });
  return storage;
}
export type StorageParameters = ReturnType<typeof storageParameters>;

/**
 * Configuración no sensible de las funciones HTTP. Los valores productivos llegan como parámetros
 * sin defaults privados; las claves sensibles quedan en los parámetros SSM.
 */
export function httpEnvironment(
  scope: Construct,
  storage: StorageParameters,
  validation: boolean,
): FunctionEnvironment {
  const parameter = parameterFactory(scope);
  // La vigencia de tarifas se renueva con cada despliegue; vencida, chat cae a FAQ/fallback.
  const pricing = parameter(
    'AiPricingValidUntil',
    '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]{1,3})?)?(Z|[+-][0-9]{2}:[0-9]{2})',
    'Fin ISO 8601 de la revisión de tarifas IA; el runtime admite como máximo 31 días.',
  );
  if (validation) return { ...validationEnvironment, AI_PRICING_VALID_UNTIL: pricing };

  return {
    CONTACT_FROM_EMAIL: parameter('ContactFromEmail', address, 'Remitente verificado de contacto.'),
    CONTACT_TO_EMAIL: parameter('ContactToEmail', address, 'Destinatario de contacto.'),
    AI_DAILY_BUDGET_MICROUSD: parameter(
      'AiDailyBudgetMicrousd',
      '[1-9][0-9]{0,5}|1000000',
      'Presupuesto diario global de IA en microdólares.',
    ),
    AI_PRICING_VALID_UNTIL: pricing,
    R2_ENDPOINT: storage.endpoint,
    R2_BUCKET: storage.mediaBucket,
    R2_REGION: r2Region,
    CHAT_KNOWLEDGE_OBJECT_KEY: storageKeys.chatKnowledge,
    SUBSCRIBERS_R2_ENDPOINT: storage.endpoint,
    SUBSCRIBERS_R2_BUCKET: storage.subscribersBucket,
  };
}

/**
 * Valores no sensibles disponibles para las funciones editoriales; cada función recibe solo las
 * claves que declara contracts/editorial.ts (los nombres de funciones los agrega Editorial).
 */
export function editorialValues(scope: Construct, storage: StorageParameters): FunctionEnvironment {
  const parameter = parameterFactory(scope);
  return {
    R2_ENDPOINT: storage.endpoint,
    R2_BUCKET: storage.mediaBucket,
    R2_REGION: r2Region,
    SUBSCRIBERS_R2_ENDPOINT: storage.endpoint,
    SUBSCRIBERS_R2_BUCKET: storage.subscribersBucket,
    CHAT_KNOWLEDGE_OBJECT_KEY: storageKeys.chatKnowledge,
    OG_OBJECT_PREFIX: defaultOgObjectPrefix,
    RELEASE_STAGE_MAX_ATTEMPTS: String(defaultReleaseStageMaxAttempts),
    MEDIA_BASE_URL: parameter(
      'MediaBaseUrl',
      `${https}(/[A-Za-z0-9._~/-]*)?`,
      'URL HTTPS pública de los medios.',
    ),
    BLOG_FROM_EMAIL: parameter('BlogFromEmail', address, 'Remitente verificado del blog.'),
  };
}
