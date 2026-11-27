import type { HttpEvent } from '../http/responses.js';
import { unsubscribeTokenPattern } from './store.js';

/** Página del flujo manual; abrir el enlace nunca da de baja. */
export const manualUnsubscribeUrl = 'https://matiasgaleano.dev/blog/unsubscribe';

function hasOneClickField(contentType: string, body: string): boolean {
  const type = contentType.split(';')[0]!.trim().toLowerCase();
  if (type === 'application/x-www-form-urlencoded')
    return new URLSearchParams(body.trim()).get('List-Unsubscribe') === 'One-Click';
  if (type !== 'multipart/form-data') return false;
  const boundary = /;\s*boundary="?([^";]+)"?/i.exec(contentType)?.[1];
  if (!boundary) return false;
  return body.split(`--${boundary}`).some((part) => {
    const separator = part.indexOf('\r\n\r\n');
    return (
      separator >= 0 &&
      /;\s*name="?List-Unsubscribe"?\s*(;|\r\n|$)/i.test(part.slice(0, separator)) &&
      part.slice(separator + 4).trim() === 'One-Click'
    );
  });
}

/** Token de una petición RFC 8058 válida, o `null` si no lo es. */
export function readOneClickToken(event: HttpEvent): string | null {
  const tokens = new URLSearchParams(event.rawQueryString).getAll('t');
  const body = Buffer.from(event.body ?? '', event.isBase64Encoded ? 'base64' : 'utf8');
  return tokens.length === 1 &&
    unsubscribeTokenPattern.test(tokens[0]!) &&
    hasOneClickField(event.headers['content-type'] ?? '', body.toString('utf8'))
    ? tokens[0]!
    : null;
}
