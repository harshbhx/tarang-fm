import { describe, expect, it } from 'vitest';
import { copiedFragment, fillerReport, freeChecks, kinshipWords, leaksDirection, repeatedLines, saysTimeOrWeather, undefinedKinship, unsupportedTokens, type FreeContext, type FreeLine } from './free';
import { BASELINE, BROKEN, GOOD } from '../judge/calibration';
import { freeContextOf } from '../producer';

const rj = (text: string): FreeLine => ({ role: 'rj', text, delivery: 'normal' });
const HI: FreeContext = { station: 'hi', frame: ['तरंग FM 91.1', 'सनी', 'सिमरन', 'बड़ौदा', 'Vadodara'] };

describe('leaksDirection', () => {
  it('catches stage directions, labels, brackets and role names', () => {
    expect(leaksDirection('उनके shoes हैं PannaPani. delivery: hushed।')).toBe(true);
    expect(leaksDirection('delivery hushed, ये मेरा राज़ है।')).toBe(true);
    expect(leaksDirection('धीमी आवाज़ में: ये है मेरा राज़।')).toBe(true);
    expect(leaksDirection('(हँसते हुए) अरे वाह!')).toBe(true);
    expect(leaksDirection('narrator: रात के बारह बजे।')).toBe(true);
    expect(leaksDirection('मेहर: तुम कहाँ थे?')).toBe(true);
  });
  it('lets spoken lines and the fine print through', () => {
    expect(leaksDirection('रात के सवा आठ, आसमान एकदम साफ़।')).toBe(false);
    expect(leaksDirection('T&C: पंखा अलग से आता है।')).toBe(false);
  });
  it('reads the fine-print asterisk as fine print, but starred text as a direction', () => {
    expect(leaksDirection('*शर्तें लागू।')).toBe(false);
    expect(leaksDirection('90% तक छूट*! *सिर्फ़ बाएँ पैर के मोज़ों पर।')).toBe(false);
    expect(leaksDirection('*धीरे से* ये मेरा राज़ है।')).toBe(true);
    expect(leaksDirection('ये **बहुत** ज़रूरी है।')).toBe(true);
    expect(leaksDirection('ये * बहुत ज़रूरी है।')).toBe(true);
  });
});

describe('copiedFragment', () => {
  it('finds the old prompt example that aired word for word, across spelling variants', () => {
    expect(copiedFragment('उफ़्फ़, वो आख़िरी twist अभी तक दिमाग में घूम रहा है। सच में।')).toBeTruthy();
    expect(copiedFragment('उफ्फ, वो आखिरी twist अभी तक दिमाग में घूम रहा है।')).toBeTruthy();
    expect(copiedFragment('मेरा तो साफ़ मानना है कि पहले खाना।')).toBeUndefined();
  });
  it('guards extra fragments from the prompts', () => {
    expect(copiedFragment('ये पंखा हवा नहीं, यादें देता है।', ['पंखा हवा नहीं, यादें'])).toBeTruthy();
  });
});

describe('fillers', () => {
  it('counts fillers, an opening filler and a tag ending', () => {
    const f = fillerReport([rj('अरे यार, शो शुरू हो रहा है।'), rj('ये तो कमाल है, सच में।'), rj('बिल्कुल सही।')], 'hi');
    expect(f.total).toBe(4);
    expect(f.starts).toContain(0);
    expect(f.tags).toContain(1);
  });
  it('fails a segment over budget, and one that opens on a filler', () => {
    const r = freeChecks('rj_link', [rj('अरे, आज की बात।'), rj('मेरा मानना है कि शादी में पहले खाना आता है, फोटो बाद में।'), rj('बस एक छोटा सा break।')], { ...HI, mode: 'payload' });
    expect(r.pass).toBe(false);
    expect(r.hard.join(' ')).toMatch(/opens on a filler/);
  });
  it('uses each station\'s own list', () => {
    expect(fillerReport([rj('அட, இது என்ன?')], 'ta').starts).toEqual([0]);
    expect(fillerReport([rj('சரியான நேரம் இது.')], 'ta').total).toBe(0);
  });
});

