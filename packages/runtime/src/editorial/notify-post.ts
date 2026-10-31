import type {
  LambdaResponse,
  NotifyPostEvent,
  NotifyPostInput,
} from '@portfolio-api-cloud/contracts/editorial';
import { isPublicationDue } from '../chat/publication.js';
import type { BlogNotifier } from './email.js';
import { isNonEmptyString, isRecord, jsonResponse, normalizeTags } from './lambda.js';
import { logInfo } from './log.js';

export interface NotifyPostDependencies {
  readonly listSubscriberEmails: () => Promise<string[]>;
  readonly notify: BlogNotifier;
}

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
 * Envía a todos los suscriptores; un rechazo del proveedor se propaga (la invocación falla y
 * process-release no marca el post como notificado). Sin dedupe por destinatario.
 */
export async function notifyPost(
  event: NotifyPostEvent,
  resolve: () => Promise<NotifyPostDependencies>,
): Promise<LambdaResponse> {
  const input = normalizeNotifyInput(event);
  if (!input) return jsonResponse(400, { error: 'Title and url are required' });
  if (input.date !== undefined && !isPublicationDue(input.date))
    return jsonResponse(400, { error: 'Post publication date is invalid or in the future' });

  const deps = await resolve();
  logInfo('Sending post notification', { title: input.title });
  const subscribers = await deps.listSubscriberEmails();
  await Promise.all(
    subscribers.map(async (subscriberEmail) => deps.notify({ to: subscriberEmail, ...input })),
  );
  return jsonResponse(200, {
    message: 'Notification sent',
    title: input.title,
    url: input.url,
    recipients: subscribers.length,
  });
}
