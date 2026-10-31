import { readFileSync } from 'node:fs';
import { functions, type FunctionContract } from '@portfolio-api-cloud/contracts/functions';
import { runtimeParameterNames } from '@portfolio-api-cloud/contracts/configuration';
import type { SendEmail } from '../contact.js';
import type { FunctionKind, RuntimeDependencies } from '../http/managed.js';
import { abortable, operationSignal } from '../request-scope.js';
import type { RuntimeEnvironment } from '../runtime-config.js';
import type { SubscriberOperations } from '../subscriptions/facade.js';

export const scenarios = ['success', 'error', 'pending-body', 'ambiguous'] as const;
export type ValidationScenario = (typeof scenarios)[number];
export function readScenario(value: unknown): ValidationScenario {
  if (!scenarios.includes(value as ValidationScenario))
    throw new Error('Invalid validation scenario');
  return value as ValidationScenario;
}

/** El escenario pertenece al asset revisado; ninguna entrada HTTP lo selecciona. */
export function loadScenario(): ValidationScenario {
  const fixture: unknown = JSON.parse(
    readFileSync(new URL('../../validation.json', import.meta.url), 'utf8'),
  );
  if (
    !fixture ||
    typeof fixture !== 'object' ||
    !('scenario' in fixture) ||
    !('version' in fixture) ||
    fixture.version !== 1
  )
    throw new Error('Missing validation fixture');
  return readScenario(fixture.scenario);
}

const destinations = {
  api: {
    AWS_LAMBDA_FUNCTION_NAME: functions.api.functionName,
    RUNTIME_PARAMETER_NAME: runtimeParameterNames.validationApi,
    CHAT_PARAMETER_NAME: runtimeParameterNames.validationChat,
  },
  chat: {
    AWS_LAMBDA_FUNCTION_NAME: functions.chat.functionName,
    RUNTIME_PARAMETER_NAME: runtimeParameterNames.validationChat,
  },
} as const satisfies Record<FunctionKind, Record<string, string>>;

export function validateEnvironment(env: RuntimeEnvironment, kind: FunctionKind = 'api'): void {
  if (
    env.AWS_REGION !== 'us-east-1' ||
    env.QUOTA_TABLE_NAME !== 'portfolio-api-cloud-test-control' ||
    !env.TRUSTED_API_ID ||
    Object.entries(destinations[kind]).some(([key, value]) => env[key] !== value)
  )
    throw new Error('Invalid validation destination');
}

const invalidMail = /^[^@\s<>]+@(?:[a-z0-9-]+\.)+invalid$/i;
const fictitious = (value: string | undefined, required: boolean) =>
  value === undefined ? !required : value === 'validation-only';
function fictitiousEndpoint(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return (
      url.protocol === 'https:' &&
      url.hostname.endsWith('.invalid') &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

/** Cada configuración resuelta debe apuntar solo a proveedores y destinos ficticios. */
export function validateConfiguration(env: RuntimeEnvironment, contract: FunctionContract): void {
  const api = contract.logicalId === functions.api.logicalId;
  if (
    !fictitious(env.RESEND_CONTACT_API_KEY, api) ||
    !fictitious(env.OPENAI_API_KEY, !api) ||
    !fictitious(env.RESEND_BLOG_API_KEY, false) ||
    !fictitious(env.R2_SUBSCRIBERS_ACCESS_KEY_ID, api) ||
    !fictitious(env.R2_SUBSCRIBERS_SECRET_ACCESS_KEY, api) ||
    (api || env.CONTACT_FROM_EMAIL !== undefined
      ? !invalidMail.test(env.CONTACT_FROM_EMAIL ?? '')
      : false) ||
    (api || env.CONTACT_TO_EMAIL !== undefined
      ? !invalidMail.test(env.CONTACT_TO_EMAIL ?? '')
      : false) ||
    (api || env.SUBSCRIBERS_R2_ENDPOINT !== undefined
      ? !fictitiousEndpoint(env.SUBSCRIBERS_R2_ENDPOINT)
      : false) ||
    Object.entries(env).some(
      ([key, value]) => key.startsWith('R2_') && !key.startsWith('R2_SUBSCRIBERS_') && value,
    )
  )
    throw new Error('Validation requires fictitious providers');
}

const pending = <T>(signal: AbortSignal): Promise<T> =>
  abortable(signal, () => new Promise<T>(() => undefined));

export function createValidationProviders(scenario: ValidationScenario) {
  const sendEmail: SendEmail = async () => {
    if (scenario === 'error') return { error: 'Simulated failure' };
    if (scenario === 'ambiguous') throw new Error('Simulated ambiguous result');
    if (scenario === 'pending-body') return pending(operationSignal(8000));
  };
  // Sin S3 real: el almacenamiento de suscriptores es un doble sin efectos persistentes.
  const store: SubscriberOperations = {
    async createSubscriber(_email, signal) {
      if (scenario === 'pending-body') return pending(signal ?? operationSignal(8000));
      if (scenario !== 'success') throw new Error(`Simulated ${scenario} storage result`);
      return 'created';
    },
    async deleteSubscriber(_email, signal) {
      if (scenario === 'pending-body') return pending(signal ?? operationSignal(8000));
      if (scenario !== 'success') throw new Error(`Simulated ${scenario} storage result`);
      return 'deleted';
    },
  };
  // No hay fetch real ni transporte alternativo, incluso frente a destinos inesperados.
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const ai = url.href === 'https://api.openai.com/v1/responses';
    const count = url.href === 'https://api.openai.com/v1/responses/input_tokens';
    if ((!ai && !count) || init?.method !== 'POST')
      throw new Error('Unexpected validation request');
    if (scenario === 'error') return new Response('{}', { status: 500 });
    // El conteo exitoso permite probar la reserva conservada tras generación ambigua.
    if (scenario === 'ambiguous' && !count) throw new Error('Simulated ambiguous result');
    const payload = count
      ? { input_tokens: 100 }
      : {
          status: 'completed',
          model: 'gpt-6-luna',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    answer: 'Respuesta simulada de validación.',
                    suggestedQuestions: [],
                  }),
                },
              ],
            },
          ],
          usage: { input_tokens: 100, output_tokens: 20 },
        };
    const response = new Response(JSON.stringify(payload));
    if (scenario === 'pending-body' && !count) {
      const signal = init?.signal;
      if (!signal) throw new Error('Missing cancellation signal');
      Object.defineProperty(response, 'json', { value: () => pending(signal) });
    }
    return response;
  };
  return {
    sendEmail,
    request,
    subscribers: () => store,
    validateConfiguration,
  } satisfies RuntimeDependencies;
}
