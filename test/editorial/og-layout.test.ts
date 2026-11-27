import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildOgSvg,
  composeOgImage,
  generateOgImage,
} from '../../packages/runtime/src/editorial/og.js';
import { repositoryPath } from '../support/paths.js';

const fonts = repositoryPath('packages/runtime/assets/og/fonts');
const compose = (title: string) => composeOgImage(title, fonts);
const graphemes = (value: string) =>
  [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(value)].map((s) => s.segment);

/** Todo lo dibujado, salvo el fondo y el filete, queda en x 96–1104 e y 84–546. */
function expectInsideSafeArea(title: string): void {
  const { textBounds } = compose(title);
  expect(textBounds.left).toBeGreaterThanOrEqual(96);
  expect(textBounds.right).toBeLessThanOrEqual(1104);
  expect(textBounds.top).toBeGreaterThanOrEqual(84);
  expect(textBounds.bottom).toBeLessThanOrEqual(546);
}

const long =
  'Cómo diseñé la arquitectura de Modo Playa para escalar contenido, automatización editorial y producto sin perder claridad visual ni mezclar responsabilidades entre repositorios';

describe('composición OG', () => {
  it('usa el lienzo, el filete, la firma y los colores de Índigo de taller', () => {
    const svg = buildOgSvg({ title: 'Mis expectativas con Angular Native' }, fonts);
    expect(svg).toContain('width="1200" height="630"');
    expect(svg).toContain('<rect width="1200" height="630" fill="#F3F4F7"/>');
    expect(svg).toContain('<rect width="1200" height="36" fill="#5B5F8F"/>');
    expect(svg).toContain('Matias Galeano · Blog técnico');
    expect(svg).toContain('fill="#1F2937"');
    expect(svg).not.toMatch(/Gradient|<circle|rx=/);
  });

  it('no muestra resumen ni etiquetas', () => {
    const svg = buildOgSvg({ title: 'T', excerpt: 'Un resumen', tags: ['aws'] }, fonts);
    expect(svg).not.toContain('resumen');
    expect(svg.toLowerCase()).not.toContain('aws');
  });

  it('escapa XML en el título', () => {
    expect(buildOgSvg({ title: 'A <b> & "c"' }, fonts)).toContain(
      'A &lt;b&gt; &amp; &quot;c&quot;',
    );
  });

  it('usa 84px en hasta dos líneas para un título corto', () => {
    const result = compose('Mis expectativas con Angular Native');
    expect(result.fontSize).toBe(84);
    expect(result.lines.length).toBeLessThanOrEqual(2);
    expect(result.lines.join(' ')).toBe('Mis expectativas con Angular Native');
    expect(result.truncated).toBe(false);
  });

  it('baja de tamaño sin partir palabras ni perder texto', () => {
    const title =
      'Tarjetitas de Jira, versiones y correcciones urgentes: cómo mantengo la trazabilidad';
    const result = compose(title);
    expect([75, 62]).toContain(result.fontSize);
    expect(result.lines.length).toBeLessThanOrEqual(result.fontSize === 75 ? 3 : 4);
    expect(result.lines.join(' ')).toBe(title);
    expectInsideSafeArea(title);
  });

  it('corta un título excesivo en límite de palabra con … en la cuarta línea', () => {
    const result = compose(long);
    expect(result).toMatchObject({ fontSize: 62, truncated: true });
    expect(result.lines).toHaveLength(4);
    const shown = result.lines.join(' ');
    expect(shown.endsWith('…')).toBe(true);
    expect(long.startsWith(`${shown.slice(0, -1)} `)).toBe(true);
    expectInsideSafeArea(long);
  });

  it('parte una palabra indivisible a 62px sin perder grafemas', () => {
    const word = `https://matiasgaleano.dev/blog/${'segmento-'.repeat(6)}fin`.replaceAll('-', '_');
    const result = compose(word);
    expect(result.fontSize).toBe(62);
    expect(result.lines.join('')).toBe(word);
    expectInsideSafeArea(word);
  });

  it('corta entre grafemas cuando la primera palabra sola supera las cuatro líneas', () => {
    const word = 'q̇'.repeat(300);
    const result = compose(word);
    expect(result.lines).toHaveLength(4);
    expect(result.truncated).toBe(true);
    const kept = result.lines.join('').slice(0, -1);
    expect(graphemes(kept).every((g) => g === 'q̇')).toBe(true);
    expectInsideSafeArea(word);
  });

  it('normaliza a NFC: tildes compuestas y descompuestas dan el mismo PNG', async () => {
    const title = 'Cómo diseñé la señal ñandú';
    const [composed, decomposed] = await Promise.all([
      generateOgImage({ title: title.normalize('NFC') }, fonts),
      generateOgImage({ title: title.normalize('NFD') }, fonts),
    ]);
    expect(decomposed.equals(composed)).toBe(true);
  });

  it('colapsa espacios y descarta controles e invisibles sin romper el XML', () => {
    const result = compose('  Hola\u0000\n\t mundo​­ \ud800 ');
    expect(result.lines).toEqual(['Hola mundo']);
  });

  it('no corta en un espacio de no separación', () => {
    const result = compose('Una versión estable de Angular 21 para producción');
    expect(result.lines.some((line) => line.includes('Angular 21'))).toBe(true);
  });

  it('usa el respaldo cuando el título no tiene nada que dibujar', () => {
    const result = compose('​ \u0007');
    expect(result.fallback).toBe(true);
    expect(result.lines.join(' ')).toBe('Nuevo artículo en el blog');
  });

  it('acota el costo de un título desmesurado', () => {
    const started = performance.now();
    expect(compose('palabra '.repeat(20_000)).lines).toHaveLength(4);
    expect(compose('x'.repeat(100_000)).lines).toHaveLength(4);
    expect(performance.now() - started).toBeLessThan(5_000);
  });

  it.each([
    'Qué pruebo además del caso feliz',
    '¿Mi app necesita un backend desde el primer día?',
    'ÁÉÍÓÚ ÑANDÚ ÀÈÌ ÂÊÎ ÄËÏ ÅÇ jgpqy',
    'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
  ])('mantiene el texto dentro de la zona segura: %s', (title) => {
    expectInsideSafeArea(title);
  });
});

