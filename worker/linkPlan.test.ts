import { describe, expect, it } from 'vitest';
import type { Fact, FactPacket } from './facts';
import { rjLinkChecks } from './checks/rj';
import { chooseLinkPayload, emptyLinkState, linkModeOf } from './linkPlan';
import type { SegmentRequest } from '../shared/schemas';

const NOW = Date.parse('2026-10-15T14:45:00Z');
const fact = (over: Partial<Fact>): Fact => ({ id: 'x', type: 'city_fact', priority: 20, claimEn: 'c', keptTokens: [], angleEn: 'a', expiresAt: NOW + 3_600_000, source: 's', ...over });
const packet = (facts: Fact[]): FactPacket => ({ v: 1, builtAt: NOW, station: 'hi', today: { date: '2026-10-15', time: '20:15', weekday: 4, hour: 20 }, place: {}, opener: { facts: [] }, facts, sources: { weather: false, air: false, alerts: false } });
const fixed = (v: number) => () => v;

describe('chooseLinkPayload', () => {
  it('opens with the time and weather once, and greets', () => {
    const r = chooseLinkPayload({ mode: 'opener', station: 'hi', now: NOW, packet: packet([fact({ id: 'fest:navratri:ongoing:2026-10-15', type: 'festival', priority: 73 })]) });
    expect(r.payload.type).toBe('opener');
    expect(r.payload.greet).toBe(true);
    expect(r.nextLinkState.lastWeatherAt).toBe(NOW);
    expect(r.nextLinkState.lastFestivalAt).toBe(NOW);
  });

  it('answers an open question in the next link, and only after light segments', () => {
    const state = { ...emptyLinkState(), lastTypes: ['question'], openQuestion: 'चाय या कॉफ़ी?' };
    const light = chooseLinkPayload({ mode: 'kahani_out', station: 'hi', linkState: state, now: NOW });
    expect(light.payload.type).toBe('question_answer');
    expect(light.nextLinkState.openQuestion).toBeUndefined();
    const heavy = chooseLinkPayload({ mode: 'payload', station: 'hi', linkState: state, mood: 'heavy', now: NOW, packet: packet([fact({ id: 'city:vad-01' })]) });
    expect(heavy.payload).toMatchObject({ type: 'fact', tone: 'calm', catchphrase: false });
    expect(heavy.nextLinkState.openQuestion).toBe('चाय या कॉफ़ी?');
  });

  it('a question sets the open question and is never asked twice', () => {
    const r = chooseLinkPayload({ mode: 'payload', station: 'hi', linkState: { ...emptyLinkState(), lastTypes: ['hot_take'] }, now: NOW, random: fixed(0) });
    expect(r.payload.type).toBe('question');
    if (r.payload.type !== 'question') return;
    expect(r.nextLinkState.openQuestion).toBe(r.payload.item.text);
    expect(r.nextLinkState.usedFactIds).toContain(`q:${r.payload.item.id}`);
  });

  it('never repeats the last kind, and moves a running bit forward', () => {
    const state = { ...emptyLinkState(), lastTypes: ['question_answer'], bitEpisodes: { bijli: 2 } };
    for (let i = 0; i < 20; i++) {
      const r = chooseLinkPayload({ mode: 'payload', station: 'hi', rjKey: 'sunny', linkState: { ...state, lastTypes: ['running_bit'] }, now: NOW, random: () => (i + 0.5) / 20 });
      expect(r.payload.type).not.toBe('running_bit');
    }
    const bit = chooseLinkPayload({ mode: 'payload', station: 'hi', rjKey: 'sunny', linkState: { ...state, lastTypes: ['question', 'hot_take'] }, now: NOW, random: fixed(0.55) });
    if (bit.payload.type === 'running_bit') {
      expect(bit.payload.episode).toBe(bit.payload.bit.id === 'bijli' ? 2 : 0);
      expect(bit.nextLinkState.bitEpisodes[bit.payload.bit.id]).toBe(bit.payload.episode + 1);
    }
  });

  it('puts urgent weather first, then rests it for 30 minutes', () => {
    const rain = fact({ id: 'wx:rain_soon', type: 'weather_notable', priority: 90 });
    const r = chooseLinkPayload({ mode: 'payload', station: 'hi', now: NOW, packet: packet([rain]), linkState: { ...emptyLinkState(), lastTypes: ['opener'] } });
    expect(r.payload).toMatchObject({ type: 'fact' });
    const again = chooseLinkPayload({ mode: 'payload', station: 'hi', now: NOW + 60_000, packet: packet([{ ...rain, id: 'wx:rain_soon:2' }]), linkState: r.nextLinkState });
    expect(again.payload.type === 'fact' && again.payload.fact.type === 'weather_notable').toBe(false);
  });

  it('studio calls override the rotation, except before a story', () => {
    expect(chooseLinkPayload({ mode: 'payload', station: 'gu', calls: 1, now: NOW }).payload.type).toBe('studio_calls');
    expect(chooseLinkPayload({ mode: 'kahani_in', station: 'gu', calls: 1, now: NOW }).payload.type).toBe('kahani_tease');
  });
});

