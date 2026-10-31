import type { LambdaResponse } from '@portfolio-api-cloud/contracts/editorial';

export function jsonResponse(statusCode: number, payload: Record<string, unknown>): LambdaResponse {
  return { statusCode, body: JSON.stringify(payload) };
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Tags opcionales: se descartan los vacíos, como en portfolio-cloud. */
export function normalizeTags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => isNonEmptyString(tag)) : [];
}
