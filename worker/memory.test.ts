import { beforeEach, describe, expect, it } from 'vitest';
import type { SegmentRequest } from '../shared/schemas';
import { STATION_BY_ID } from '../shared/stations';
import type { Station } from '../shared/types';
import { clearMemoryCache, kvShowMemory, normalizeTitle, STORY_MEMORY, type MemoryStore, type StoryRecord } from './memory';
import type { Sarvam } from './sarvam';
import { planAd, planStory } from './fiction';
import { AD_PARODIES, AD_PROBLEMS } from './pools/ads';
import { buildSegment } from './segment';
import { STORY_HOOKS, STORY_SETTINGS, STORY_TWISTS } from './story';
import { Timings } from './timing';

const hindi = STATION_BY_ID.hi as Station;

/** An in-memory stand-in for Workers KV. */
function fakeKv() {
  const data = new Map<string, string>();
  const store: MemoryStore = {
    get: async (key) => (data.has(key) ? JSON.parse(data.get(key)!) : null),
    put: async (key, value) => {
      data.set(key, value);
    },
  };
  return { store, data };
}

/** Runs waitUntil work right away and lets the test await it. */
function waits() {
  const pending: Promise<unknown>[] = [];
  return { waitUntil: (p: Promise<unknown>) => pending.push(p), flush: () => Promise.all(pending) };
}

const record = (i: number, patch: Partial<StoryRecord> = {}): StoryRecord => ({
  at: new Date(2026, 9, 14, 12, i).toISOString(),
  title: `कहानी ${i}`,
  summary: `story ${i}`,
  setting: STORY_SETTINGS.hi[i % STORY_SETTINGS.hi.length],
  hook: STORY_HOOKS[i % STORY_HOOKS.length],
  twist: STORY_TWISTS[i % STORY_TWISTS.length],
  opening: 'cold-open',
  ...patch,
});

const req = (type: SegmentRequest['type']): SegmentRequest => ({ station: 'hi', type, listener: { localTime: '21:00', daypart: 'night' } });

beforeEach(() => clearMemoryCache());

describe('show memory', () => {
  it('remembers stories per station and keeps only the latest', async () => {
    const kv = fakeKv();
    const w = waits();
    const memory = kvShowMemory(kv.store, w.waitUntil)!;
    for (let i = 0; i < STORY_MEMORY + 5; i++) {
      memory.rememberStory('hi', record(i));
      await w.flush();
    }
    clearMemoryCache();
    const stories = await kvShowMemory(kv.store)!.recentStories('hi');
    expect(stories).toHaveLength(STORY_MEMORY);
    expect(stories[stories.length - 1].title).toBe(`कहानी ${STORY_MEMORY + 4}`);
    expect(await kvShowMemory(kv.store)!.recentStories('ta')).toEqual([]);
  });

  it('keeps working when KV fails', async () => {
    const broken: MemoryStore = { get: () => Promise.reject(new Error('down')), put: () => Promise.reject(new Error('down')) };
    const memory = kvShowMemory(broken)!;
    expect(await memory.recentStories('hi')).toEqual([]);
    expect(() => memory.rememberStory('hi', record(1))).not.toThrow();
  });

  it('normalizes titles so small differences still count as a repeat', () => {
    expect(normalizeTitle('टिफ़िन का राज़!')).toBe(normalizeTitle('टिफ़िन  का राज़'));
  });
});