describe('linkModeOf', () => {
  const base = { station: 'hi', type: 'rj_link', listener: { localTime: '20:15', daypart: 'evening' } } as SegmentRequest;
  it('works out the mode for clients on the old clock', () => {
    expect(linkModeOf(base)).toBe('opener');
    expect(linkModeOf({ ...base, showLog: [{ type: 'rj_link', summary: 'hi' }], upNext: 'kahani' })).toBe('kahani_in');
    expect(linkModeOf({ ...base, showLog: [{ type: 'rj_link', summary: 'hi' }, { type: 'kahani', summary: 's' }], upNext: 'ad_break' })).toBe('kahani_out');
    expect(linkModeOf({ ...base, mode: 'payload' })).toBe('payload');
  });
});

describe('rjLinkChecks', () => {
  const ctx = { station: 'hi' as const, mode: 'payload' as const, payloadType: 'hot_take' as const, factText: 'नाश्ते का असली राजा: पोहा या उपमा', nextAllowed: 'label only: the news is next, read by सिमरन.', nextType: 'news', kept: [], frame: ['तरंग FM 91.1', 'सिमरन', 'सनी', 'मम्मी'], showLog: [], nowPhrase: 'रात के सवा आठ', calls: 0, catchphrase: { text: 'तरंग पे रहिए, तरंग में रहिए!', allowed: false } };
  it('fails the old failures: time outside the opener, an invented place in the handover, fillers', () => {
    const r = rjLinkChecks(
      [
        { role: 'rj', text: 'अरे यार, रात के सवा आठ, 27 डिग्री।' },
        { role: 'rj', text: 'मेरा साफ़ मानना है, पोहा ही राजा है, उपमा तो बस मेहमान है।' },
        { role: 'rj', text: 'अभी खबरों में सुनिए Alkapuri के नए flyover के बारे में।' },
        { role: 'rj', text: 'तरंग पे रहिए, तरंग में रहिए!' },
      ],
      ctx,
    );
    expect(r.pass).toBe(false);
    expect(r.hard.join(' ')).toMatch(/time or the weather/);
    expect(r.hard.join(' ')).toMatch(/Alkapuri/);
    expect(r.hard.join(' ')).toMatch(/opens on a filler/);
    expect(r.dropLines).toEqual(expect.arrayContaining([0, 3]));
  });
  it('passes an honest link', () => {
    const r = rjLinkChecks(
      [
        { role: 'rj', text: 'नाश्ते का असली राजा कौन, पोहा या उपमा?' },
        { role: 'rj', text: 'मेरा फ़ैसला पोहा, क्योंकि उपमा खाते वक़्त मम्मी हमेशा पूछती हैं कि ये क्या बना दिया।' },
        { role: 'rj', text: 'अब खबरें, सिमरन के साथ।' },
      ],
      ctx,
    );
    expect(r.hard).toEqual([]);
  });
});
