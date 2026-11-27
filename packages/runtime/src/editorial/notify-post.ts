import type {
  LambdaResponse,
  NotifyPostEvent,
  NotifyPostInput,
} from '@portfolio-api-cloud/contracts/editorial';
import { isPublicationDue } from '../chat/publication.js';
import {
  ledgerRequestTimeoutMs,
  type DeliveryLedger,
  type DeliveryOutcome,
} from './delivery-ledger.js';
import { DeliveryError, type BlogNotifier } from './email.js';
import { isNonEmptyString, isRecord, jsonResponse, normalizeTags } from './lambda.js';
import { logError, logInfo } from './log.js';

export interface NotifyPostDependencies {
  readonly listSubscriberEmails: () => Promise<string[]>;
  readonly notify: BlogNotifier;
  /** `null` si la dirección ya no está suscripta. */
  readonly unsubscribeId: (email: string) => Promise<string | null>;
  readonly ledger: DeliveryLedger;
  readonly sleep?: (milliseconds: number) => Promise<unknown>;
}

export interface NotifyPostOptions {
  /** Tiempo restante de la invocación; sin él no se limita la corrida. */
  readonly remainingMs?: () => number;
}

/** Quedan destinatarios sin aceptación confirmada. Solo contiene totales. */
export class NotificationIncompleteError extends Error {
  constructor(summary: Record<string, number>) {
    super(`Notification incomplete: ${JSON.stringify(summary)}`);
    this.name = 'NotificationIncompleteError';
  }
}

/** Resend admite 10 solicitudes por segundo por equipo; se usa la mitad. */
const sendIntervalMs = 200;
const rateLimitPauseMs = 1_000;
/** No se acorta según el tiempo restante: cortar antes solo agrega envíos dudosos. */
const sendTimeoutMs = 8_000;
/** Una operación del registro (leer, guardar el resultado o liberar) y el cierre de la función. */
const recordReserveMs = ledgerRequestTimeoutMs + 1_000;
/** Para iniciar un envío: su espera completa y el registro del resultado. */
const minimumToSendMs = sendTimeoutMs + recordReserveMs;
/** Para reservar: aun si la lectura y la escritura se demoran al máximo, entra la liberación. */
const minimumToClaimMs = 2 * ledgerRequestTimeoutMs + recordReserveMs;
/** Código de una reserva liberada sin llamar al proveedor. */
const notSentCode = 'insufficient_time';
const runStoppers = new Set(['daily_quota_exceeded', 'monthly_quota_exceeded']);

function failureOutcome(error: unknown): Exclude<DeliveryOutcome, { kind: 'accepted' }> {
  if (!(error instanceof DeliveryError)) return { kind: 'uncertain', code: 'transport_error' };
  const { code, statusCode } = error;
  if (code === 'invalid_idempotent_request') return { kind: 'review', code };
  const definite =
    statusCode !== null &&
    statusCode >= 400 &&
    statusCode < 500 &&
    statusCode !== 408 &&
    statusCode !== 409;
  return { kind: definite ? 'rejected' : 'uncertain', code };
}

const stopsRun = (error: unknown) =>
  error instanceof DeliveryError &&
  (runStoppers.has(error.code) || error.statusCode === 401 || error.statusCode === 403);

export function normalizeNotifyInput(event: NotifyPostEvent): NotifyPostInput | null {
  if (!isRecord(event)) return null;
  const title = isNonEmptyString(event.title) ? event.title : null;
  const url = isNonEmptyString(event.url) ? event.url : null;
  const excerpt = isNonEmptyString(event.excerpt) ? event.excerpt : undefined;
  const date = isNonEmptyString(event.date) ? event.date : undefined;
  if (!title || !url) return null;
  return {
    title,
    url,
    tags: normalizeTags(event.tags),
    ...(excerpt ? { excerpt } : {}),
    ...(date ? { date } : {}),
  };
}

/**
 * Envía de a uno, solo a quien no tiene una aceptación registrada. Termina bien únicamente si
 * todos los suscriptores vigentes figuran aceptados por el proveedor (no implica entrega); en
 * otro caso lanza para que process-release no marque el post como notificado.
 */
