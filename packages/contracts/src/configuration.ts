/** Claves sensibles: solo viven en el parámetro SecureString JSON del ambiente. */
export const secretKeys = [
  'RESEND_CONTACT_API_KEY',
  'RESEND_BLOG_API_KEY',
  'OPENAI_API_KEY',
  'QUOTA_KEY_SECRET',
  'ORIGIN_VERIFY_SECRET',
  'R2_KNOWLEDGE_ACCESS_KEY_ID',
  'R2_KNOWLEDGE_SECRET_ACCESS_KEY',
  'R2_MEDIA_ACCESS_KEY_ID',
  'R2_MEDIA_SECRET_ACCESS_KEY',
  'R2_SUBSCRIBERS_ACCESS_KEY_ID',
  'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
] as const;
export type SecretKey = (typeof secretKeys)[number];

/** Configuración no sensible declarada como variables de entorno de cada función. */
export const environmentKeys = [
  'NODE_ENV',
  'CORS_ORIGIN',
  'QUOTA_TABLE_NAME',
  'RUNTIME_PARAMETER_NAME',
  'CHAT_PARAMETER_NAME',
  'TRUSTED_API_ID',
  'TRUSTED_CUSTOM_DOMAIN',
  'CONTACT_FROM_EMAIL',
  'CONTACT_TO_EMAIL',
  'SUBSCRIBERS_R2_ENDPOINT',
  'SUBSCRIBERS_R2_BUCKET',
  'AI_DAILY_BUDGET_MICROUSD',
  'AI_PRICING_VALID_UNTIL',
  'R2_ENDPOINT',
  'R2_REGION',
  'R2_BUCKET',
  'CHAT_KNOWLEDGE_OBJECT_KEY',
  'CHAT_KNOWLEDGE_CACHE_TTL_MS',
] as const;
export type EnvironmentKey = (typeof environmentKeys)[number];

export const productionAccount = '650387442642';
export const productionRegion = 'us-east-1';

/**
 * Parámetros SSM SecureString (tier estándar) segmentados por responsabilidad: cada función lee
 * el suyo por `RUNTIME_PARAMETER_NAME`; api lee además el de chat (`CHAT_PARAMETER_NAME`) solo
 * para las variantes no canónicas de chat.
 */
export const runtimeParameterNames = {
  api: '/portfolio/prod/api',
  chat: '/portfolio/prod/chat',
  editorial: '/portfolio/prod/editorial',
  notifications: '/portfolio/prod/notifications',
  validationApi: '/portfolio/validation/api',
  validationChat: '/portfolio/validation/chat',
} as const;
export type RuntimeParameterName =
  (typeof runtimeParameterNames)[keyof typeof runtimeParameterNames];

/** Claves sensibles publicadas en cada parámetro productivo (validación replica api y chat). */
export const parameterKeys = {
  api: [
    'QUOTA_KEY_SECRET',
    'ORIGIN_VERIFY_SECRET',
    'RESEND_CONTACT_API_KEY',
    'R2_SUBSCRIBERS_ACCESS_KEY_ID',
    'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
  ],
  chat: [
    'QUOTA_KEY_SECRET',
    'ORIGIN_VERIFY_SECRET',
    'OPENAI_API_KEY',
    'R2_KNOWLEDGE_ACCESS_KEY_ID',
    'R2_KNOWLEDGE_SECRET_ACCESS_KEY',
  ],
  editorial: ['R2_MEDIA_ACCESS_KEY_ID', 'R2_MEDIA_SECRET_ACCESS_KEY'],
  notifications: [
    'R2_SUBSCRIBERS_ACCESS_KEY_ID',
    'R2_SUBSCRIBERS_SECRET_ACCESS_KEY',
    'RESEND_BLOG_API_KEY',
  ],
} as const satisfies Record<'api' | 'chat' | 'editorial' | 'notifications', readonly SecretKey[]>;

/** Nombres que el runtime acepta leer; cualquier otro valor se rechaza sin consultar SSM. */
export function isRuntimeParameterName(value: unknown): value is RuntimeParameterName {
  return Object.values(runtimeParameterNames).includes(value as RuntimeParameterName);
}
