/**
 * The numbers the free checks enforce, from the show bible: §3.1 (fillers), §3.2 (rhythm), §4.1-§4.4 (segment
 * shapes) and §5.1 (the free-check table, which wins where they differ). One place, so the producer, the
 * story and ad checks and the prompts can agree. A range is [min, max], both inclusive.
 */

export type Range = readonly [number, number];

// ---- Line counts -----------------------------------------------------------------------------------------------

/** rj_link, per mode (§4.1). Each studio call read on air adds one line. */
export const RJ_LINES = {
  opener: [3, 4],
  payload: [3, 5],
  kahani_in: [2, 3],
  kahani_out: [3, 5],
} as const satisfies Record<string, Range>;

/** news, per mode (§4.2): what the bible asks of a full slate */
export const NEWS_LINES = {
  full: [12, 15],
  update: [5, 6],
} as const satisfies Record<string, Range>;

/** ad_break (§4.3): 3-5 lines, 6 accepted */
export const AD_LINES: Range = [3, 6];

/**
 * kahani (§5.1): a serial part or a one-shot story, 12-18 lines. The writer aims for 12-16 per part (§4.4)
 * and 16-18 for a one-shot (§6); the gate is §5.1's.
 */
export const KAHANI_LINES: Range = [12, 18];
export const KAHANI_PART_TARGET: Range = [12, 16];
export const ONE_SHOT_TARGET: Range = [16, 18];

/**
 * A news bulletin's lines for the slate it was given. A full bulletin is open, roundup, "अब विस्तार से", one or
 * two lines per item and the sign-off, so a short slate cannot fill 12 lines without padding; an update is the
 * open, one line per item and the sign-off (prompts/news.ts asks for min(6, n+2) to n+3).
 */
export function newsLines(mode: string | undefined, items?: number): Range {
  const n = items && items > 0 ? items : undefined;
  if (mode === 'update') return n ? [Math.min(NEWS_LINES.update[1], n + 2), n + 3] : NEWS_LINES.update;
  return n ? [Math.min(NEWS_LINES.full[0], n + 4), NEWS_LINES.full[1]] : NEWS_LINES.full;
}

/** An RJ link's lines for its mode and the studio calls it reads. Undefined when the mode is not known. */
export function rjLines(mode: string | undefined, calls = 0): Range | undefined {
  const r = mode ? RJ_LINES[mode as keyof typeof RJ_LINES] : undefined;
  return r ? [r[0] + calls, r[1] + calls] : undefined;
}

/**
 * Lines a bulletin must keep after the invented ones are dropped, or it is rewritten (a code value; §5.3's
 * last-resort template is for fewer than 5 lines after both attempts).
 */
export const NEWS_MIN_AFTER_DROP = { full: 8, update: 4 } as const;

// ---- Voice (§3.1, §3.2) -------------------------------------------------------------------------------------------

/** At most this many filler words in a whole segment; line 1 never opens on one; no line ends on a tag */
export const FILLER_MAX = 2;
/** Rhythm: 4+ lines whose lengths all sit within this many characters read flat (soft) */
export const RHYTHM_MIN_LINES = 4;
export const RHYTHM_MIN_SPREAD = 30;

// ---- Ads (§4.3, §5.1) ---------------------------------------------------------------------------------------------------

/** The brand is said once or twice */
export const AD_BRAND_MENTIONS: Range = [1, 2];
/** Total characters: the bible's "under 400" is the target (soft); past the hard limit it cannot fit 20 s */
export const AD_CHARS = { target: 400, max: 520 } as const;
/** A run of this many Latin words is a full English sentence (allowed only in the T&C beat or the tagline) */
export const LATIN_RUN_WORDS = 5;
/** The planned punchline "lands" when the last two lines share this much of its words (soft: §5.1 leaves it to the judge) */
export const PUNCHLINE_OVERLAP = 0.25;

// ---- Kahani (§4.4) ----------------------------------------------------------------------------------------------------

/** The part's last line matches the outline's when it shares this much of its words */
export const ENDING_OVERLAP = 0.3;
/** The narrator's share of the lines (soft: §4.4 acceptance, not a §5.1 gate) */
export const NARRATOR_MAX_SHARE = 0.4;
/** A character speaking this many lines in a row is talking to nobody */
export const MONOLOGUE_LINES = 4;

// ---- English (§3.5) -----------------------------------------------------------------------------------------------------

/** A line is in English when more than this share of its letters is Latin, with at least ENGLISH_MIN_WORDS words */
export const ENGLISH_LATIN_SHARE = 0.5;
export const ENGLISH_MIN_WORDS = 4;
