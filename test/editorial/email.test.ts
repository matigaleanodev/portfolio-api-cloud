import { describe, expect, it } from 'vitest';
import {
  buildBlogEmail,
  type BlogNotificationInput,
} from '../../packages/runtime/src/editorial/email.js';

const from = 'blog@example.invalid';
const input: BlogNotificationInput = {
  to: 'lector+blog@example.com',
  title: 'Procesamiento asíncrono con SQS y Lambda',
  url: 'https://matiasgaleano.dev/blog/sqs-lambda?ref=mail&v=1',
  excerpt: 'Cómo desacoplar trabajo lento sin perder mensajes.',
  date: '2026-11-26',
  tags: ['aws', 'serverless'],
};
const unsubscribeUrl =
  'https://matiasgaleano.dev/blog/unsubscribe?email=lector%2Bblog%40example.com';

/** `undefined` en un override quita el campo opcional. */
const build = (
  overrides: { [K in keyof BlogNotificationInput]?: BlogNotificationInput[K] | undefined } = {},
) =>
  buildBlogEmail(
    from,
    Object.fromEntries(
      Object.entries({ ...input, ...overrides }).filter(([, value]) => value !== undefined),
    ) as unknown as BlogNotificationInput,
  );

/** Texto visible o leído, en orden de documento, sin `<head>` ni comentarios condicionales. */
const visibleText = (html: string) =>
  html
    .replace(/<head>[\s\S]*<\/head>|<!--[\s\S]*?-->|<!doctype[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && line !== '&nbsp;');

const links = (html: string) =>
  [...html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => [
    match[1]!.replaceAll('&amp;', '&'),
    match[2]!.trim(),
  ]);

describe('composición del aviso (Índigo de taller)', () => {
  it('ordena preheader, firma, título, fecha, resumen, acción y pie', () => {
    expect(visibleText(build().html)).toEqual([
      input.excerpt,
      'Matias Galeano · Blog técnico',
      input.title,
      '26 nov 2026',
      input.excerpt,
      'Leer artículo',
      'Recibís este aviso porque te suscribiste al blog.',
      'Darme de baja',
    ]);
  });

  it('conserva el asunto', () => {
    expect(build().subject).toBe(`Nuevo post en el blog — ${input.title}`);
  });

  it('declara documento en español, UTF-8, esquema de color y maquetación por tablas', () => {
    const { html } = build();
    expect(html).toMatch(/^<!doctype html>\s*<html lang="es"/i);
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    expect(html).toContain('@media (prefers-color-scheme: dark)');
    expect(html).toContain('<!--[if mso]>');
    expect(html).toContain('max-width:600px');
    const tables = html.match(/<table\b[^>]*>/g)!;
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) expect(table).toContain('role="presentation"');
  });

  it('no usa imágenes, degradados, sombras, flex ni etiquetas', () => {
    const { html, text } = build();
    expect(html).not.toMatch(
      /<img|background-image|gradient|box-shadow|display:\s*(inline-)?(flex|grid)|var\(|clamp\(/,
    );
    expect(`${html}${text}`).not.toMatch(/serverless/);
    expect(Buffer.byteLength(html)).toBeLessThan(100_000);
  });

  it('aplica los tokens claros y la acción en una celda con relleno', () => {
    const { html } = build();
    expect(html).toContain('border-top:4px solid #5B5F8F');
    expect(html).toMatch(
      /<td class="action" bgcolor="#5B5F8F"[^>]*padding:14px 24px;[^>]*border-radius:5px/,
    );
    expect(html).toMatch(/<a class="action-link"[^>]*color:#FCFCFE/);
  });

  it('declara la tipografía en cada bloque de texto para clientes que no la heredan', () => {
    const { html } = build();
    for (const name of ['date', 'excerpt', 'footer', 'link'])
      expect(html).toMatch(
        new RegExp(`class="${name}"[^>]*font-family:'Segoe UI',Arial,sans-serif`),
      );
  });

  it('enlaza el artículo y la baja con texto descriptivo', () => {
    expect(links(build().html)).toEqual([
      [input.url, 'Leer artículo'],
      [unsubscribeUrl, 'Darme de baja'],
    ]);
  });

  it('envía texto plano equivalente', () => {
    expect(build().text).toBe(
      [
        'Matias Galeano · Blog técnico',
        input.title,
        '26 nov 2026',
        input.excerpt,
        `Leer artículo: ${input.url}`,
        'Recibís este aviso porque te suscribiste al blog.',
        `Darme de baja: ${unsubscribeUrl}`,
      ].join('\n\n'),
    );
  });

  it('sin resumen usa el título como preheader y quita el bloque', () => {
    const { html, text } = build({ excerpt: undefined });
    expect(visibleText(html).slice(0, 5)).toEqual([
      input.title,
      'Matias Galeano · Blog técnico',
      input.title,
      '26 nov 2026',
      'Leer artículo',
    ]);
    expect(html).not.toContain('class="excerpt');
    expect(text).not.toContain(input.excerpt);
  });

  it.each([
    ['2026-01-01', '1 ene 2026'],
    ['2026-09-30', '30 sept 2026'],
    ['2026-12-31', '31 dic 2026'],
  ])('mantiene el día calendario de %s en cualquier zona', (date, label) => {
    const original = process.env.TZ;
    try {
      for (const zone of ['America/Argentina/Buenos_Aires', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = zone;
        expect(build({ date }).text).toContain(`\n\n${label}\n\n`);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it.each([undefined, 'ayer', '2026-02-30', '2026-13-01', '2026-11-26T23:00:00-03:00'])(
    'omite una fecha ausente o que no es de calendario: %s',
    (date) => {
      const { html, text } = build({ date });
      expect(html).not.toContain('class="date');
      expect(text.split('\n\n').slice(1, 3)).toEqual([input.title, input.excerpt]);
    },
  );

  it('escapa todo valor y conserva UTF-8', () => {
    const title = `Ñandú 🚀 <script>"x" & 'y'</script>`;
    const { html, text } = build({ title, excerpt: title, url: 'https://x.dev/a"><b>' });
    expect(html).not.toMatch(/<script|<b>/);
    expect(html).toContain('Ñandú 🚀 &lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;');
    expect(html).toContain('href="https://x.dev/a&quot;&gt;&lt;b&gt;"');
    expect(text).toContain(title);
  });

  it('parte palabras indivisibles sin ensanchar la carta', () => {
    const word = 'x'.repeat(400);
    const { html } = build({ title: word, excerpt: word });
    expect(html).toContain('table-layout:fixed');
    for (const block of ['title', 'excerpt'])
      expect(html).toMatch(
        new RegExp(`class="${block}[^>]*overflow-wrap:anywhere;word-break:break-word`),
      );
    expect(html).toContain(word);
  });

  it('es determinista: un reintento repite el mismo envío', () => {
    expect(build()).toEqual(build());
  });
});
