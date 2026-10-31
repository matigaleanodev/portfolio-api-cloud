const emailPattern = /[^\s@"'<>(),;:]+@[^\s@"'<>(),;:]+\.[^\s@"'<>(),;:]+/g;

/** Reemplaza direcciones de email; los logs y estados editoriales nunca las contienen. */
export function redactEmails(value: string): string {
  return value.replace(emailPattern, '[redacted-email]');
}

function redact(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') return redactEmails(value);
  if (value instanceof Error) return { name: value.name, message: redactEmails(value.message) };
  if (!value || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, redact(item, depth + 1)]),
  );
}

export function errorMessage(error: unknown, fallback: string): string {
  return redactEmails(error instanceof Error ? error.message : fallback);
}

export function logInfo(message: string, context?: Record<string, unknown>): void {
  console.info(JSON.stringify({ level: 'info', message, ...(redact(context ?? {}) as object) }));
}

export function logError(message: string, context?: Record<string, unknown>): void {
  console.error(JSON.stringify({ level: 'error', message, ...(redact(context ?? {}) as object) }));
}
