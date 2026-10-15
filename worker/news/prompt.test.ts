import { describe, expect, it } from 'vitest';
import type { SegmentRequest } from '../../shared/schemas';
import { STATION_BY_ID } from '../../shared/stations';
import type { Source } from '../../shared/types';
import { newsFrameText, newsMessages } from '../prompts/news';

const req = (station: 'hi' | 'gu', mode?: 'full' | 'update'): SegmentRequest => ({
  station,
  type: 'news',
  listener: { name: 'Harsh', city: 'Vadodara', region: 'Gujarat', localTime: '20:15', daypart: 'evening' },
  showLog: [{ type: 'rj_link', summary: 'teases the upcoming news about the new Alkapuri flyover opening' }],
  ...(mode ? { mode } : {}),
});

const slate: Source[] = [
  { id: 'c1', title: 'વડોદરામાં નવો બ્રિજ ખુલ્લો મુકાયો', url: 'https://x/1', source: 'दिव्य भास्कर', detail: 'કોર્પોરેશને કહ્યું કે બ્રિજ પર રાત્રે 10 પછી ભારે વાહનો નહીં જાય', slot: 'city', local: true },
  { id: 'c2', title: 'गुजरात में नई सौर नीति लागू', url: 'https://x/2', slot: 'state' },
  { id: 'c3', title: 'संसद का शीतकालीन सत्र 1 दिसंबर से', url: 'https://x/3', source: 'बीबीसी हिंदी', slot: 'national' },
  { id: 'c4', title: 'इसरो ने छात्रों के बनाए उपग्रह का परीक्षण किया', url: 'https://x/4', source: 'अमर उजाला', slot: 'kicker', light: true },
];

describe('news prompt', () => {
  it('gives the newsreader only the slate: no show log, local pack, listener or occasion', () => {
    const [system, user] = newsMessages(STATION_BY_ID.hi, req('hi'), slate, false);
    const all = `${system.content}\n${user.content}`;
    expect(all).not.toMatch(/Alkapuri|PREVIOUSLY ON AIR|LOCAL PACK|OCCASION|Harsh|\{name\}/);
    expect(system.content).toContain('सिमरन');
  });

  it('renders each item with its native cue (the state by name) and attribution', () => {
    const [, user] = newsMessages(STATION_BY_ID.hi, req('hi'), slate, false);
    expect(user.content).toContain('cue="वडोदरा से:"');
    expect(user.content).toContain('cue="गुजरात से खबर:"');
    expect(user.content).toContain('attribution="दिव्य भास्कर के मुताबिक"');
    expect(user.content).toContain('attribution="स्थानीय मीडिया के मुताबिक"');
    expect(user.content).toContain('written in Gujarati: translate faithfully');
    expect(user.content).toContain('अब विस्तार से।');
    expect(user.content).toContain('MOOD HINT: kicker ok');
  });

  it('writes a short update with its own open and sign-off', () => {
    const [, user] = newsMessages(STATION_BY_ID.hi, req('hi', 'update'), slate.slice(0, 3), false);
    expect(user.content).toContain('BULLETIN: update');
    expect(user.content).toContain('बाकी खबरें अगले बुलेटिन में।');
  });

  it('localizes for Gujarati, with the renamed newsreader', () => {
    const [system, user] = newsMessages(STATION_BY_ID.gu, req('gu'), slate, false);
    expect(system.content).toContain('નીતા');
    expect(user.content).toContain('cue="વડોદરાથી સમાચાર:"');
    expect(user.content).toContain('cue="ગુજરાતથી સમાચાર:"');
    expect(user.content).toContain('હવે વિગતવાર સમાચાર.');
  });

  it('lets the frame (time, station, cues) through the fidelity check', () => {
    const frame = newsFrameText(STATION_BY_ID.hi, req('hi'));
    expect(frame).toContain('वडोदरा');
    expect(frame).toContain('गुजरात');
    expect(frame).toContain('20:15');
  });
});