const digest = async (title: string) =>
  createHash('sha256')
    .update(await generateOgImage({ title }, fonts))
    .digest('hex');

describe('determinismo', () => {
  it('la misma entrada produce los mismos bytes', async () => {
    expect(await digest(long)).toBe(await digest(long));
  });
});

describe('emojis', () => {
  it('dibuja cada emoji con su propio glifo, no como un cuadrado genérico', async () => {
    expect(await digest('Hola 🚀')).not.toBe(await digest('Hola 🍕'));
  });

  it.each(['👩‍💻', '👨‍👩‍👧‍👦', '🇦🇷', '👍🏽', '1️⃣', '❤️', '✅'])('compone %s como un único glifo', (emoji) => {
    const single = compose('A 🚀').textBounds;
    const result = compose(`A ${emoji}`).textBounds;
    // La firma fija el ancho mínimo de la caja: se compara un título más ancho que ella.
    const wide = (value: string) => compose(`Despliegue sin miedo ${value}`).textBounds.right;
    expect(result.right).toBe(single.right);
    expect(Math.abs(wide(emoji) - wide('🚀'))).toBeLessThanOrEqual(16);
  });

  it('combina secuencias y emojis simples en la misma línea', () => {
    const mixed = compose('Despliegue 🚀 con ✅ y 👩‍💻 hoy').textBounds.right;
    const simple = compose('Despliegue 🚀 con 🚀 y 🚀 hoy').textBounds.right;
    expect(Math.abs(mixed - simple)).toBeLessThanOrEqual(16);
  });

  it('mantiene los emojis en la zona segura sin cortar secuencias', () => {
    const title = '👩‍💻'.repeat(80);
    const kept = compose(title).lines.join('').replace('…', '');
    expect(graphemes(kept).every((g) => g === '👩‍💻')).toBe(true);
    expectInsideSafeArea(title);
  });
});

describe('referencias de render', () => {
  it.each([
    [
      'Mis expectativas con Angular Native',
      '50a2de4db1ec938898501fafd9d10e2dcca2958f42c7ee4eaa7cb7bf9e628448',
    ],
    [
      'Tarjetitas de Jira, versiones y correcciones urgentes: cómo mantengo la trazabilidad',
      'df8bd4591d46fcff228d59f14503c56f5433447918b19c5f823be236cd9ddd37',
    ],
  ])('coincide con el digest aceptado: %s', async (title, expected) => {
    expect(await digest(title)).toBe(expected);
  });
});

describe('referencias de emoji y respaldo', () => {
  it.each([
    [
      'Desplegar sin miedo 🚀 con CDK ✅ y 👩‍💻',
      '8ef116d0e00933685270dcd584fe01942ed3832e1c68a8e880bf3c3ed8bb89db',
    ],
    ['​', 'fff05dab1586e13143b33d09e371a76e1905824a7a7988a8dc939489d1f1526f'],
  ])('coincide con el digest aceptado: %j', async (title, expected) => {
    expect(await digest(title)).toBe(expected);
  });
});

describe('entradas degeneradas', () => {
  it.each(['‎', '‍', '️', '͏', '᠎', '⁦⁩', '\u{e0041}'])(
    'usa el respaldo cuando el título solo tiene invisibles (%j)',
    (title) => {
      expect(compose(title)).toMatchObject({ fallback: true });
    },
  );

  it('descarta palabras formadas solo por invisibles', () => {
    expect(compose('Hola ‎ mundo').lines).toEqual(['Hola mundo']);
    expect(compose(`Hola ${'‎'.repeat(500)}`).lines).toEqual(['Hola']);
  });

  it.each([
    ['emojis encadenados', Array(200).fill('👩').join('‍')],
    ['marcas combinantes', `a${'́'.repeat(20_000)}`],
  ])('usa el respaldo ante un grafema desmesurado: %s', (_name, title) => {
    expect(compose(title)).toMatchObject({ fallback: true, truncated: false });
    expectInsideSafeArea(title);
  });

  it('no descarta líneas enteras al cortar una palabra indivisible tras otra corta', () => {
    const result = compose(`Guía: https://example.com/${'x'.repeat(300)}`);
    expect(result.lines).toHaveLength(4);
    expect(result.lines[3]!.endsWith('…')).toBe(true);
    expectInsideSafeArea(`Guía: https://example.com/${'x'.repeat(300)}`);
  });
});