export async function notifyPost(
  event: NotifyPostEvent,
  resolve: () => Promise<NotifyPostDependencies>,
  options: NotifyPostOptions = {},
): Promise<LambdaResponse> {
  const input = normalizeNotifyInput(event);
  if (!input) return jsonResponse(400, { error: 'Title and url are required' });
  if (input.date !== undefined && !isPublicationDue(input.date))
    return jsonResponse(400, { error: 'Post publication date is invalid or in the future' });

  const deps = await resolve();
  const sleep =
    deps.sleep ?? ((milliseconds: number) => new Promise((done) => setTimeout(done, milliseconds)));
  logInfo('Sending post notification', { title: input.title });
  const subscribers = await deps.listSubscriberEmails();
  const summary = { sent: 0, removed: 0, busy: 0, review: 0, failed: 0, deferred: 0 };
  let lastSendAt = 0;
  const fits = (milliseconds: number) =>
    !options.remainingMs || options.remainingMs() >= milliseconds;

  for (const [index, email] of subscribers.entries()) {
    /** Deja para otra corrida a este destinatario y a los siguientes si `needed` no entra. */
    const defer = (needed: number) => {
      if (fits(needed)) return false;
      summary.deferred = subscribers.length - index;
      return true;
    };
    if (defer(recordReserveMs)) break;
    let reference: string | undefined;
    const pending = (status: string, code?: string) =>
      logError('Post notification pending', { post: input.url, reference, status, code });
    try {
      const known = await deps.ledger.settled(input.url, email);
      if (known) {
        reference = known.reference;
        summary[known.kind]++;
        if (known.kind === 'review') pending('review');
        continue;
      }
      if (defer(minimumToClaimMs)) break;
      const unsubscribeId = await deps.unsubscribeId(email);
      if (unsubscribeId === null) {
        summary.removed++;
        continue;
      }
      if (defer(minimumToClaimMs)) break;
      const claim = await deps.ledger.claim(input.url, email);
      reference = claim.reference;
      if (claim.kind !== 'send') {
        summary[claim.kind]++;
        if (claim.kind !== 'sent') pending(claim.kind);
        continue;
      }
      const wait = lastSendAt + sendIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      if (!fits(minimumToSendMs)) {
        // El proveedor no recibió nada: se libera sin crear una duda ni borrar una anterior.
        pending(await claim.settle({ kind: 'rejected', code: notSentCode }), notSentCode);
        summary.deferred = subscribers.length - index;
        break;
      }
      lastSendAt = Date.now();

      let outcome: DeliveryOutcome;
      let failure: unknown;
      try {
        const { data } = await deps.notify(
          { to: email, unsubscribeId, ...input },
          { idempotencyKey: claim.idempotencyKey, signal: AbortSignal.timeout(sendTimeoutMs) },
        );
        outcome = data?.id
          ? { kind: 'accepted', providerId: data.id }
          : { kind: 'uncertain', code: 'missing_id' };
      } catch (error) {
        failure = error;
        outcome = failureOutcome(error);
      }
      const status = await claim.settle(outcome);
      summary[status === 'sent' ? 'sent' : status === 'review' ? 'review' : 'failed']++;
      if (outcome.kind !== 'accepted') pending(status, outcome.code);
      if (stopsRun(failure)) {
        summary.deferred = subscribers.length - index - 1;
        break;
      }
      if (failure instanceof DeliveryError && failure.code === 'rate_limit_exceeded') {
        // Pausar sin presupuesto para otro envío solo consume el cierre.
        if (!fits(rateLimitPauseMs + minimumToClaimMs)) {
          summary.deferred = subscribers.length - index - 1;
          break;
        }
        await sleep(rateLimitPauseMs);
      }
    } catch (error) {
      summary.failed++;
      pending('unavailable', error instanceof Error ? error.name : 'unknown');
    }
  }

  logInfo('Post notification summary', summary);
  if (summary.sent + summary.removed !== subscribers.length)
    throw new NotificationIncompleteError(summary);
  return jsonResponse(200, {
    message: 'Notification sent',
    title: input.title,
    url: input.url,
    recipients: summary.sent,
  });
}
