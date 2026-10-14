/** Post-processing for model-written lines. See docs/TECH-SPEC.md §8.4. */
import { MAX_LINE_CHARS } from '../shared/constants';
import type { Role, SegmentType, TtsLanguage } from '../shared/types';

/** Languages that end sentences with the danda. */
const DANDA_LANGUAGES: ReadonlySet<TtsLanguage> = new Set(['hi-IN', 'mr-IN', 'bn-IN']);

const TERMINAL = /[.!?।॥…]["'”’»)]*$/u;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}\uFE0E\uFE0F\u20E3]/gu;
const ORPHAN_JOINER = /(?<![\p{L}\p{M}])\u200D|\u200D(?![\p{L}\p{M}])/gu;
const SPEAKER_LABEL =
  /^(?:rj|dj|narrator|news|anchor|announcer|ad[_ ]announcer|ad[_ ]customer|customer|char[_ ][a-z]+|kid|station[_ ]id|host)\s*[:：]\s*/iu;
const WRAPPING_QUOTES = /^["'“”‘’«»„]+([\s\S]*?)["'“”‘’«»„]+$/u;

export function sentenceEnd(language: TtsLanguage): string {
  return DANDA_LANGUAGES.has(language) ? '।' : '.';
}

/**
 * Cleans one spoken line: strips markdown, emojis, stage directions, speaker labels and
 * whole-line quotes, collapses whitespace and guarantees closing punctuation.
 */
export function cleanText(raw: string, language: TtsLanguage): string {
  let text = raw.normalize('NFC').trim().replace(SPEAKER_LABEL, '');

  text = text
    .replace(/\[([^\]]*)\]\((?:[^)]*)\)/g, '$1')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[[^\]]{0,80}\]/g, ' ')
    .replace(/\([^)]{0,80}\)/g, ' ')
    .replace(/\{[^}]{0,80}\}/g, ' ')
    .replace(/<[^>]{0,80}>/g, ' ')
    .replace(/[[\](){}<>]/g, ' ');

  text = text
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\*[^*\n]{1,60}\*/g, ' ')
    .replace(/[*_~#|]+/g, ' ');

  text = text.replace(EMOJI, '').replace(ORPHAN_JOINER, '');
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(SPEAKER_LABEL, '');

  for (let i = 0; i < 2; i++) {
    const quoted = WRAPPING_QUOTES.exec(text);
    if (!quoted) break;
    text = quoted[1].trim();
  }

  text = text
    .replace(/\s+([,.!?।॥…])/gu, '$1')
    .replace(/([,!?।॥])\1+/gu, '$1')
    .replace(/[।॥]+\s*([!?])/gu, '$1')
    .replace(/([!?])\s*(?:[।॥]+|\.(?!\.))/gu, '$1')
    .replace(/।\s*\.(?!\.)|\.\s*।/gu, '।')
    .replace(/^[\s,.;:!?।॥…\-–—]+/u, '')
    .replace(/[\s,;:\-–—]+$/u, '')
    .trim();

  if (!/[\p{L}\p{N}]/u.test(text)) return '';
  if (!TERMINAL.test(text)) text += sentenceEnd(language);
  return text;
}

function pack(parts: string[], max: number): string[] {
  const out: string[] = [];
  let current = '';
  for (const part of parts) {
    if (!current) current = part;
    else if (current.length + 1 + part.length <= max) current = `${current} ${part}`;
    else {
      out.push(current);
      current = part;
    }
  }
  if (current) out.push(current);
  return out;
}

function hardWrap(text: string, max: number): string[] {
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(' ', max);
    if (cut < max * 0.5) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Splits a cleaned line into chunks of at most `max` chars, preferring sentence boundaries. */
export function splitLine(text: string, max = MAX_LINE_CHARS): string[] {
  if (text.length <= max) return [text];
  const sentences = text.split(/(?<=[.!?।॥…]["'”’»]?)\s+/u).filter(Boolean);
  const pieces = sentences.flatMap((sentence) => {
    if (sentence.length <= max) return [sentence];
    const clauses = sentence.split(/(?<=[,;:])\s+/u).filter(Boolean);
    return pack(clauses.flatMap((c) => (c.length <= max ? [c] : hardWrap(c, max))), max);
  });
  return pack(pieces, max);
}

export interface RawLine {
  role: Role;
  text: string;
  /** Acting direction from the model (validated later) */
  delivery?: string;
  /** True for the second and later pieces of a line that was split for length */
  continuation?: boolean;
}

/**
 * Applies cleanText + splitLine to model output, dropping empty lines and roles that the
 * segment type does not allow (Kahani maps unknown roles to the narrator).
 */
export function processLines(
  lines: RawLine[],
  allowed: readonly Role[],
  type: SegmentType,
  language: TtsLanguage,
): RawLine[] {
  const out: RawLine[] = [];
  for (const line of lines) {
    let role = line.role;
    if (!allowed.includes(role)) {
      if (type !== 'kahani') continue;
      role = 'narrator';
    }
    const text = cleanText(line.text, language);
    if (!text) continue;
    splitLine(text).forEach((chunk, i) => out.push({ role, text: chunk, delivery: line.delivery, ...(i > 0 ? { continuation: true } : {}) }));
  }
  return out;
}
