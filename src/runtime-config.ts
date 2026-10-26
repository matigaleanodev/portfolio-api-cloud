import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { readContactConfiguration, readSubscriptionConfiguration } from './config.js';
import { getChatKnowledgeR2Config } from './chat/chat.config.js';
import { abortable, operationSignal } from './request-scope.js';

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
export type SecretReader = (arn: string, signal: AbortSignal) => Promise<string>;

export function createSecretReader(): SecretReader {
  const client = new SecretsManagerClient({ maxAttempts: 1 });
  return async (arn, signal) => {
    const result = await client.send(new GetSecretValueCommand({ SecretId: arn }), {
      abortSignal: signal,
    });
    if (!result.SecretString) throw new Error('Missing runtime configuration');
    return result.SecretString;
  };
}

/** La configuración común no depende de la vigencia de la generación paga. */
export function validateRuntimeSecret(raw: string): RuntimeEnvironment {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Invalid runtime configuration');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid runtime configuration');
  const entries = Object.entries(value);
  const aiFields = new Set([
    'OPENAI_API_KEY',
    'OPENAI_CHAT_MODEL',
    'AI_DAILY_BUDGET_MICROUSD',
    'AI_PRICING_VALID_UNTIL',
  ]);
  if (entries.some(([key, item]) => typeof item !== 'string' && !aiFields.has(key)))
    throw new Error('Invalid runtime configuration');
  const env = Object.fromEntries(
    entries.map(([key, item]) => [key, typeof item === 'string' ? item : '']),
  ) as Record<string, string>;
  readContactConfiguration(env);
  const cloud = new URL(readSubscriptionConfiguration(env).baseUrl);
  if (cloud.protocol !== 'https:' || cloud.username || cloud.password)
    throw new Error('Invalid upstream URL');
  if (!env.QUOTA_KEY_SECRET || env.QUOTA_KEY_SECRET.length < 32)
    throw new Error('Missing quota key secret');
  const r2 = getChatKnowledgeR2Config(env);
  if (r2) {
    const endpoint = new URL(r2.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password)
      throw new Error('Invalid R2 endpoint');
  }
  return Object.freeze(env);
}

export function aiConfigurationValid(env: RuntimeEnvironment, now = Date.now()): boolean {
  const budget = Number(env.AI_DAILY_BUDGET_MICROUSD);
  const until = Date.parse(env.AI_PRICING_VALID_UNTIL ?? '');
  return (
    Boolean(env.OPENAI_API_KEY) &&
    (env.OPENAI_CHAT_MODEL ?? 'gpt-6-luna') === 'gpt-6-luna' &&
    /^\d+$/.test(env.AI_DAILY_BUDGET_MICROUSD ?? '') &&
    Number.isSafeInteger(budget) &&
    budget > 0 &&
    budget <= 1_000_000 &&
    Number.isFinite(until) &&
    until > now &&
    until <= now + 31 * 86400_000
  );
}

export function createRuntimeConfiguration(env: RuntimeEnvironment, read: SecretReader) {
  let snapshot: { value: RuntimeEnvironment; expiresAt: number } | undefined;
  return async () => {
    if (snapshot && snapshot.expiresAt > Date.now()) return snapshot.value;
    const arn = env.RUNTIME_SECRET_ARN;
    if (
      !arn ||
      !/^arn:aws:secretsmanager:us-east-1:650387442642:secret:portfolio-api-cloud\/test\/[A-Za-z0-9/_+=.@-]+$/.test(
        arn,
      )
    )
      throw new Error('Runtime secret is not configured');
    const signal = operationSignal(3000);
    const raw = await abortable(signal, () => read(arn, signal));
    const value = validateRuntimeSecret(raw);
    snapshot = { value, expiresAt: Date.now() + 300_000 };
    return value;
  };
}
