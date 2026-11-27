import { Resend } from 'resend';
import {
  oneClickUnsubscribeUrl,
  type NotifyPostInput,
} from '@portfolio-api-cloud/contracts/editorial';
import { redactEmails } from './log.js';

export type BlogNotificationInput = NotifyPostInput & {
  readonly to: string;
  /** Identificador opaco del suscriptor; habilita la baja en un clic (RFC 8058). */
  readonly unsubscribeId?: string;
};

export interface BlogEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
}

/** Límite con el proveedor: misma forma `{data, error}` que `resend.emails.send`. */
export type SendBlogEmail = (email: BlogEmail, options?: SendOptions) => Promise<SendResult>;

export interface SendOptions {
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
}

export interface SendResult {
  readonly data?: { readonly id?: string } | null;
  readonly error?: {
    readonly message: string;
    readonly name?: string;
    readonly statusCode?: number | null;
  } | null;
}

export interface BlogMailerConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
}

const unsubscribeBaseUrl = 'https://matiasgaleano.dev/blog/unsubscribe';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const calendarDate = new Intl.DateTimeFormat('es-AR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Fecha calendario (`AAAA-MM-DD`) como "26 nov 2026"; formateada en UTC para no correr el día. */
function formatDateLabel(date?: string): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  const parts = new Map(calendarDate.formatToParts(parsed).map((p) => [p.type, p.value]));
  return `${parts.get('day')} ${parts.get('month')} ${parts.get('year')}`;
}

function buildUnsubscribeUrl(email: string): string {
  return `${unsubscribeBaseUrl}?email=${encodeURIComponent(email)}`;
}

const signature = 'Matias Galeano · Blog técnico';
const actionLabel = 'Leer artículo';
const footerNotice = 'Recibís este aviso porque te suscribiste al blog.';
const unsubscribeLabel = 'Darme de baja';

// Adaptación de correo de DESIGN.md: estilos en línea claros y, aparte, tokens oscuros opcionales.
const sans = "font-family:'Segoe UI',Arial,sans-serif";
const mono = "font-family:Consolas,'Courier New',monospace";
const wrap = 'overflow-wrap:anywhere;word-break:break-word';
const layoutTable = 'role="presentation" cellpadding="0" cellspacing="0" border="0"';

const headStyles = `
@media only screen and (max-width:480px) {
  .outer { padding:16px 8px !important; }
  .card { padding:16px !important; }
  .title { font-size:24px !important; }
}
@media (prefers-color-scheme: dark) {
  .page { background-color:#1F2937 !important; }
  .card { background-color:#141A24 !important; border-top-color:#B7B8EE !important; }
  .title, .excerpt { color:#EAECF2 !important; }
  .date, .footer { color:#AEB7C9 !important; }
  .signature, .link { color:#B7B8EE !important; }
  .divider { border-top-color:#394355 !important; }
  .action { background-color:#B7B8EE !important; }
  .action-link { color:#141A24 !important; }
}`;

interface BlogEmailContent {
  readonly title: string;
  readonly url: string;
  readonly date: string | null;
  readonly excerpt: string | undefined;
  readonly unsubscribeUrl: string;
}

