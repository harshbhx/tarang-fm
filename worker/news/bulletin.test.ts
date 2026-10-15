import { describe, expect, it } from 'vitest';
import { cadence, pickBulletin, scoreStory, slateSources, TOPIC_COOLDOWN_MS, type PickOptions } from './bulletin';
import { cityKeyOf, coreFeeds, localFeeds, spokenPublisher, stateCodeOf } from './catalog';
import { consumed, localDecision, requestDecision, stationDecision, topupDecision } from './policy';
import type { Bucket, Story } from './types';

const NOW = Date.parse('2026-10-15T09:00:00Z');
const H = 3_600_000;
let n = 0;

function story(bucket: Bucket, over: Partial<Story> = {}): Story {
  n++;
  return {
    clusterId: `c${n}`,
    topicId: `t${n}`,
    itemId: `i${n}`,
    lang: 'hi',
    bucket,
    title: `खबर ${n} ${bucket}`,
    descr: 'एक साफ़ और लंबा विवरण जो चालीस अक्षरों से ज़्यादा है ताकि बोनस मिले।',
    url: `https://example.com/${n}`,
    publisherSpoken: 'दैनिक भास्कर',
    publishedAt: NOW - H,
    sources: 1,
    light: false,
    death: false,
    question: false,
    opinion: false,
    ...over,
  };
}

function pool(): Story[] {
  return [
    story('city', { city: 'vadodara', state: 'GJ', lang: 'gu', title: 'વડોદરામાં નવો બ્રિજ ખુલ્લો મુકાયો', publisherSpoken: 'दिव्य भास्कर' }),
    story('city', { city: 'vadodara', state: 'GJ', title: 'वडोदरा में स्मार्ट मीटर का काम शुरू' }),
    story('state', { state: 'GJ', title: 'गुजरात में नई सौर नीति लागू' }),
    story('state', { state: 'GJ', title: 'गुजरात के किसानों को मुआवज़ा' }),
    story('national', { sources: 3 }),
    story('national'),
    story('national'),
    story('national'),
    story('world'),
    story('world'),
    story('sports'),
    story('business'),
    story('entertainment'),
    story('science', { light: true, title: 'इसरो ने छात्रों के बनाए उपग्रह का परीक्षण किया' }),
  ];
}

const base = (over: Partial<PickOptions> = {}): PickOptions => ({
  station: 'hi',
  mode: 'full',
  city: 'vadodara',
  state: 'GJ',
  sessionAired: new Set(),
  now: NOW,
  rotation: 0,
  kicker: true,
  ...over,
});