describe('story plans from the memory', () => {
  it('steers clear of places, hooks and twists other listeners already heard', async () => {
    const kv = fakeKv();
    const used = Array.from({ length: 8 }, (_, i) => record(i));
    await kv.store.put('show:hi:stories', JSON.stringify(used));
    const memory = kvShowMemory(kv.store)!;
    for (let i = 0; i < 25; i++) {
      const story = await planStory(hindi, req('kahani'), memory);
      expect(used.map((r) => r.hook)).not.toContain(story.brief.hook);
      expect(used.map((r) => r.twist)).not.toContain(story.brief.twist);
      expect(story.aired!.length).toBe(8);
      expect(story.airedTitles!.has(normalizeTitle('कहानी 3'))).toBe(true);
    }
  });

  it('rewrites a story whose title already aired, then remembers the new one', async () => {
    const kv = fakeKv();
    await kv.store.put('show:hi:stories', JSON.stringify([record(1, { title: 'टिफ़िन का राज़' })]));
    const w = waits();
    const memory = kvShowMemory(kv.store, w.waitUntil)!;
    const titles = ['टिफ़िन का राज़', 'लोकल की आख़िरी सीट'];
    let chats = 0;
    const sarvam = {
      chatJson: async () => ({
        title: titles[chats++] ?? 'x',
        mood: 'light',
        summary_en: 'A new story',
        lines: [
          { role: 'narrator', text: 'दादर स्टेशन, रात 11:40 की लोकल।' },
          { role: 'char_a', text: 'मेहर, ये सीट किसकी है?' },
          { role: 'char_b', text: 'कबीर, रोज़ यहीं कोई बैठता है।' },
          { role: 'char_kid', text: 'दीदी, यहाँ एक पर्ची है!' },
          { role: 'char_a', text: 'पर्ची पे लिखा है, कल फिर।' },
          { role: 'char_b', text: 'ये तो पापा की लिखावट है।' },
          { role: 'char_kid', text: 'पापा तो गाँव गए हैं।' },
          { role: 'narrator', text: 'अगली रात, वही पर्ची फिर वहीं थी।' },
        ],
      }),
      transliterate: async (t: string) => t,
    } as unknown as Sarvam;
    const segment = await buildSegment(sarvam, hindi, req('kahani'), new Timings(), { memory });
    await w.flush();
    expect(chats).toBe(2);
    expect(segment.title).toBe('लोकल की आख़िरी सीट');
    clearMemoryCache();
    const stories = await kvShowMemory(kv.store)!.recentStories('hi');
    expect(stories.map((s) => s.title)).toEqual(['टिफ़िन का राज़', 'लोकल की आख़िरी सीट']);
    expect(stories[1].setting).toBeTruthy();
    expect(stories[1].opening).toBeTruthy();
  });

  it('never remembers a template fallback', async () => {
    const kv = fakeKv();
    const w = waits();
    const memory = kvShowMemory(kv.store, w.waitUntil)!;
    const sarvam = {
      chatJson: async () => {
        throw new Error('model down');
      },
      transliterate: async (t: string) => t,
    } as unknown as Sarvam;
    const segment = await buildSegment(sarvam, hindi, req('kahani'), new Timings(), { memory });
    await w.flush();
    expect(segment.fallback).toBe(true);
    expect(kv.data.size).toBe(0);
  });

  it('gives ads a format and a problem not used lately', async () => {
    const kv = fakeKv();
    // Year-round formats and problems, so the test holds in any month
    const formats = ['teleshopping', 'lab_coat_expert', 'mf_disclaimer'];
    const problems = ['guests_stay', 'remote_lost', 'family_forwards'];
    for (const id of formats) expect(AD_PARODIES.some((c) => c.id === id && !c.months)).toBe(true);
    for (const id of problems) expect(AD_PROBLEMS.some((p) => p.id === id && !p.months && !p.festival)).toBe(true);
    const recent = formats.map((format, i) => ({ at: '', title: `Ad ${i}`, category: problems[i], format }));
    await kv.store.put('show:hi:ads', JSON.stringify(recent));
    const memory = kvShowMemory(kv.store)!;
    for (let i = 0; i < 20; i++) {
      const ad = await planAd(hindi, req('ad_break'), memory);
      expect(formats).not.toContain(ad.card.id);
      expect(problems).not.toContain(ad.problem.id);
      expect(ad.problem.cards).toContain(ad.card.id);
      expect(ad.airedTitles!.has(normalizeTitle('Ad 1'))).toBe(true);
    }
  });
});