function renderHtml(content: BlogEmailContent): string {
  const title = escapeHtml(content.title);
  const excerpt = content.excerpt ? escapeHtml(content.excerpt) : null;
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<style>:root { color-scheme: light dark; }${headStyles}
</style>
</head>
<body class="page" style="margin:0;padding:0;background-color:#FCFCFE;">
<div lang="es" style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${excerpt ?? title}</div>
<table ${layoutTable} lang="es" class="page" width="100%" bgcolor="#FCFCFE" style="width:100%;background-color:#FCFCFE;">
<tr>
<td class="outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" align="center"><tr><td><![endif]-->
<table ${layoutTable} width="100%" style="width:100%;max-width:600px;table-layout:fixed;">
<tr>
<td class="card" align="left" bgcolor="#F3F4F7" style="padding:32px;background-color:#F3F4F7;border-top:4px solid #5B5F8F;text-align:left;${sans};color:#1F2937;">
<p class="signature" style="margin:0 0 24px;${mono};font-size:14px;line-height:20px;color:#5B5F8F;">${signature}</p>
<h1 class="title" style="margin:0 0 16px;${sans};font-size:28px;line-height:1.2;font-weight:600;color:#1F2937;${wrap};">${title}</h1>
${content.date ? `<p class="date" style="${sans};margin:0 0 16px;font-size:14px;line-height:20px;color:#4B5563;">${content.date}</p>\n` : ''}${excerpt ? `<p class="excerpt" style="${sans};margin:0 0 24px;font-size:16px;line-height:1.6;color:#1F2937;${wrap};">${excerpt}</p>\n` : ''}<table ${layoutTable}>
<tr>
<td class="action" bgcolor="#5B5F8F" style="padding:14px 24px;background-color:#5B5F8F;border-radius:5px;">
<a class="action-link" href="${escapeHtml(content.url)}" style="${sans};font-size:16px;line-height:20px;font-weight:600;color:#FCFCFE;text-decoration:none;">${actionLabel}</a>
</td>
</tr>
</table>
<table ${layoutTable} width="100%" style="width:100%;">
<tr><td height="24" style="height:24px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="divider" style="border-top:1px solid #C8CCD7;padding-top:16px;">
<p class="footer" style="${sans};margin:0;font-size:14px;line-height:1.6;color:#4B5563;">${footerNotice} <a class="link" href="${escapeHtml(content.unsubscribeUrl)}" style="${sans};color:#5B5F8F;text-decoration:underline;">${unsubscribeLabel}</a></p>
</td></tr>
</table>
</td>
</tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td>
</tr>
</table>
</body>
</html>`;
}

/** Aviso de post nuevo. Debe ser determinista: un reintento repite la misma Idempotency-Key. */
export function buildBlogEmail(from: string, input: BlogNotificationInput): BlogEmail {
  const content: BlogEmailContent = {
    title: input.title,
    url: input.url,
    date: formatDateLabel(input.date),
    excerpt: input.excerpt,
    unsubscribeUrl: buildUnsubscribeUrl(input.to),
  };

  return {
    from,
    to: input.to,
    ...(input.unsubscribeId
      ? {
          headers: {
            'List-Unsubscribe': `<${oneClickUnsubscribeUrl}?t=${input.unsubscribeId}>`,
            'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          },
        }
      : {}),
    subject: `Nuevo post en el blog — ${input.title}`,
    text: [
      signature,
      content.title,
      content.date,
      content.excerpt,
      `${actionLabel}: ${content.url}`,
      footerNotice,
      `${unsubscribeLabel}: ${content.unsubscribeUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n'),
    html: renderHtml(content),
  };
}

export function createResendSender(apiKey: string): SendBlogEmail {
  let resend: Resend | undefined;
  return (email, options) => {
    resend ??= new Resend(apiKey, {
      baseUrl: 'https://api.resend.com',
      userAgent: 'portfolio-api-cloud',
    });
    return resend.emails.send(email, options);
  };
}

export type BlogNotifier = (
  input: BlogNotificationInput,
  options?: SendOptions,
) => Promise<SendResult>;

const safeCode = /^[a-z_]{1,64}$/;

/** Respuesta de error del proveedor. `code` y `statusCode` son aptos para logs y registro. */
export class DeliveryError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number | null,
  ) {
    super(message);
    this.name = 'DeliveryError';
  }
}

/** Un `error` en una promesa resuelta de Resend se rechaza; el mensaje no conserva emails. */
export function createBlogNotifier(
  config: BlogMailerConfig,
  send: SendBlogEmail = createResendSender(config.apiKey),
): BlogNotifier {
  return async (input, options) => {
    const result = await send(buildBlogEmail(config.fromEmail, input), options);
    if (result.error) {
      const { message, name, statusCode } = result.error;
      throw new DeliveryError(
        redactEmails(message),
        name && safeCode.test(name) ? name : 'unknown',
        statusCode ?? null,
      );
    }
    return result;
  };
}
