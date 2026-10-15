/**
 * Casting for the Kahani (bible §1 casting limits, prompt pack §10.5). A serial's voices are chosen once and
 * locked for all three parts. The story never borrows a voice the listener has just heard in another role:
 * the RJ on air, the two ad voices, the jingle voice and the newsreader are kept out, in that order of
 * importance. When a station has too few voices, the exclusions are relaxed from the end of that list (the
 * newsreader first); the on-air RJ may voice a character only as the very last resort, and never narrates.
 */
import { rjVoiceAt, storyVoices } from '../shared/stations';
import type { ListenerContext, Role, Station, StationId, Voice } from '../shared/types';
import { localHour } from './show';

type Random = () => number;

export type StoryRole = 'narrator' | 'char_a' | 'char_b' | 'char_kid';
export type CharacterRole = Exclude<StoryRole, 'narrator'>;
export const CHARACTER_ROLES: CharacterRole[] = ['char_a', 'char_b', 'char_kid'];

/** A story cast: the narrator and 2-3 characters (a role left out is not in this story). */
export type SerialCast = { narrator: Voice; char_a: Voice } & Partial<Record<'char_b' | 'char_kid', Voice>>;

/** Speaking characters per story: stations with few distinct voices tell 2-character stories. */
const CHARACTERS: Partial<Record<StationId, number>> = { hi: 3, mr: 3, ta: 2, bn: 2, gu: 2 };

/** The exclusion tiers, most important first; relaxing goes from the end. */
const TIERS: Role[] = ['rj', 'ad_announcer', 'ad_customer', 'station_id', 'news'];

/** The actor behind a persona ("mukul_hi_ads" and "mukul_hi_suspense" are both Mukul). */
const actor = (v: Voice) => v.speaker.split('_')[0];

function shuffle<T>(list: readonly T[], random: Random): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function uniqueBySpeaker(list: Voice[]): Voice[] {
  const seen = new Set<string>();
  return list.filter((v) => (seen.has(v.speaker) ? false : (seen.add(v.speaker), true)));
}

interface Attempt {
  cast: SerialCast;
  characters: number;
  /** Voices that are a second-best choice (another daypart's RJ, or the same actor as an excluded voice) */
  soft: number;
  relaxed: number;
}

export interface CastResult {
  cast: SerialCast;
  /** Exclusions that had to be dropped for this station, e.g. ['news', 'station_id'] */
  relaxed: Role[];
}

/**
 * Casts one Kahani (a serial or a one-shot story): a narrator who suits the genre, then char_a, char_b and
 * char_kid as the station's voices allow, every role a different voice.
 */