describe('time and weather', () => {
  it('knows the time phrase and weather words per script', () => {
    expect(saysTimeOrWeather('रात के सवा आठ, 27 डिग्री।', 'hi')).toBe(true);
    expect(saysTimeOrWeather('இன்னைக்கு மாலை 8:15 மணி', 'ta')).toBe(true);
    expect(saysTimeOrWeather('मेरा सीधा हिसाब है: पहले खाना।', 'hi')).toBe(false);
  });
  it('hears the clock and the weather in every station language', () => {
    expect(saysTimeOrWeather('अभी सवा आठ बजे हैं।', 'hi')).toBe(true);
    expect(saysTimeOrWeather('साढ़े नौ हो गए, और मैं अभी भी यहीं हूँ।', 'hi')).toBe(true);
    expect(saysTimeOrWeather('घड़ी में आठ बजकर दस मिनट।', 'hi')).toBe(true);
    expect(saysTimeOrWeather('आज का मौसम एकदम सुहाना है।', 'hi')).toBe(true);
    expect(saysTimeOrWeather('मौसम बहुत ठंडा हो गया है।', 'hi')).toBe(true);
    expect(saysTimeOrWeather('रात्री सव्वा आठ वाजता भेटूया।', 'mr')).toBe(true);
    expect(saysTimeOrWeather('बाहेर २७ अंश आहे।', 'mr')).toBe(true);
    expect(saysTimeOrWeather('રાત્રે સવા આઠ વાગ્યે ગરબા શરૂ.', 'gu')).toBe(true);
    expect(saysTimeOrWeather('এখন রাত সাড়ে আটটা বাজে।', 'bn')).toBe(true);
    expect(saysTimeOrWeather('ராத்திரி எட்டு மணிக்கு சந்திப்போம்.', 'ta')).toBe(true);
    expect(saysTimeOrWeather('வானிலை இன்னிக்கு அருமை.', 'ta')).toBe(true);
  });
  it('does not mistake a season, a price, a count or a ringing bell for the time or the weather', () => {
    expect(saysTimeOrWeather('शादियों का मौसम आ गया, और मेरा suit अभी भी tight है।', 'hi')).toBe(false);
    expect(saysTimeOrWeather('त्योहारों के मौसम में मिठाई का हिसाब कौन रखता है?', 'hi')).toBe(false);
    expect(saysTimeOrWeather('साढ़े तीन सौ रुपये का एक समोसा? भाई, ये तो लूट है।', 'hi')).toBe(false);
    expect(saysTimeOrWeather('सवा लाख की बात है, सवा सौ लोग आए।', 'hi')).toBe(false);
    expect(saysTimeOrWeather('साढ़े तीन घंटे की meeting, और नतीजा एक coffee।', 'hi')).toBe(false);
    expect(saysTimeOrWeather('जब भी फ़ोन की घंटी बजे, समझ जाइए कि मम्मी हैं।', 'hi')).toBe(false);
    expect(saysTimeOrWeather('साडे तीनशे रुपये फक्त।', 'mr')).toBe(false);
    expect(saysTimeOrWeather('সাড়ে তিনশো টাকা দিয়ে দুটো বই কিনলাম।', 'bn')).toBe(false);
    expect(saysTimeOrWeather('சைக்கிள் மணி சத்தம் கேட்டுச்சு.', 'ta')).toBe(false);
    expect(saysTimeOrWeather('સાડા ત્રણસો રૂપિયાની ચા?', 'gu')).toBe(false);
  });
  it('fails a non-opener link that gives the time or weather, but not the opener', () => {
    const lines = [rj('रात के सवा आठ, आसमान साफ़ है।'), rj('मेरा सीधा हिसाब है: शादी में पहले खाना, फोटो बाद में।'), rj('बस एक छोटा सा break।')];
    const ctx = { ...HI, factText: 'रात के सवा आठ साफ़ आसमान', timePhrase: 'रात के सवा आठ' };
    expect(freeChecks('rj_link', lines, { ...ctx, mode: 'payload' }).hard.join(' ')).toMatch(/time or the weather/);
    expect(freeChecks('rj_link', lines, { ...ctx, mode: 'opener' }).hard.join(' ')).not.toMatch(/time or the weather/);
  });
});

