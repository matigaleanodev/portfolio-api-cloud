import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { OgGenerationInput } from '@portfolio-api-cloud/contracts/editorial';
import {
  hasOversizedGrapheme,
  layoutOgTitle,
  normalizeOgTitle,
  type OgTitleLayout,
  type OgTitleSize,
} from './og-layout.js';

type ResvgModule = typeof import('@resvg/resvg-js');

// Binario nativo CommonJS: se carga recién al renderizar y solo existe en el artifact og.
const requireFromModule = createRequire(import.meta.url);
const loadResvg = () => requireFromModule('@resvg/resvg-js') as ResvgModule;

/** `assets/og/fonts` del paquete runtime, relativo a `dist/editorial/` (o `src/editorial/`). */
export const defaultFontDirectory = fileURLToPath(
  new URL('../../assets/og/fonts/', import.meta.url),
);

export const ogFontFiles = [
  'IBMPlexSans-Regular.ttf',
  'IBMPlexSans-SemiBold.ttf',
  'IBMPlexMono-Regular.ttf',
  'IBMPlexMono-Medium.ttf',
  // Va al final: solo aporta los glifos que IBM Plex no tiene (emojis monocromos).
  'NotoEmoji.ttf',
] as const;

// Composición de DESIGN.md: lienzo claro fijo, filete, firma y título.
const canvas = { width: 1200, height: 630, ruleHeight: 36, left: 96, right: 1104, middle: 315 };
const color = { canvas: '#F3F4F7', text: '#1F2937', accent: '#5B5F8F' };
const signature = { text: 'Matias Galeano · Blog técnico', size: 38, gap: 48 };
const titleStyle = { lineHeight: 1.08, tracking: -0.03 };
/** Línea base dentro de su caja para las métricas de IBM Plex (asc. 1,025, desc. 0,275). */
const baselineShift = 0.375;
/** Ningún texto más largo entra en una línea; evita medir entradas desmesuradas. */
const maxMeasurableLength = 400;
const emojiFamily = 'Noto Emoji';
/** Grafemas que se dibujan con Noto Emoji; ©, ®, ™ y las flechas básicas siguen en IBM Plex. */
const emojiGrapheme =
  /\p{Emoji_Presentation}|\p{Regional_Indicator}|[\ufe0f\u20e3]|(?![\u0000-\u22ff])\p{Extended_Pictographic}/u;
const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });

export const fallbackOgTitle = 'Nuevo artículo en el blog';

