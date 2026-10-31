import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export interface RequestScope {
  readonly requestId: string;
  readonly clientIp: string;
  readonly signal: AbortSignal;
}
const scopes = new AsyncLocalStorage<RequestScope>();
export const currentRequest = () => scopes.getStore();

export function operationSignal(timeoutMs: number): AbortSignal {
  const parent = currentRequest()?.signal;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('Operation timed out')), timeoutMs);
  timer.unref?.();
  const timeout = controller.signal;
  const signal = parent ? AbortSignal.any([parent, timeout]) : timeout;
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return signal;
}

export async function abortable<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    return await Promise.race([work(), aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export function runRequest<T>(clientIp: string, timeoutMs: number, work: () => Promise<T>) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Request deadline exceeded')),
    timeoutMs,
  );
  return scopes.run({ requestId: randomUUID(), clientIp, signal: controller.signal }, async () => {
    try {
      return await abortable(controller.signal, work);
    } finally {
      clearTimeout(timer);
      controller.abort(new Error('Request finished'));
    }
  });
}

export function runtimeMetric(
  event:
    | 'http_request'
    | 'runtime_failure'
    | 'contact_provider'
    | 'subscription_provider'
    | 'runtime_startup'
    | 'quota'
    | 'ai_admission'
    | 'knowledge_fallback',
  outcome: string,
  values: { statusCode?: number; durationMs?: number; requestId?: string } = {},
): void {
  const entry: Record<string, string | number> = { event, outcome };
  const requestId = currentRequest()?.requestId ?? values.requestId;
  if (requestId && /^[a-f0-9-]{36}$/.test(requestId)) entry.requestId = requestId;
  for (const key of ['statusCode', 'durationMs'] as const) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) entry[key] = value;
  }
  console.info(JSON.stringify(entry));
}