describe('invented names and numbers', () => {
  it('flags a Latin place and a native-script landmark the context never gave', () => {
    const u = unsupportedTokens([rj('अभी देखिए, खबर में बात होगी Alkapuri के नए flyover opening की।'), rj('இப்போ லக்ஷ்மி விலாஸ் பேலஸ் பக்கத்துல traffic')], { ...HI, factText: 'news label only' });
    expect(u.map((x) => x.token)).toEqual(expect.arrayContaining(['Alkapuri', 'லக்ஷ்மி விலாஸ்']));
    expect(u.filter((x) => x.token === 'Alkapuri')).toHaveLength(1);
  });
  it('allows what the context gives, in any case', () => {
    const u = unsupportedTokens([rj('Garba की रात है, 27 डिग्री।')], { ...HI, factText: 'Navratri: garba nights · 27 डिग्री' });
    expect(u).toEqual([]);
  });
  it('drops an invented news line and fails the bulletin only when too few lines are left', () => {
    const news = (t: string): FreeLine => ({ role: 'news', text: t });
    const lines = [news('रात के सवा आठ की खबरें, तरंग FM 91.1 पर।'), news('देश में: ISRO ने नया उपग्रह छोड़ा।'), news('Alkapuri flyover की opening की खबर भी आ रही है।'), news('दुनिया में: जापान में नई ट्रेन।'), news('ये थीं खबरें।')];
    const r = freeChecks('news', lines, { ...HI, mode: 'update', factText: 'ISRO ने नया उपग्रह छोड़ा जापान में नई ट्रेन', timePhrase: 'रात के सवा आठ' });
    expect(r.dropLines).toEqual([2]);
    expect(r.pass).toBe(true);
  });
  it('fails a handover that describes what is next', () => {
    const r = freeChecks('rj_link', [rj('मेरा सीधा हिसाब है: शादी में पहले खाना, फोटो बाद में, क्योंकि photographer भूखा नहीं रहता।'), rj('पिछले महीने मैंने गलती की।'), rj('break के बाद सुनिए नए food court की कहानी।')], { ...HI, mode: 'payload', nextType: 'ad_break', nextAllowed: 'label only: a short break.' });
    expect(r.hard.join(' ')).toMatch(/describes what is next/);
  });
});

describe('catchphrase and repeats', () => {
  it('strips a catchphrase that was not allowed', () => {
    const r = freeChecks('rj_link', [rj('मेरा सीधा हिसाब है: पहले खाना, फोटो बाद में, क्योंकि photographer भूखा नहीं रहता।'), rj('पिछले महीने मेरे हिस्से में सिर्फ़ सलाद आया।'), rj('तरंग पे रहिए, तरंग में रहिए!')], { ...HI, mode: 'payload', catchphrase: { text: 'तरंग पे रहिए, तरंग में रहिए', allowed: false } });
    expect(r.dropLines).toEqual([2]);
  });
  it('finds repeated lines and lines that already aired', () => {
    expect(repeatedLines([rj('सुरसागर की तरफ़ से ठंडी हवा आ रही है आज।'), rj('सुरसागर की तरफ़ से ठंडी हवा आ रही है आज!')])).toEqual([{ line: 1, of: 0 }]);
    expect(repeatedLines([rj('रात के सवा आठ, 27 डिग्री, साफ़ आसमान।')], ['रात के सवा आठ, 27 डिग्री, साफ़ आसमान।'])).toEqual([{ line: 0, aired: true }]);
  });
});