export interface OgComposition extends OgTitleLayout {
  readonly svg: string;
  readonly fallback: boolean;
  /** Caja de la firma y el título, medida por el renderizador. */
  readonly textBounds: { left: number; right: number; top: number; bottom: number };
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const svgDocument = (content: string) =>
  `<svg width="${canvas.width}" height="${canvas.height}" viewBox="0 0 ${canvas.width} ${canvas.height}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`;

function titleText(content: string, size: OgTitleSize, x: number, y: number, family: string) {
  const tracking = (size * titleStyle.tracking).toFixed(2);
  return `<text xml:space="preserve" x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-family="${family}" font-size="${size}" font-weight="600" letter-spacing="${tracking}" fill="${color.text}">${escapeXml(content)}</text>`;
}

/** Tramos consecutivos de texto o de emojis. */
function splitRuns(line: string): { text: string; emoji: boolean }[] {
  const runs: { text: string; emoji: boolean }[] = [];
  for (const { segment } of segmenter.segment(line)) {
    const emoji = emojiGrapheme.test(segment);
    const last = runs.at(-1);
    if (last?.emoji === emoji) last.text += segment;
    else runs.push({ text: segment, emoji });
  }
  return runs;
}

/**
 * La falta de fuentes es un error: sin ellas resvg produciría una imagen sin texto.
 * Nunca se usan fuentes del sistema.
 */
function createRenderer(fontDirectory: string) {
  const fontFiles = ogFontFiles.map((name) => join(fontDirectory, name));
  if (fontFiles.some((file) => !existsSync(file))) throw new Error('OG fonts are missing');
  const { Resvg } = loadResvg();
  return (svg: string) =>
    new Resvg(svg, {
      fitTo: { mode: 'width', value: canvas.width },
      font: { fontFiles, defaultFontFamily: 'IBM Plex Sans', loadSystemFonts: false },
    });
}

type Renderer = ReturnType<typeof createRenderer>;

function compose(title: string, renderer: Renderer): OgComposition {
  const boundsOf = (content: string) => {
    const box = renderer(svgDocument(content)).getBBox();
    if (!box) throw new Error('OG text could not be measured');
    return box;
  };
  const rightOf = (content: string) => {
    const box = boundsOf(content);
    return box.x + box.width;
  };
  /**
   * Cada tramo va en su propio <text>: resvg 2.6.2 descarta el respaldo de fuente de toda la
   * línea cuando una secuencia de emojis cambia la cantidad de glifos.
   */
  const titleLine = (line: string, size: OgTitleSize, y: number) => {
    const runs = splitRuns(line);
    let x = canvas.left;
    return runs
      .map(({ text, emoji }, index) => {
        const family = emoji ? emojiFamily : 'IBM Plex Sans';
        const markup = titleText(text, size, x, y, family);
        if (index < runs.length - 1) {
          // Avance del tramo: cuánto corre a un glifo de referencia puesto a continuación.
          const probe = emoji ? '🚀' : 'H';
          x +=
            rightOf(titleText(text + probe, size, x, y, family)) -
            rightOf(titleText(probe, size, x, y, family));
        }
        return markup;
      })
      .join('');
  };
  const fits = (line: string, size: OgTitleSize) =>
    line.length <= maxMeasurableLength &&
    rightOf(titleLine(line, size, canvas.middle)) <= canvas.right;

  const normalized = normalizeOgTitle(title);
  let fallback = normalized === '';
  let layout = layoutOgTitle(fallback ? fallbackOgTitle : normalized, fits);
  if (layout.lines.some(hasOversizedGrapheme)) {
    fallback = true;
    layout = layoutOgTitle(fallbackOgTitle, fits);
  }

  const lineHeight = layout.fontSize * titleStyle.lineHeight;
  const blockHeight = signature.size + signature.gap + layout.lines.length * lineHeight;
  const top = canvas.middle - blockHeight / 2;
  const signatureY = top + signature.size * (0.5 + baselineShift);
  const titleTop = top + signature.size + signature.gap;
  const texts = [
    `<text x="${canvas.left}" y="${signatureY.toFixed(2)}" font-family="IBM Plex Mono" font-size="${signature.size}" fill="${color.accent}">${signature.text}</text>`,
    ...layout.lines.map((line, index) =>
      titleLine(
        line,
        layout.fontSize,
        titleTop + (index + 0.5) * lineHeight + layout.fontSize * baselineShift,
      ),
    ),
  ].join('');
  const box = boundsOf(texts);

  return {
    ...layout,
    fallback,
    textBounds: {
      left: box.x,
      right: box.x + box.width,
      top: box.y,
      bottom: box.y + box.height,
    },
    svg: svgDocument(
      `<rect width="${canvas.width}" height="${canvas.height}" fill="${color.canvas}"/>` +
        `<rect width="${canvas.width}" height="${canvas.ruleHeight}" fill="${color.accent}"/>` +
        texts,
    ),
  };
}

export function composeOgImage(
  title: string,
  fontDirectory: string = defaultFontDirectory,
): OgComposition {
  return compose(title, createRenderer(fontDirectory));
}

export function buildOgSvg(
  { title }: Omit<OgGenerationInput, 'slug'>,
  fontDirectory: string = defaultFontDirectory,
): string {
  return composeOgImage(title, fontDirectory).svg;
}

/** PNG 1200×630. El resumen, la fecha y las etiquetas del evento no se dibujan. */
export async function generateOgImage(
  { title }: Omit<OgGenerationInput, 'slug'>,
  fontDirectory: string = defaultFontDirectory,
): Promise<Buffer> {
  const renderer = createRenderer(fontDirectory);
  return Buffer.from(renderer(compose(title, renderer).svg).render().asPng());
}
