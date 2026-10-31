import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

type AnyMock = Mock<(...args: any[]) => any>;
import {
  buildBlogEmail,
  createBlogNotifier,
  type BlogEmail,
} from '../../packages/runtime/src/editorial/email.js';
import {
  notifyPost,
  type NotifyPostDependencies,
} from '../../packages/runtime/src/editorial/notify-post.js';

let listSubscriberEmails: AnyMock;
let notify: AnyMock;
let resolve: AnyMock;
let logs: string[];

beforeEach(() => {
  listSubscriberEmails = vi.fn();
  notify = vi.fn();
  resolve = vi.fn(async (): Promise<NotifyPostDependencies> => ({ listSubscriberEmails, notify }));
  logs = [];
  for (const level of ['info', 'error', 'warn', 'log'] as const)
    vi.spyOn(console, level).mockImplementation((...values: unknown[]) => {
      logs.push(values.map(String).join(' '));
    });
});

describe('notify-post', () => {
  it('rechaza una fecha futura antes de componer, leer suscriptores o enviar', async () => {
    const response = await notifyPost(
      { title: 'Programado', url: 'https://matiasgaleano.dev/blog/programado', date: '2999-01-01' },
      resolve,
    );
    expect(response).toEqual({
      statusCode: 400,
      body: JSON.stringify({ error: 'Post publication date is invalid or in the future' }),
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(listSubscriberEmails).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it.each([
    { title: 'Test' },
    { url: 'https://x.dev' },
    { title: ' ', url: 'https://x.dev' },
    null,
  ])('devuelve 400 sin título o url: %j', async (event) => {
    await expect(notifyPost(event as never, resolve)).resolves.toEqual({
      statusCode: 400,
      body: JSON.stringify({ error: 'Title and url are required' }),
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('notifica a cada suscriptor con metadatos normalizados e informa el total', async () => {
    listSubscriberEmails.mockResolvedValue(['one@example.com', 'two@example.com']);
    notify.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    await expect(
      notifyPost(
        {
          title: 'Arquitectura de Modo Playa',
          url: 'https://matiasgaleano.dev/blog/arquitectura-modo-playa',
          excerpt: 'Excerpt',
          date: '2026-03-07',
          tags: ['nestjs', 'architecture', ''],
        },
        resolve,
      ),
    ).resolves.toEqual({
      statusCode: 200,
      body: JSON.stringify({
        message: 'Notification sent',
        title: 'Arquitectura de Modo Playa',
        url: 'https://matiasgaleano.dev/blog/arquitectura-modo-playa',
        recipients: 2,
      }),
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenNthCalledWith(1, {
      to: 'one@example.com',
      title: 'Arquitectura de Modo Playa',
      url: 'https://matiasgaleano.dev/blog/arquitectura-modo-playa',
      excerpt: 'Excerpt',
      date: '2026-03-07',
      tags: ['nestjs', 'architecture'],
    });
    expect(logs.join('\n')).not.toMatch(/@example\.com/);
  });

  it('sin suscriptores informa 0 destinatarios', async () => {
    listSubscriberEmails.mockResolvedValue([]);
    const response = await notifyPost({ title: 'A', url: 'https://x.dev/a' }, resolve);
    expect(JSON.parse(response.body).recipients).toBe(0);
  });

  it('propaga el rechazo del proveedor en lugar de confirmar la notificación', async () => {
    listSubscriberEmails.mockResolvedValue(['audit@example.com']);
    notify.mockRejectedValue(new Error('Rate limit exceeded'));
    await expect(
      notifyPost({ title: 'Prueba', url: 'https://example.com/post' }, resolve),
    ).rejects.toThrow('Rate limit exceeded');
  });

  it('propaga un fallo al listar suscriptores sin enviar', async () => {
    listSubscriberEmails.mockRejectedValue(new Error('R2 down'));
    await expect(notifyPost({ title: 'A', url: 'https://x.dev/a' }, resolve)).rejects.toThrow(
      'R2 down',
    );
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('mail del blog (Resend 6.34.1)', () => {
  const config = { apiKey: 're_test', fromEmail: 'blog@matiasgaleano.dev' };

  it('arma el payload con contenido escapado, tags y baja', async () => {
    const send = vi.fn(async (_email: BlogEmail) => ({ data: { id: 'email_123' }, error: null }));
    await expect(
      createBlogNotifier(
        config,
        send,
      )({
        to: 'contacto@matiasgaleano.dev',
        title: 'Arquitectura <Modo Playa>',
        url: 'https://matiasgaleano.dev/blog/modo-playa?ref=og',
        excerpt: 'Backend & cloud con <tags>',
        date: '2026-03-08',
        tags: ['aws', 'serverless', 'blog', 'cloud', 'extra'],
      }),
    ).resolves.toEqual({ data: { id: 'email_123' }, error: null });
    const payload = send.mock.calls[0]![0];
    expect(payload).toMatchObject({
      from: 'blog@matiasgaleano.dev',
      to: 'contacto@matiasgaleano.dev',
      subject: 'Nuevo post en el blog — Arquitectura <Modo Playa>',
    });
    expect(payload.text).toContain('Arquitectura <Modo Playa>');
    expect(payload.text).toContain('Backend & cloud con <tags>');
    expect(payload.text).toContain(
      'Cancelar suscripcion: https://matiasgaleano.dev/blog/unsubscribe?email=contacto%40matiasgaleano.dev',
    );
    expect(payload.html).toContain('Arquitectura &lt;Modo Playa&gt;');
    expect(payload.html).toContain('Backend &amp; cloud con &lt;tags&gt;');
    expect(payload.html).toContain('mar');
    expect(payload.html).toContain('2026');
    expect(payload.html).toContain('serverless');
    expect(payload.html).toContain(
      'https://matiasgaleano.dev/blog/unsubscribe?email=contacto%40matiasgaleano.dev',
    );
    expect(payload.html).not.toContain('extra');
  });

  it('rechaza el `error` que Resend devuelve en una promesa resuelta, sin emails en el mensaje', async () => {
    const send = vi.fn(async () => ({
      data: null,
      error: { message: 'Invalid `to` field: audit@example.com' },
    }));
    const failure = createBlogNotifier(
      config,
      send,
    )({
      to: 'audit@example.com',
      title: 'Prueba',
      url: 'https://example.com/post',
    });
    await expect(failure).rejects.toThrow('Invalid `to` field: [redacted-email]');
  });

  it('degrada sin extracto ni fecha', () => {
    const payload = buildBlogEmail(config.fromEmail, {
      to: 'contacto@matiasgaleano.dev',
      title: 'Nuevo post',
      url: 'https://matiasgaleano.dev/blog/nuevo-post',
    });
    expect(payload.text).toContain('Nuevo post');
    expect(payload.text).toContain('https://matiasgaleano.dev/blog/nuevo-post');
    expect(payload.text).toContain('Cancelar suscripcion:');
    expect(payload.html).toContain('matiasgaleano.dev/blog');
    expect(payload.html).toContain('esta pagina');
  });

  it('con el SDK real: usa la clave del blog y envía al endpoint de Resend', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"id":"email_1"}', { status: 200 }));
    const notifier = createBlogNotifier(config);
    expect(fetch).not.toHaveBeenCalled();
    await notifier({ to: 'a@example.com', title: 'T', url: 'https://x.dev' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://api.resend.com/emails');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer re_test');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      from: 'blog@matiasgaleano.dev',
      to: 'a@example.com',
    });
  });

  it('con el SDK real: un 4xx de Resend llega como `error` y se rechaza', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          statusCode: 429,
          name: 'rate_limit_exceeded',
          message: 'Too many requests',
        }),
        { status: 429, headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(
      createBlogNotifier(config)({ to: 'a@example.com', title: 'T', url: 'https://x.dev' }),
    ).rejects.toThrow('Too many requests');
  });
});
