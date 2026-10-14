import { describe, expect, it } from 'vitest';
import type { SegmentRequest } from '../shared/schemas';
import { STATION_BY_ID } from '../shared/stations';
import type { Station } from '../shared/types';
import { segmentMessages } from './prompts';
import { AD_FORMATS, adBrief, sample, STORY_SETTINGS, storyBrief } from './story';
import { storyProblems } from './validate';

/** Deterministic random numbers for repeatable tests. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hindi = STATION_BY_ID.hi as Station;
const req = (patch: Partial<SegmentRequest> = {}): SegmentRequest => ({
  station: 'hi',
  type: 'kahani',
  listener: { localTime: '22:15', daypart: 'night' },
  ...patch,
});

describe('story briefs', () => {
  it('almost never repeats a premise across a long night of listening', () => {
    const random = seeded(7);
    const premises = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const b = storyBrief('hi', 'night', random);
      premises.add(`${b.genre}|${b.setting}|${b.hook}|${b.twist}`);
    }
    expect(premises.size).toBeGreaterThanOrEqual(198);
  });

  it("leans on the station's own region but also travels", () => {
    const random = seeded(11);
    const settings = Array.from({ length: 300 }, () => storyBrief('ta', 'evening', random).setting);
    const local = settings.filter((s) => STORY_SETTINGS.ta.includes(s)).length;
    expect(local / settings.length).toBeGreaterThan(0.55);
    expect(settings.some((s) => STORY_SETTINGS.any.includes(s))).toBe(true);
  });

  it('offers distinct, regional character names for both genders', () => {
    const b = storyBrief('bn', 'morning', seeded(3));
    expect(new Set(b.names.masculine).size).toBe(4);
    expect(new Set(b.names.feminine).size).toBe(4);
    expect(b.names.feminine.every((n) => ['Mishti', 'Ishani', 'Tithi', 'Rupsha', 'Moumita', 'Poulami', 'Didima', 'Tumpa', 'Srabanti', 'Chumki'].includes(n))).toBe(true);
  });

  it('samples without repeats', () => {
    expect(new Set(sample([1, 2, 3, 4, 5], 5, seeded(1))).size).toBe(5);
    expect(sample([1, 2], 5, seeded(1))).toHaveLength(2);
  });
});

describe('Kahani prompt', () => {
  const prompt = (r: SegmentRequest) => segmentMessages(hindi, 'kahani', r)[1].content;

  it('carries a full brief and no stock example scene', () => {
    const p = prompt(req());
    for (const part of ['Genre:', 'Where:', 'At the centre:', "How it's told:", 'Twist type:', 'Character names']) expect(p).toContain(part);
    expect(p).not.toContain('हवेली की पुरानी घड़ी');
    expect(p).not.toContain('सीढ़ियों पे कोई है');
    expect(p).toContain('एक बार की बात है'); // listed as banned
  });

  it("puts a caller's theme first and lists tonight's earlier stories", () => {
    const p = prompt(req({ theme: 'भूतिया ट्रेन', recentStories: ['The Dented Tiffin, Mumbai local: the thief was returning it'] }));
    expect(p).toContain('A listener asked for: "भूतिया ट्रेन"');
    expect(p).toContain('- The Dented Tiffin, Mumbai local: the thief was returning it');
  });

  it('gives ads a format of their own', () => {
    const formats = new Set(Array.from({ length: 80 }, (_, i) => adBrief(seeded(i)).format.id));
    expect(formats.size).toBe(AD_FORMATS.length);
    const p = segmentMessages(hindi, 'ad_break', { ...req(), type: 'ad_break' })[1].content;
    expect(p).toMatch(/Format: [a-z-]+/);
  });
});

describe('story quality gate', () => {
  const line = (role: string, text: string) => ({ role, text });

  it('passes a real radio play', () => {
    const play = [
      line('narrator', 'तरंग कहानी… आज की कहानी: टिफ़िन का राज़।'),
      line('char_a', 'मेहर, ये टिफ़िन फिर मेरी डेस्क पर कैसे?'),
      line('char_b', 'कबीर, मुझे क्या पता, मैं तो अभी आई हूँ।'),
      line('char_kid', 'दीदी, इसमें आलू पराठे हैं!'),
      line('narrator', 'और तभी शटर खड़का।'),
    ];
    expect(storyProblems(hindi, play)).toEqual([]);
  });

  it('rejects a narrated summary, a one-character story and stock phrases', () => {
    const narrated = [
      line('narrator', 'एक बार की बात है, एक गाँव था।'),
      ...Array.from({ length: 7 }, () => line('narrator', 'फिर कुछ हुआ।')),
      line('char_a', 'अरे!'),
    ];
    const problems = storyProblems(hindi, narrated);
    expect(problems.some((p) => p.includes('mostly narration'))).toBe(true);
    expect(problems.some((p) => p.includes('two speaking characters'))).toBe(true);
    expect(problems.some((p) => p.includes('stock story phrase'))).toBe(true);
  });
});
