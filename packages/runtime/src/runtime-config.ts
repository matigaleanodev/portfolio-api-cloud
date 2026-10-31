import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import {
  environmentKeys,
  isRuntimeParameterName,
  secretKeys,
} from '@portfolio-api-cloud/contracts/configuration';
import { functions, type FunctionContract } from '@portfolio-api-cloud/contracts/functions';
import { readContactConfiguration, readSubscriptionConfiguration } from './config.js';
import { getChatKnowledgeR2Config, type ChatKnowledgeR2Config } from './chat/chat.config.js';
import { abortable, operationSignal } from './request-scope.js';

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;
/** Lee el valor descifrado del parámetro de runtime; el nombre ya fue validado. */
export type ParameterReader = (name: string, signal: AbortSignal) => Promise<string>;

/** Lector SSM sin reintentos: un fallo se traduce en 503 sin exponer detalles ni valores. */
export function createParameterReader(): ParameterReader {
  const client = new SSMClient({ maxAttempts: 1 });
  return async (name, signal) => {
    const result = await client.send(
      new GetParameterCommand({ Name: name, WithDecryption: true }),
      { abortSignal: signal },
    );
    const parameter = result.Parameter;
    if (
      typeof parameter?.Value !== 'string' ||
      (parameter.Type !== undefined && parameter.Type !== 'SecureString')
    )
      throw new Error('Missing runtime configuration');
    return parameter.Value;
  };
}

function httpsUrl(value: string, message: string): void {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error(message);
}

/**
 * Conocimiento remoto de chat: ausente usa el fallback empaquetado; incompleto o inválido es un
 * fallo de configuración que solo afecta a las operaciones de chat.
 */
export function readChatKnowledgeConfiguration(
  config: RuntimeEnvironment,
): ChatKnowledgeR2Config | null {
  const r2 = getChatKnowledgeR2Config(config);
  if (r2) httpsUrl(r2.endpoint, 'Invalid R2 endpoint');
  return r2;
}

/**
 * Combina la configuración no sensible del ambiente con las claves sensibles del parámetro.
 * Cada función exige solo sus claves; las capacidades opcionales ausentes se degradan.
 */
export function resolveRuntimeConfiguration(
  env: RuntimeEnvironment,
  raw: string,
  contract: FunctionContract = functions.api,
): RuntimeEnvironment {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error('Invalid runtime configuration');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid runtime configuration');
  const sensitive = value as Record<string, unknown>;
  const config: Record<string, string> = {};
  for (const key of environmentKeys) {
    const item = env[key];
    if (item !== undefined) config[key] = item;
  }
  // Las claves no sensibles del parámetro se ignoran: el ambiente declarado prevalece.
  for (const key of secretKeys) {
    const item = sensitive[key];
    if (typeof item === 'string') config[key] = item;
    else if (item !== undefined && contract.requiredSecrets.includes(key))
      throw new Error('Invalid runtime configuration');
  }
  const missing = contract.requiredSecrets.filter((key) => !config[key]?.trim());
  if (missing.length) throw new Error(`Missing runtime secrets: ${missing.join(', ')}`);

  if (contract.requiredSecrets.includes('RESEND_CONTACT_API_KEY')) readContactConfiguration(config);
  if (contract.logicalId === functions.api.logicalId) readSubscriptionConfiguration(config);
  if (contract.requiredSecrets.includes('QUOTA_KEY_SECRET') && config.QUOTA_KEY_SECRET!.length < 32)
    throw new Error('Missing quota key secret');
  // La función chat solo atiende chat: su conocimiento inválido equivale a configuración inválida.
  // En api se valida al componer chat para no afectar health, contacto ni suscripciones.
  if (contract.logicalId === functions.chat.logicalId) readChatKnowledgeConfiguration(config);
  return Object.freeze(config);
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

/**
 * Carga diferida del parámetro indicado (por defecto `RUNTIME_PARAMETER_NAME`) con snapshot de
 * 5 minutos y deadline de 3 s; un fallo de lectura o validación no reutiliza el valor vencido.
 */
export function createRuntimeConfiguration(
  env: RuntimeEnvironment,
  read: ParameterReader,
  contract: FunctionContract = functions.api,
  // Objeto explícito: `{ parameterName: undefined }` se rechaza en vez de caer en el default.
  source: { readonly parameterName: string | undefined } = {
    parameterName: env.RUNTIME_PARAMETER_NAME,
  },
) {
  let snapshot: { value: RuntimeEnvironment; expiresAt: number } | undefined;
  return async () => {
    if (snapshot && snapshot.expiresAt > Date.now()) return snapshot.value;
    const name = source.parameterName;
    if (!isRuntimeParameterName(name)) throw new Error('Runtime parameter is not configured');
    const signal = operationSignal(3000);
    const raw = await abortable(signal, () => read(name, signal));
    const value = resolveRuntimeConfiguration(env, raw, contract);
    snapshot = { value, expiresAt: Date.now() + 300_000 };
    return value;
  };
}