describe('pickBulletin', () => {
  it('fills a full bulletin in AIR order: city, state, 2 national, world, rotating category, kicker', () => {
    const slate = pickBulletin(pool(), base());
    expect(slate.map((s) => s.slot)).toEqual(['city', 'state', 'national', 'national', 'world', 'sport', 'kicker']);
    expect(slate[0].story.city).toBe('vadodara');
    expect(slate[1].story.state).toBe('GJ');
    // the multi-source national story leads the national block
    expect(slate[2].story.sources).toBe(3);
  });

  it('never repeats a story or its topic within a session, across consecutive bulletins', () => {
    const stories = pool();
    const aired = new Set<string>();
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const slate = pickBulletin(stories, base({ sessionAired: aired, mode: i === 1 ? 'update' : 'full', rotation: i }));
      for (const s of slate) {
        expect(seen).not.toContain(s.story.clusterId);
        seen.push(s.story.clusterId);
        aired.add(s.story.clusterId);
      }
    }
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('never re-airs a story that was merged with another after the session heard it', () => {
    const stories = pool();
    const merged = stories[4];
    // The session heard the story under the id of an item that later joined this cluster
    merged.memberIds = [merged.itemId, 'old-cluster-id'];
    const slate = pickBulletin(stories, base({ sessionAired: new Set(['old-cluster-id']) }));
    expect(slate.map((s) => s.story.clusterId)).not.toContain(merged.clusterId);
  });
  it('rotates the category slot and skips an empty category', () => {
    expect(pickBulletin(pool(), base({ rotation: 1 })).find((s) => ['sport', 'business', 'entertainment'].includes(s.slot))?.slot).toBe('business');
    const noBusiness = pool().filter((s) => s.bucket !== 'business');
    expect(pickBulletin(noBusiness, base({ rotation: 1 })).find((s) => ['sport', 'business', 'entertainment'].includes(s.slot))?.slot).toBe('entertainment');
  });

  it('falls back: no city story → a second state story; no state → an extra national', () => {
    const noCity = pool().filter((s) => s.bucket !== 'city');
    expect(pickBulletin(noCity, base()).map((s) => s.slot).slice(0, 2)).toEqual(['state', 'state']);
    const noLocal = pool().filter((s) => s.bucket !== 'city' && s.bucket !== 'state');
    expect(pickBulletin(noLocal, base()).filter((s) => s.slot === 'national')).toHaveLength(3);
  });

  it('promotes a national story that names the listener city into the city slot', () => {
    const stories = pool().filter((s) => s.bucket !== 'city');
    stories.push(story('national', { title: 'वडोदरा में एयरशो की तैयारी पूरी' }));
    expect(pickBulletin(stories, base())[0]).toMatchObject({ slot: 'city', story: { title: 'वडोदरा में एयरशो की तैयारी पूरी' } });
  });

  it('allows one death story, never as the lead, and drops the kicker when it would follow heavy news', () => {
    const stories = pool().map((s) => (s.bucket === 'city' ? { ...s, death: true } : s));
    stories.push(story('national', { death: true, sources: 4 }));
    const slate = pickBulletin(stories, base());
    expect(slate[0].story.death).toBe(false);
    expect(slate.filter((s) => s.story.death)).toHaveLength(1);
    expect(slate.some((s) => s.slot === 'kicker')).toBe(false);
  });

  it('holds back a topic the station aired in the last hour, and prefers stories the station has not aired', () => {
    const stories = pool();
    const nat = stories.filter((s) => s.bucket === 'national');
    nat[0].topicAiredAt = NOW - TOPIC_COOLDOWN_MS / 2;
    nat[1].stationAiredAt = NOW - H;
    const picked = pickBulletin(stories, base()).map((s) => s.story.clusterId);
    expect(picked).not.toContain(nat[0].clusterId);
    expect(picked).not.toContain(nat[1].clusterId);
    expect(scoreStory(nat[1], NOW, 'hi')).toBeLessThan(scoreStory(nat[2], NOW, 'hi'));
  });

  it('builds a short update: local, national, then world or a category', () => {
    const slate = pickBulletin(pool(), base({ mode: 'update' }));
    expect(slate.map((s) => s.slot)).toEqual(['city', 'national', 'world']);
  });

  it('turns the slate into newsreader sources with story ids', () => {
    const sources = slateSources(pickBulletin(pool(), base()));
    expect(sources[0]).toMatchObject({ slot: 'city', local: true, source: 'दैनिक भास्कर' }); // the station-language city story wins
    expect(sources.every((s) => s.id?.startsWith('c'))).toBe(true);
    expect(sources.at(-1)).toMatchObject({ slot: 'kicker', light: true });
  });

  it('changes rotation and kicker cadence every 15 minutes', () => {
    const a = cadence(NOW);
    const b = cadence(NOW + 15 * 60_000);
    expect(a.rotation).not.toBe(b.rotation);
    expect(a.kicker).not.toBe(b.kicker);
  });
});

describe('catalog', () => {
  it('resolves states and cities from the edge', () => {
    expect(stateCodeOf('GJ')).toBe('GJ');
    expect(stateCodeOf(undefined, 'Gujarat')).toBe('GJ');
    expect(stateCodeOf(undefined, 'National Capital Territory of Delhi')).toBe('DL');
    expect(cityKeyOf('Baroda')).toBe('vadodara');
    expect(cityKeyOf('Pune District')).toBe('pune');
  });
  it('fills the Hindi hole from the state press, in the right order', () => {
    const feeds = localFeeds('hi', 'GJ', 'vadodara');
    const ids = feeds.map((f) => f.id);
    expect(ids).toContain('bing-hi-state-GJ');
    expect(ids).toContain('bing-hi-city-vadodara');
    expect(feeds.some((f) => f.lang === 'gu' && f.bucket === 'city' && f.url.includes('6322'))).toBe(true);
    expect(feeds.some((f) => f.lang === 'gu' && f.bucket === 'state')).toBe(true);
    // A Gujarati station listener in Gujarat needs no state fetch (home state is in the core refresh)
    expect(localFeeds('gu', 'GJ', 'vadodara').every((f) => f.bucket === 'city')).toBe(true);
  });
  it('never sends a rejected feed and never asks for application/rss+xml', () => {
    const all = (['hi', 'mr', 'ta', 'bn', 'gu'] as const).flatMap((s) => coreFeeds(s, 'refresh'));
    expect(all.some((f) => /news\.google|feedburner|ddnews|newsonair|category-7453/.test(f.url))).toBe(false);
    expect(coreFeeds('gu', 'refresh').some((f) => f.id === 'bing-gu-state-GJ')).toBe(true);
  });
  it('names publishers natively, across languages', () => {
    expect(spokenPublisher('divyabhaskar', 'gu', 'gu')).toBe('દિવ્ય ભાસ્કર');
    expect(spokenPublisher('divyabhaskar', 'hi', 'gu')).toBe('दिव्य भास्कर');
    expect(spokenPublisher('bing', 'hi', 'hi')).toBeUndefined();
  });
});

describe('refresh policy', () => {
  const row = (over = {}) => ({ refreshedAt: NOW - 3 * H, unairedAtRefresh: 100, airedSince: 0, servedSince: 0, ...over });
  it('refreshes a station only when its pool was consumed', () => {
    expect(stationDecision(undefined, NOW).run).toBe(false);
    expect(stationDecision(row({ refreshedAt: NOW - H, airedSince: 90, servedSince: 9 }), NOW).run).toBe(false); // under 2 h
    expect(stationDecision(row(), NOW).run).toBe(false); // nobody listened
    expect(stationDecision(row({ airedSince: 30, servedSince: 5 }), NOW).run).toBe(false); // 30 % aired
    expect(stationDecision(row({ airedSince: 50, servedSince: 8 }), NOW).run).toBe(true); // 50 %
    expect(stationDecision(row({ refreshedAt: NOW - 4.5 * H, airedSince: 25, servedSince: 4 }), NOW).run).toBe(true); // stale, 25 %
  });
  it('measures consumption against the 3 h working pool, not the whole 24 h supply', () => {
    // Hindi holds 500+ stories: 48 aired (2 h of bulletins) is half the working pool
    expect(consumed({ airedSince: 48, unairedAtRefresh: 544 })).toBeGreaterThanOrEqual(0.5);
    expect(stationDecision(row({ unairedAtRefresh: 544, airedSince: 48, servedSince: 8 }), NOW).run).toBe(true);
    // A small pool is measured against itself
    expect(consumed({ airedSince: 20, unairedAtRefresh: 40 })).toBe(0.5);
  });
  it('refreshes on demand for a listener: when the scheduled rule would, or when the pool is 6 h old', () => {
    expect(requestDecision(undefined, NOW).run).toBe(false);
    expect(requestDecision(row({ refreshedAt: NOW - 3 * H, airedSince: 10, servedSince: 0 }), NOW).run).toBe(false);
    expect(requestDecision(row({ refreshedAt: NOW - 3 * H, airedSince: 50, servedSince: 0 }), NOW).run).toBe(true);
    expect(requestDecision(row({ refreshedAt: NOW - 7 * H }), NOW)).toEqual({ run: true, why: 'pool is 7 h old' });
    expect(requestDecision(row({ refreshedAt: NOW - H, airedSince: 90 }), NOW).run).toBe(false);
  });
  it('tops up a low pool once per hour', () => {
    const ok = { national: 20, state: 5, total: 60 };
    expect(topupDecision(ok, null, NOW, true).run).toBe(false);
    expect(topupDecision({ ...ok, national: 3 }, null, NOW, true).run).toBe(true);
    expect(topupDecision({ ...ok, state: 1 }, null, NOW, true).run).toBe(true);
    expect(topupDecision({ ...ok, state: 1 }, null, NOW, false).run).toBe(false);
    expect(topupDecision({ national: 3, total: 3 }, NOW - 30 * 60_000, NOW, false).run).toBe(false);
  });
  it('fetches a city pool on first sight, reuses it, and refreshes it once mostly aired', () => {
    expect(localDecision(undefined, NOW)).toBe('fetch-now');
    expect(localDecision(row({ refreshedAt: NOW - H }), NOW)).toBe('reuse');
    expect(localDecision(row({ refreshedAt: NOW - 2.5 * H, airedSince: 70, servedSince: 6 }), NOW)).toBe('refresh');
    expect(localDecision(row({ refreshedAt: NOW - 5 * H }), NOW)).toBe('fetch-now');
  });
});