export function castSerial(
  station: Station,
  opts: { listener?: ListenerContext; hour?: number; spooky?: boolean; random?: Random } = {},
): CastResult {
  const random = opts.random ?? Math.random;
  const hour = opts.hour ?? (opts.listener ? localHour(opts.listener) : 20);
  const onAir = rjVoiceAt(station, hour);
  const pool = station.storyPool;
  const target = CHARACTERS[station.id] ?? 2;
  const tierSpeakers = TIERS.map((role) => (role === 'rj' ? onAir.speaker : station.cast[role].speaker));
  const otherRjs = new Set([station.cast.rj, ...(station.shows ?? []).map((s) => s.rj)].map((v) => v.speaker));
  const fallback: SerialCast = { narrator: station.cast.narrator, char_a: station.cast.char_a, char_b: station.cast.char_b, char_kid: station.cast.char_kid };
  if (!pool) return { cast: fallback, relaxed: [] };

  const narratorPool = uniqueBySpeaker(opts.spooky && pool.spookyNarrators?.length ? [...pool.spookyNarrators, ...pool.narrators] : [...pool.narrators, ...(pool.spookyNarrators ?? [])]);
  let best: Attempt | undefined;
  // Level k relaxes the last k tiers; level 5 lets the on-air RJ play a character (never the narrator)
  for (let level = 0; level <= TIERS.length; level++) {
    const hard = new Set(tierSpeakers.slice(0, TIERS.length - level));
    const hardActors = new Set(tierSpeakers.map((s) => s.split('_')[0]));
    const score = (v: Voice) => (otherRjs.has(v.speaker) ? 1 : 0) + (hardActors.has(actor(v)) ? 1 : 0);
    const byScore = (list: Voice[]) => shuffle(list, random).sort((a, b) => score(a) - score(b));
    // A ghost story or a night mystery keeps its suspense narrator ahead of any score
    const spookyVoices = new Set(opts.spooky ? (pool.spookyNarrators ?? []).map((v) => v.speaker) : []);
    const rank = (v: Voice) => (spookyVoices.size && !spookyVoices.has(v.speaker) ? 10 : 0) + score(v);
    const narrators = shuffle(narratorPool.filter((v) => !hard.has(v.speaker) && v.speaker !== onAir.speaker), random).sort((a, b) => rank(a) - rank(b));
    for (const narrator of narrators) {
      const taken = new Set([narrator.speaker]);
      const free = (list: Voice[]) => byScore(uniqueBySpeaker(list).filter((v) => !hard.has(v.speaker) && !taken.has(v.speaker)));
      const take = (list: Voice[]): Voice | undefined => {
        const v = free(list)[0];
        if (v) taken.add(v.speaker);
        return v;
      };
      // One man and one woman in either order most of the time; two of a kind sometimes (or when that's all there is)
      const roll = random();
      const [first, second] = roll < 0.4 ? [pool.men, pool.women] : roll < 0.8 ? [pool.women, pool.men] : roll < 0.9 ? [pool.men, pool.men] : [pool.women, pool.women];
      const char_a = take(first) ?? take([...pool.men, ...pool.women]);
      if (!char_a) continue;
      const cast: SerialCast = { narrator, char_a };
      // Two-character stories: an adult and a kid, or two adults, whichever the voices allow
      const kidFirst = target === 2 && random() < 0.5;
      if (kidFirst) {
        const kid = take(pool.kids);
        if (kid) cast.char_kid = kid;
      }
      if (target === 3 || !cast.char_kid) {
        const char_b = take(second) ?? take([...pool.men, ...pool.women]);
        if (char_b) cast.char_b = char_b;
      }
      if (target === 3 || (!cast.char_kid && !cast.char_b)) {
        const kid = take(pool.kids);
        if (kid) cast.char_kid = kid;
      }
      const characters = 1 + (cast.char_b ? 1 : 0) + (cast.char_kid ? 1 : 0);
      const soft = Object.values(cast).reduce((n, v) => n + score(v as Voice), 0) + rank(narrator) - score(narrator);
      const attempt: Attempt = { cast, characters: Math.min(characters, target), soft, relaxed: level };
      if (
        !best ||
        attempt.characters > best.characters ||
        (attempt.characters === best.characters && attempt.relaxed === best.relaxed && attempt.soft < best.soft)
      ) {
        best = attempt;
      }
    }
    if (best && best.characters >= target) break;
  }
  if (!best || best.characters < 2) return { cast: fallback, relaxed: [...TIERS] };
  return { cast: best.cast, relaxed: TIERS.slice(TIERS.length - best.relaxed) };
}

/** The locked cast as it travels with the serial: role → speaker id. */
export function castRecord(cast: SerialCast): Partial<Record<StoryRole, string>> {
  const out: Partial<Record<StoryRole, string>> = {};
  for (const role of ['narrator', ...CHARACTER_ROLES] as StoryRole[]) {
    const v = cast[role];
    if (v) out[role] = v.speaker;
  }
  return out;
}

/**
 * Rebuilds a locked cast from the speaker ids a client sent back. Every speaker must be one of this station's
 * story voices (with the pace that suits the role, e.g. a kid's faster pace), and all must differ. Anything
 * else returns undefined, and the caller recasts.
 */
export function castFromRecord(station: Station, record: Partial<Record<string, string>> | undefined): SerialCast | undefined {
  if (!record?.narrator || !record.char_a) return undefined;
  const pool = station.storyPool;
  const all = [...storyVoices(station), ...Object.values(station.cast)];
  const lists: Record<StoryRole, Voice[]> = {
    narrator: [...(pool?.narrators ?? []), ...(pool?.spookyNarrators ?? []), station.cast.narrator],
    char_a: [...(pool?.men ?? []), ...(pool?.women ?? []), station.cast.char_a, station.cast.char_b],
    char_b: [...(pool?.men ?? []), ...(pool?.women ?? []), station.cast.char_a, station.cast.char_b],
    char_kid: [...(pool?.kids ?? []), station.cast.char_kid],
  };
  const out: Partial<Record<StoryRole, Voice>> = {};
  const seen = new Set<string>();
  for (const role of ['narrator', ...CHARACTER_ROLES] as StoryRole[]) {
    const speaker = record[role];
    if (!speaker) continue;
    if (seen.has(speaker)) return undefined;
    const voice = lists[role].find((v) => v.speaker === speaker) ?? all.find((v) => v.speaker === speaker);
    if (!voice) return undefined;
    seen.add(speaker);
    out[role] = voice;
  }
  return out.narrator && out.char_a ? (out as SerialCast) : undefined;
}

/** The character roles present in a cast, in order. */
export function castCharacters(cast: SerialCast): CharacterRole[] {
  return CHARACTER_ROLES.filter((r) => Boolean(cast[r]));
}
