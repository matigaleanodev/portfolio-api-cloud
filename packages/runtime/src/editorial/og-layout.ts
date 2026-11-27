/** Ajuste de líneas del título OG. Puro: el ancho lo mide quien llama, con la fuente real. */
export type OgTitleSize = 84 | 75 | 62;

export interface OgTitleLayout {
  readonly fontSize: OgTitleSize;
  readonly lines: readonly string[];
  readonly truncated: boolean;
}

export type FitsLine = (text: string, fontSize: OgTitleSize) => boolean;

const presets = [
  { fontSize: 84, maxLines: 2 },
  { fontSize: 75, maxLines: 3 },
  { fontSize: 62, maxLines: 4 },
] as const;

const smallest = presets[2];
const ellipsis = '…';
// Configuración regional explícita: la segmentación no depende del entorno.
const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
const noBreakSpaces = '  ';
const breakingSpace = new RegExp(`(?:(?![${noBreakSpaces}])\\s)+`, 'u');
// Controles, surrogates sueltos, no caracteres e invisibles sin efecto visual propio.
const discarded = /(?!\s)[\p{Cc}\p{Cs}\p{Noncharacter_Code_Point}­​⁠﻿]/gu;

/** Palabra sin nada que dibujar: solo caracteres de formato o ignorables. */
const invisibleWord = /^[\p{Cf}\p{Default_Ignorable_Code_Point}]*$/u;
/** Las secuencias de emoji reales quedan por debajo; más largo no entra en una línea. */
const maxGraphemeLength = 32;

export function hasOversizedGrapheme(line: string): boolean {
  for (const { segment } of segmenter.segment(line))
    if (segment.length > maxGraphemeLength) return true;
  return false;
}

export function normalizeOgTitle(title: string): string {
  return title
    .replace(discarded, '')
    .normalize('NFC')
    .split(breakingSpace)
    .filter((word) => !invisibleWord.test(word))
    .join(' ');
}

interface Line {
  text: string;
  /** Cantidad de caracteres de `text` hasta el último fin de palabra completa. */
  wordEnd: number;
}

/**
 * Llenado voraz que se detiene en cuanto hay una línea de más. Sin `split`, devuelve
 * `undefined` si alguna palabra no entra sola.
 */
function wrap(
  words: readonly string[],
  fits: (text: string) => boolean,
  maxLines: number,
  split: boolean,
): Line[] | undefined {
  const lines: Line[] = [];
  let current: Line = { text: '', wordEnd: 0 };
  const push = () => {
    if (current.text) lines.push(current);
    current = { text: '', wordEnd: 0 };
  };

  for (const word of words) {
    if (lines.length > maxLines) break;
    const candidate = current.text ? `${current.text} ${word}` : word;
    if (fits(candidate)) {
      current = { text: candidate, wordEnd: candidate.length };
      continue;
    }
    push();
    if (fits(word)) {
      current = { text: word, wordEnd: word.length };
      continue;
    }
    if (!split) return undefined;
    for (const { segment } of segmenter.segment(word)) {
      if (current.text && !fits(current.text + segment)) {
        push();
        if (lines.length > maxLines) break;
      }
      current.text += segment;
    }
    current.wordEnd = current.text.length;
  }
  push();
  return lines;
}

/** Última línea visible con “…”: en límite de palabra y, si no hay ninguno, entre grafemas. */
function truncate(lines: Line[], fits: (text: string) => boolean): string[] {
  const visible = lines.slice(0, smallest.maxLines);
  // Retroceder más de una línea perdería demasiado título: en ese caso se corta entre grafemas.
  for (let index = visible.length - 1; index >= visible.length - 2; index -= 1) {
    const { text, wordEnd } = visible[index]!;
    let end = wordEnd;
    while (end > 0) {
      const candidate = text.slice(0, end).trimEnd() + ellipsis;
      if (fits(candidate)) return [...visible.slice(0, index).map((l) => l.text), candidate];
      end = text.lastIndexOf(' ', end - 1);
    }
  }
  const last = visible.at(-1)!.text;
  const kept = [...segmenter.segment(last)].map((s) => s.segment);
  while (kept.length > 1 && !fits(kept.join('') + ellipsis)) kept.pop();
  return [...visible.slice(0, -1).map((l) => l.text), kept.join('').trimEnd() + ellipsis];
}

/** `title` ya normalizado y no vacío. */
export function layoutOgTitle(title: string, fitsLine: FitsLine): OgTitleLayout {
  const words = title.split(' ');
  for (const { fontSize, maxLines } of presets) {
    const lines = wrap(words, (text) => fitsLine(text, fontSize), maxLines, false);
    if (lines && lines.length <= maxLines)
      return { fontSize, lines: lines.map((l) => l.text), truncated: false };
  }
  const { fontSize, maxLines } = smallest;
  const fits = (text: string) => fitsLine(text, fontSize);
  const lines = wrap(words, fits, maxLines, true)!;
  return lines.length <= maxLines
    ? { fontSize, lines: lines.map((l) => l.text), truncated: false }
    : { fontSize, lines: truncate(lines, fits), truncated: true };
}
