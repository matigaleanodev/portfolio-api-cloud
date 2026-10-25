import type { SendEmail } from '../contact.js';
import { abortable, operationSignal } from '../request-scope.js';
import type { RuntimeEnvironment } from '../runtime-config.js';

export const scenarios = ['success', 'error', 'pending-body', 'ambiguous'] as const;
export type ValidationScenario = (typeof scenarios)[number];
export function readScenario(value: unknown): ValidationScenario {
  if (!scenarios.includes(value as ValidationScenario))
    throw new Error('Invalid validation scenario');
  return value as ValidationScenario;
}
export function validateEnvironment(env: RuntimeEnvironment): void {
  if (
    env.AWS_LAMBDA_FUNCTION_NAME !== 'portfolio-api-cloud-test' ||
    env.AWS_REGION !== 'us-east-1' ||
    env.QUOTA_TABLE_NAME !== 'portfolio-api-cloud-test-control' ||
    !env.TRUSTED_API_ID ||
    !/^arn:aws:secretsmanager:us-east-1:650387442642:secret:portfolio-api-cloud\/test\/[A-Za-z0-9/_+=.@-]+$/.test(
      env.RUNTIME_SECRET_ARN ?? '',
    )
  )
    throw new Error('Invalid validation destination');
}
export function validateSecret(env: RuntimeEnvironment): void {
  const invalidMail = /^[^@\s<>]+@(?:[a-z0-9-]+\.)+invalid$/i;
  const upstream = new URL(env.PORTFOLIO_CLOUD_API_URL ?? '');
  if (
    env.RESEND_API_KEY !== 'validation-only' ||
    env.OPENAI_API_KEY !== 'validation-only' ||
    !invalidMail.test(env.CONTACT_FROM_EMAIL ?? '') ||
    !invalidMail.test(env.CONTACT_TO_EMAIL ?? '') ||
    upstream.protocol !== 'https:' ||
    !upstream.hostname.endsWith('.invalid') ||
    upstream.username ||
    upstream.password ||
    upstream.port ||
    upstream.search ||
    upstream.hash ||
    Object.keys(env).some((key) => key.startsWith('R2_'))
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
  // No hay fetch real ni transporte alternativo, incluso frente a destinos inesperados.
  const request: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const ai = url.href === 'https://api.openai.com/v1/responses';
    const count = url.href === 'https://api.openai.com/v1/responses/input_tokens';
    const subscription =
      url.protocol === 'https:' &&
      url.hostname.endsWith('.invalid') &&
      url.pathname.endsWith('/subscriptions') &&
      !url.username &&
      !url.password &&
      !url.port;
    if (
      (!ai && !count && !subscription) ||
      ((ai || count) && init?.method !== 'POST') ||
      (subscription && !['POST', 'DELETE'].includes(init?.method ?? ''))
    )
      throw new Error('Unexpected validation request');
    if (scenario === 'error') return new Response('{}', { status: 500 });
    // El conteo exitoso permite probar la reserva conservada tras generación ambigua.
    if (scenario === 'ambiguous' && !count) throw new Error('Simulated ambiguous result');
    const payload = count
      ? { input_tokens: 100 }
      : ai
        ? {
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
          }
        : { message: 'Operación simulada.' };
    const response = new Response(JSON.stringify(payload));
    if (scenario === 'pending-body' && !count) {
      const signal = init?.signal;
      if (!signal) throw new Error('Missing cancellation signal');
      Object.defineProperty(response, 'json', { value: () => pending(signal) });
    }
    return response;
  };
  return { sendEmail, request, validateSecret };
}
