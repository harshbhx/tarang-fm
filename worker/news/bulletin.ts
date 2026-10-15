/** The slate: which real stories a bulletin reads, in which slot, never twice in a session. Pure (no I/O). */
import type { NewsSlot, Source } from '../../shared/types';
import { cityName } from './catalog';
import type { Bucket, BulletinMode, NewsLang, NewsStation, Story } from './types';

const HOUR = 3_600_000;
/** A topic that aired on the station is held back this long. */
export const TOPIC_COOLDOWN_MS = 60 * 60_000;
/** Category rotation for the full bulletin's sixth story. */
export const ROTATION: Bucket[] = ['sports', 'business', 'entertainment'];
/** A full bulletin every ~15 min: the rotation and kicker cadence follow this window. */
export const BULLETIN_WINDOW_MS = 15 * 60_000;

export interface PickOptions {
  station: NewsStation;
  mode: BulletinMode;
  /** Listener's city key and state code, when known */
  city?: string;
  state?: string;
  /** Story (cluster) or item ids already aired in this session: never again */
  sessionAired: ReadonlySet<string>;
  now: number;
  /** 0-2: which category the rotating slot starts from */
  rotation: number;
  /** Whether this bulletin may end with a light kicker */
  kicker: boolean;
}

export interface SlateItem {
  story: Story;
  slot: NewsSlot;
}

/** Freshness (half-life 8 h), multi-source weight, description bonus, and penalties (§8.4 of the research). */
export function scoreStory(s: Story, now: number, station: NewsStation): number {
  const ageH = Math.max(0, (now - s.publishedAt) / HOUR);
  let score = 0.5 ** (ageH / 8) + 0.15 * (Math.min(s.sources, 5) - 1) + (s.descr.length > 40 ? 0.1 : 0);
  if (s.question) score -= 0.2;
  if (s.opinion) score -= 0.15;
  if (s.death && s.bucket !== 'national') score -= 0.3;
  if (s.lang !== station) score -= 0.1;
  // The station aired it for someone else: prefer anything it has not aired
  if (s.stationAiredAt !== undefined) score -= now - s.stationAiredAt < 6 * HOUR ? 1.5 : 0.8;
  return score;
}

/** True when a story's title names the listener's city (a state or national item can fill the city slot). */
function namesCity(s: Story, city: string | undefined, station: NewsStation): boolean {
  if (!city) return false;
  const names = [cityName(city, station), cityName(city, s.lang as NewsLang)].filter((n): n is string => Boolean(n));
  return s.city === city || names.some((n) => s.title.includes(n));
}

const SLOT_OF: Partial<Record<Bucket, NewsSlot>> = { sports: 'sport', business: 'business', entertainment: 'entertainment', world: 'world', national: 'national' };

/**
 * Fills the slots from the unaired pool. Full: city → state → national ×2 → world → one rotating category → light
 * kicker. Update: three short items (local, national, then world or the rotating category). Empty slots fall back
 * (city → a second state story; state → national; world → national), one story per topic, at most one death or
 * accident story and never as the lead or the kicker.
 */
export function pickBulletin(stories: Story[], opts: PickOptions): SlateItem[] {
  const { now, station } = opts;
  const sessionTopics = new Set(stories.filter((s) => opts.sessionAired.has(s.clusterId) || opts.sessionAired.has(s.itemId)).map((s) => s.topicId));
  const pool = stories
    .filter((s) => !opts.sessionAired.has(s.clusterId) && !opts.sessionAired.has(s.itemId) && !sessionTopics.has(s.topicId))
    .filter((s) => !(s.topicAiredAt !== undefined && now - s.topicAiredAt < TOPIC_COOLDOWN_MS && s.stationAiredAt === undefined))
    .map((s) => ({ s, score: scoreStory(s, now, station) }))
    .sort((a, b) => b.score - a.score);

  const chosen: SlateItem[] = [];
  const usedTopics = new Set<string>();
  let deaths = 0;

  const take = (slot: NewsSlot, test: (s: Story) => boolean, opts2: { lead?: boolean; kicker?: boolean } = {}): boolean => {
    for (const { s } of pool) {
      if (usedTopics.has(s.topicId) || !test(s)) continue;
      if (s.death && (opts2.lead || opts2.kicker || deaths >= 1 || !['city', 'state', 'national'].includes(slot))) continue;
      chosen.push({ story: s, slot });
      usedTopics.add(s.topicId);
      if (s.death) deaths++;
      return true;
    }
    return false;
  };

  const inCity = (s: Story) => namesCity(s, opts.city, station) && (s.bucket === 'city' || s.bucket === 'state' || s.bucket === 'national');
  const inState = (s: Story) => Boolean(opts.state) && s.state === opts.state && (s.bucket === 'state' || s.bucket === 'city' || s.bucket === 'national');
  const isBucket = (b: Bucket) => (s: Story) => s.bucket === b && !inCity(s);
  const lead = () => chosen.length === 0;

  if (opts.mode === 'update') {
    if (!(opts.city && take('city', inCity, { lead: true }))) take('state', inState, { lead: lead() });
    take('national', isBucket('national'), { lead: lead() });
    const order = [...ROTATION.slice(opts.rotation % 3), ...ROTATION.slice(0, opts.rotation % 3)];
    if (!take('world', isBucket('world'), { lead: lead() })) for (const b of order) if (take(SLOT_OF[b]!, isBucket(b), { lead: lead() })) break;
    while (chosen.length < 3 && take('national', isBucket('national'), { lead: lead() }));
    return chosen;
  }

  const cityOk = Boolean(opts.city) && take('city', inCity, { lead: true });
  const stateOk = take('state', inState, { lead: lead() });
  if (!cityOk && stateOk) take('state', inState);
  let national = 2 + (stateOk ? 0 : 1);
  if (!take('world', isBucket('world'), { lead: lead() })) national++;
  // World goes after national on air; keep the pick but reorder below
  for (let i = 0; i < national; i++) take('national', isBucket('national'), { lead: lead() });
  const order = [...ROTATION.slice(opts.rotation % 3), ...ROTATION.slice(0, opts.rotation % 3)];
  for (const b of order) if (take(SLOT_OF[b]!, isBucket(b))) break;
  const heavy = chosen.filter((c) => c.story.death).length;
  if (opts.kicker && heavy === 0) take('kicker', (s) => s.light && !s.death);
  const rank: Record<NewsSlot, number> = { city: 0, state: 1, national: 2, world: 3, sport: 4, business: 4, entertainment: 4, kicker: 5 };
  return chosen.sort((a, b) => rank[a.slot] - rank[b.slot]);
}

/** Rotation index and kicker cadence for a bulletin at `now`: both change every 15 minutes. */
export function cadence(now: number): { rotation: number; kicker: boolean } {
  const window = Math.floor(now / BULLETIN_WINDOW_MS);
  return { rotation: window % 3, kicker: window % 2 === 0 };
}

/** The slate as the newsreader's sources: id = the story's cluster (send back in airedNews). */
export function slateSources(slate: SlateItem[]): Source[] {
  return slate.map(({ story, slot }) => ({
    id: story.clusterId,
    title: story.title,
    url: story.url,
    ...(story.publisherSpoken ? { source: story.publisherSpoken } : {}),
    ...(story.descr ? { detail: story.descr.slice(0, 280) } : {}),
    slot,
    ...(story.light && slot === 'kicker' ? { light: true } : {}),
    ...(slot === 'city' ? { local: true } : {}),
  }));
}
