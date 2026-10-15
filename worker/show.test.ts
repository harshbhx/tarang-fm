import { describe, expect, it } from 'vitest';
import { getStation } from '../shared/stations';
import { applyGaps, dropOrphanKicker, toLine } from './segment';
import { gapAfter, hindiTimePhrase, localPackFor, maxPcmBytes, occasionFor, timePhrase, voiceFor } from './show';
import { validateScript } from './validate';

describe('hindiTimePhrase (prompt pack §11)', () => {
  it('says time the way people do', () => {
    expect(hindiTimePhrase(18, 10)).toBe('शाम के सवा छह');
    expect(hindiTimePhrase(18, 30)).toBe('शाम के साढ़े छह');
    expect(hindiTimePhrase(18, 45)).toBe('शाम के पौने सात');
    expect(hindiTimePhrase(13, 30)).toBe('दोपहर के डेढ़');
    expect(hindiTimePhrase(14, 30)).toBe('दोपहर के ढाई');
    expect(hindiTimePhrase(9, 2)).toBe('सुबह के नौ बजे');
    expect(hindiTimePhrase(23, 55)).toBe('रात के बारह बजने वाले');
  });

  it('is used on the Hindi station only', () => {
    expect(timePhrase(getStation('hi'), { localTime: '18:10', daypart: 'evening' })).toBe('शाम के सवा छह');
    expect(timePhrase(getStation('ta'), { localTime: '18:10', daypart: 'evening' })).toMatch(/^6:15 in the evening/);
  });
});

describe('occasionFor', () => {
  it('greets Navratri without announcing a day number', () => {
    const navratri = occasionFor('2026-10-14', 'Gujarat');
    expect(navratri).toContain('Navratri');
    expect(navratri).toContain('garba');
    expect(navratri).not.toMatch(/day \d/);
    expect(occasionFor('2026-10-20')).toContain('Dussehra');
    expect(occasionFor('2026-11-02')).toBeNull();
    expect(occasionFor(undefined)).toBeNull();
  });
});

describe('local packs', () => {
  it('finds curated cities by name or old name', () => {
    expect(localPackFor('Vadodara')?.cityHi).toBe('बड़ौदा');
    expect(localPackFor('Baroda')?.cityHi).toBe('बड़ौदा');
    expect(localPackFor('Atlantis')).toBeUndefined();
  });
});

describe('delivery', () => {
  const sunny = getStation('hi').cast.rj;

  it('shapes the voice and stays inside the API ranges', () => {
    const shout = voiceFor(sunny, 'shout');
    expect(shout.loudness).toBe(1.6);
    expect(shout.pace).toBeGreaterThan(sunny.pace);
    const hushed = voiceFor(sunny, 'hushed');
    expect(hushed.loudness).toBe(0.6);
    expect(voiceFor({ ...sunny, pace: 1.9 }, 'fast').pace).toBe(2);
  });

  it('applies the gap rules', () => {
    expect(gapAfter('news', 'sad', false)).toBe(300);
    expect(gapAfter('kahani', 'dramatic', true)).toBe(120);
    const ad = gapAfter('ad_break', 'normal', false, () => 0.5);
    expect(ad).toBe(170);
    const pair = [toLine(getStation('hi'), 'narrator', 'एक', 'kahani', { delivery: 'dramatic' }), toLine(getStation('hi'), 'narrator', 'दो', 'kahani')];
    const split = applyGaps(pair, 'kahani', () => 0.5, [false, true]);
    expect(split[0].pauseAfterMs).toBe(120);
    expect(split[1].pauseAfterMs).toBe(400);
    const separate = applyGaps(pair, 'kahani', () => 0.5, [false, false]);
    expect(separate[0].pauseAfterMs).toBe(700);
  });
});

describe('validators', () => {
  const hi = getStation('hi');

  it('rejects romanized Hindi, banned phrases and a missing {name} greeting', () => {
    expect(validateScript(hi, 'rj_link', [{ role: 'rj', text: 'aap sun rahe hain Tarang FM' }])).not.toHaveLength(0);
    expect(validateScript(hi, 'rj_link', [{ role: 'rj', text: 'चलिए जानते हैं आज का मौसम।' }])).not.toHaveLength(0);
    expect(validateScript(hi, 'rj_link', [{ role: 'rj', text: 'नमस्ते बड़ौदा!' }], { greet: true, listenerName: 'Harsh' })).not.toHaveLength(0);
    expect(validateScript(hi, 'rj_link', [{ role: 'rj', text: 'नमस्ते {name}, scooter फिर से रूठ गया।' }], { greet: true, listenerName: 'Harsh' })).toHaveLength(0);
  });

  it('rejects copied example lines and clock digits in RJ links', () => {
    expect(validateScript(hi, 'rj_link', [{ role: 'rj', text: 'आगे की कहानी में एक दरवाज़ा है, जो सिर्फ़ रात को खुलता है।' }])).not.toHaveLength(0);
    expect(validateScript(hi, 'rj_link', [{ role: 'rj', text: 'शाम के 6:15 हो रहे हैं।' }])).not.toHaveLength(0);
    expect(validateScript(hi, 'rj_link', [{ role: 'rj', text: 'शाम के सवा छह, और बड़ौदा में गरबा की तैयारी ज़ोरों पर।' }])).toHaveLength(0);
  });

  it('flags news numbers that are not in the input', () => {
    const lines = [{ role: 'news', text: 'वडोदरा में 157 पद खाली हैं।' }, { role: 'news', text: 'बोनस 5000 रुपये का होगा।' }];
    const problems = validateScript(hi, 'news', lines, { headlinesText: 'फायर विभाग में 157 पद खाली', timePhrase: 'शाम के सवा छह' });
    expect(problems).toEqual(['news number not in input: 5000']);
  });
});

describe('dropOrphanKicker', () => {
  it('removes a kicker intro with no story after it', () => {
    const lines = [{ text: 'खबर एक।' }, { text: 'और आखिर में, एक अच्छी खबर।' }, { text: 'ये थीं अभी तक की खबरें।' }];
    expect(dropOrphanKicker(lines).map((l) => l.text)).toEqual(['खबर एक।', 'ये थीं अभी तक की खबरें।']);
    const withStory = [{ text: 'और आखिर में, एक अच्छी खबर।' }, { text: 'गरबा में रिकॉर्ड भीड़।' }, { text: 'ये थीं अभी तक की खबरें।' }];
    expect(dropOrphanKicker(withStory)).toHaveLength(3);
    // The cue and the story on one line, right before the sign-off: that is the kicker, not an orphan
    const oneLine = [{ text: 'खबर एक।' }, { text: 'और आख़िर में, एक अच्छी खबर: इसरो ने छात्रों के उपग्रह का परीक्षण किया।' }, { text: 'ये थीं अभी तक की खबरें।' }];
    expect(dropOrphanKicker(oneLine)).toHaveLength(3);
  });
});

describe('run-on guard', () => {
  it('allows about twice the expected length of a line', () => {
    const bytes = maxPcmBytes('अरे बाप रे! आज तो बड़ौदा में 35 डिग्री है, मतलब scooter की seat पे बैठना अब adventure sport है।', 1);
    const seconds = bytes / 48000;
    expect(seconds).toBeGreaterThan(9);
    expect(seconds).toBeLessThan(16);
  });
});
