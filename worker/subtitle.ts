/**
 * Guard for English subtitles. A subtitle can turn a harmless line into profanity, so any
 * subtitle that trips this list is dropped; the native-script caption still shows. Mild words
 * like "idiot", "stupid" and "saala" are allowed on purpose.
 */
const PROFANITY = new RegExp(
  [
    'fuck', // anywhere: fucking, motherfucker, clusterfuck
    '\\bmotherf\\w*',
    '\\bshit\\w*',
    '\\b(?:bull|horse)shit\\w*',
    '\\bbitch\\w*',
    '\\bbastards?\\b',
    '\\bass\\s?holes?\\b',
    '\\b(?:dumb|jack)ass\\w*',
    '\\bdick(?:s|head\\w*)?\\b',
    '\\bcunts?\\b',
    '\\bwhores?\\b',
    '\\bsluts?\\b',
    '\\b(?:god)?damn\\w*',
    '\\bbloody\\s+hell\\b',
    '\\bcrap\\w*',
    '\\bpiss\\w*',
    '\\bwtf\\b',
    '\\bstfu\\b',
    '[a-z]\\*+[a-z]', // censored forms like f*ck, sh*t, b**ch
    // Hindi slurs in Latin script.
    '\\bchutiy?[ae]\\w*',
    '\\bbh?(?:e+h?e*|a)n\\s?ch?o+d\\w*',
    '\\bmaa?d[ae]r\\s?ch?o+d\\w*',
    '\\bbh?osa?d\\w*',
    '\\bgaa?ndu\\w*',
    '\\bharaa?m(?:i|zaa?d\\w*)\\b',
  ].join('|'),
  'i',
);

export function hasProfanity(text: string): boolean {
  return PROFANITY.test(text);
}

/** Returns the subtitle unchanged, or undefined when it should not be shown. */
export function cleanSubtitle(en: string | undefined): string | undefined {
  if (!en?.trim()) return undefined;
  return hasProfanity(en) ? undefined : en;
}

/** Longest subtitle shown (the script writer is asked for at most 200 characters). */
export const SUBTITLE_MAX_CHARS = 280;

/**
 * A subtitle the script writer wrote next to a line, made fit to show: one line of text, no leftover
 * placeholders, a sane length, and through the profanity guard. Undefined when there is nothing to show
 * or it is not English at all.
 */
export function modelSubtitle(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  let text = raw
    .normalize('NFC')
    .replace(/\{[^{}]{0,40}\}/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?;:…])/g, '$1')
    .replace(/^[\s,;:.!?…-]+/, '')
    .trim();
  if (!/[A-Za-z]/.test(text)) return undefined;
  if (text.length > SUBTITLE_MAX_CHARS) {
    const cut = text.lastIndexOf(' ', SUBTITLE_MAX_CHARS - 1);
    text = `${text.slice(0, cut > SUBTITLE_MAX_CHARS / 2 ? cut : SUBTITLE_MAX_CHARS - 1).replace(/[\s,;:]+$/, '')}…`;
  }
  return cleanSubtitle(text);
}
