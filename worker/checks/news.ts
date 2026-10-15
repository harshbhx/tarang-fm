/**
 * newsFidelity: every number, Latin-script word and known place name in a news line must come from the slate (titles,
 * details, publishers, slot places) or the bulletin's own frame (time, station, newsreader). Lines that fail are
 * dropped, the same way invented numbers were.
 */
import { knownPlaceGroups } from '../news/catalog';

export interface FidelityLine {
  text: string;
}

export interface FidelityResult<T> {
  lines: T[];
  /** Why each dropped line was dropped */
  dropped: { text: string; reason: string }[];
}

function digitsIn(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/g)?.map((d) => d.replace(/,/g, '')) ?? [];
}

/** Latin words of 2+ letters (acronyms, English names, Hinglish), lowercased. */
function latinWords(text: string): string[] {
  return text.match(/[A-Za-z][A-Za-z'’.-]*[A-Za-z]|[A-Za-z]{2,}/g)?.map((w) => w.toLowerCase().replace(/[’']s$/, '').replace(/\./g, '')) ?? [];
}

/** Latin words a newsreader may always say (the station's frame and units). */
const FRAME_LATIN = new Set(['fm', 'tarang', 'news', 'update', 'bulletin', 'km', 'kg', 'am', 'pm', 'live']);

const NB = String.raw`(?<![\p{L}\p{M}])`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Each place with a matcher per name: a place named in any script in the slate may be said in any script. */
const PLACES = knownPlaceGroups().map((names) => names.map((n) => ({ name: n, re: new RegExp(`${NB}${escape(n)}`, /[A-Za-z]/.test(n) ? 'iu' : 'u') })));

function mentioned(group: (typeof PLACES)[number], text: string): string | undefined {
  return group.find((n) => n.re.test(text))?.name;
}

/** Indic digits → ASCII, so "२०२६" and "2026" compare equal. */
function asciiDigits(text: string): string {
  return text.replace(/[०-९০-৯૦-૯௦-௯]/g, (c) => String((c.codePointAt(0)! - 0x0966) % 16 % 10));
}

/**
 * Keeps the lines whose numbers, Latin words and place names all appear in `slateText` or `frameText`.
 * `frameText` is what the bulletin may add itself: the time phrase, station name, frequency, newsreader, the
 * listener's city and state as slot cues.
 */
export function newsFidelity<T extends FidelityLine>(lines: T[], slateText: string, frameText: string): FidelityResult<T> {
  const source = asciiDigits(`${slateText} ${frameText}`);
  const digits = new Set(digitsIn(source));
  const latin = new Set(latinWords(source).concat([...FRAME_LATIN]));
  const lowerSource = source.toLowerCase();
  const kept: T[] = [];
  const dropped: FidelityResult<T>['dropped'] = [];
  for (const line of lines) {
    const text = asciiDigits(line.text);
    const badDigit = digitsIn(text).find((d) => !digits.has(d));
    const badLatin = latinWords(text).find((w) => !latin.has(w) && !lowerSource.includes(w));
    const badPlace = PLACES.map((g) => (mentioned(g, source) ? undefined : mentioned(g, text))).find(Boolean);
    const reason = badDigit ? `number ${badDigit}` : badLatin ? `word "${badLatin}"` : badPlace ? `place ${badPlace}` : undefined;
    if (reason) dropped.push({ text: line.text, reason });
    else kept.push(line);
  }
  return { lines: kept, dropped };
}
