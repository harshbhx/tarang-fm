/**
 * Guard for machine-translated English subtitles. Translation sometimes turns a harmless line
 * into profanity, so any subtitle that trips this list is dropped; the native-script caption
 * still shows. Mild words like "idiot", "stupid" and "saala" are allowed on purpose.
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