describe('story shape', () => {
  const k = (role: string, text: string): FreeLine => ({ role, text, delivery: 'normal' });
  it('fails a final part that ends on a question, and a part that misses its outline line', () => {
    const lines = Array.from({ length: 12 }, (_, i) => k(i % 2 ? 'char_a' : 'char_b', `कबीर और निशा की बात नंबर ${i + 1} आगे बढ़ती है और नई चीज़ सामने आती है।`));
    lines[11] = k('char_a', 'तो बक्सा गया कहाँ?');
    expect(freeChecks('kahani', lines, { station: 'hi', part: 3 }).hard.join(' ')).toMatch(/on a question/);
    expect(freeChecks('kahani', lines, { station: 'hi', part: 1, expectedLastLine: 'उसमें दादी के चाँदी के सिक्के थे' }).hard.join(' ')).toMatch(/must end on/);
  });
  it('checks names early and kinship against the relations', () => {
    const lines = [k('char_a', 'ये बहुत भारी है।'), k('char_b', 'मुझे मत धक्का दो।'), k('char_a', 'चाचा, ये क्या है?'), k('char_b', 'पता नहीं।')];
    const r = freeChecks('kahani', lines, { station: 'hi', part: 1, names: { char_a: 'निशा', char_b: 'कबीर' }, relations: 'Kabir calls Nisha दीदी' });
    expect(r.hard.join(' ')).toMatch(/never heard their name/);
    expect(r.hard.join(' ')).toMatch(/"चाचा"/);
    expect(kinshipWords('पापा, वो कौन है?', 'hi')).toEqual(['पापा']);
    expect(undefinedKinship([k('char_kid', 'पापा, सुनो!')], "Pinky calls Ramesh 'पापा'", 'hi')).toEqual([]);
  });
});

describe('ad shape', () => {
  const ad = (role: string, text: string, delivery = 'normal'): FreeLine => ({ role, text, delivery });
  it('fails a chanted brand, a real landmark, and a missing planned punchline', () => {
    const r = freeChecks('ad_break', [ad('ad_customer', 'आज Laxmi Vilas Palace के बाहर कमाल हुआ!'), ad('ad_announcer', 'Papad-Chhata, बारिश में भी crunchy!'), ad('ad_announcer', 'तो आज ही लीजिए Papad-Chhata, Papad-Chhata! Papad-Chhata!')], { station: 'hi', brand: 'Papad-Chhata', punchline: 'छाता खोलो तो पापड़ गिरता है' });
    const all = r.hard.join(' ');
    expect(all).toMatch(/never chanted/);
    expect(all).toMatch(/real landmark/);
    expect(all).toMatch(/punchline you planned/);
  });
});

describe('the calibration set', () => {
  const run = (c: (typeof BASELINE)[number]) => freeChecks(c.input.type, c.input.lines, freeContextOf({ ...c.input, plan: c.plan }));
  it('fails every one of the 9 "before" scripts', () => {
    for (const c of BASELINE) expect(run(c).pass, c.id).toBe(false);
  });
  it('passes every hand-written good script', () => {
    for (const c of GOOD) expect(run(c).hard, c.id).toEqual([]);
  });
  it('lets the subtle faults through (the judge must catch them)', () => {
    for (const c of BROKEN) expect(run(c).pass, c.id).toBe(true);
  });
  it('names the known failures', () => {
    const msg = (id: string) => run(BASELINE.find((c) => c.id === id)!).hard.join(' ');
    expect(msg('before-hi-01-rj_link')).toMatch(/Alkapuri/);
    expect(msg('before-hi-03-ad_break')).toMatch(/stage direction/);
    expect(msg('before-hi-05-rj_link')).toMatch(/copies the instructions/);
    expect(msg('before-hi-05-rj_link')).toMatch(/time or the weather/);
    expect(msg('before-hi-04-kahani')).toMatch(/on a question/);
    expect(msg('before-ta-01-rj_link')).toMatch(/லக்ஷ்மி விலாஸ்/);
  });
});
