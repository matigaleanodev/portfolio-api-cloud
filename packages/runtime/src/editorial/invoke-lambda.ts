import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda';
import type { LambdaResponse } from '@portfolio-api-cloud/contracts/editorial';

export interface FunctionInvocationClient {
  send(command: InvokeCommand): Promise<{ Payload?: Uint8Array; FunctionError?: string }>;
}

export type InvokeLambda = (functionName: string, payload: unknown) => Promise<LambdaResponse>;

const safeCode = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;

/**
 * Fallo de una etapa invocada. `code` es un identificador saneado apto para persistir en el
 * estado público; `detail` (payload, trace, ARN) solo se registra en logs.
 */
export class StageInvocationError extends Error {
  constructor(
    readonly code: string,
    readonly detail: string,
  ) {
    super(detail);
    this.name = 'StageInvocationError';
  }
}

/** Código persistible de cualquier fallo de invocación; nunca incluye texto libre. */
export function invocationFailureCode(error: unknown): string {
  if (error instanceof StageInvocationError) return error.code;
  if (error instanceof Error && safeCode.test(error.name) && error.name !== 'Error')
    return error.name;
  return 'invoke_failed';
}

function functionErrorCode(rawPayload: string): string {
  try {
    const parsed: unknown = JSON.parse(rawPayload);
    const errorType =
      parsed && typeof parsed === 'object' && 'errorType' in parsed ? parsed.errorType : undefined;
    if (typeof errorType === 'string' && safeCode.test(errorType)) return errorType;
  } catch {
    // Payload no JSON: se usa el código genérico.
  }
  return 'function_error';
}

function isLambdaResponse(value: unknown): value is LambdaResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.statusCode === 'number' && typeof candidate.body === 'string';
}

/** Invocación síncrona con el contrato `{statusCode, body}`; el cliente se crea al primer uso. */
export function createLambdaInvoker(client?: FunctionInvocationClient): InvokeLambda {
  let instance = client;
  return async (functionName, payload) => {
    instance ??= new LambdaClient({});
    const response = await instance.send(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(payload)),
      }),
    );
    const rawPayload =
      response.Payload && response.Payload.length > 0
        ? Buffer.from(response.Payload).toString('utf-8')
        : '';
    if (response.FunctionError)
      throw new StageInvocationError(
        functionErrorCode(rawPayload),
        rawPayload || `Lambda invocation failed for ${functionName}: ${response.FunctionError}`,
      );
    let parsed: unknown = null;
    try {
      parsed = rawPayload ? JSON.parse(rawPayload) : null;
    } catch {
      parsed = null;
    }
    if (!isLambdaResponse(parsed))
      throw new StageInvocationError(
        'invalid_response',
        `Unexpected Lambda response shape from ${functionName}`,
      );
    return parsed;
  };
}

export function assertLambdaSuccess(functionName: string, response: LambdaResponse): void {
  if (response.statusCode >= 400)
    throw new StageInvocationError(
      `status_${response.statusCode}`,
      `Lambda ${functionName} returned ${response.statusCode}: ${response.body}`,
    );
}
