import { describe, expect, it } from 'vitest';
import { STATION_BY_ID } from '../../shared/stations';
import type { Station } from '../../shared/types';
import { copiesFictionExample, endsWithQuestion, fillerCount, kinshipOutside, leaksDirection, lineOverlap, namesLate, saysName, serialShape, type CheckLine, type SerialShapeOptions } from './story';

const hindi = STATION_BY_ID.hi as Station;
const line = (role: string, text: string): CheckLine => ({ role, text });

/** A clean 13-line part: names early, no fillers, no kinship, a resolved last line. */
const PLAY: CheckLine[] = [
  line('char_b', 'कबीर, तूने फिर मेरा टिफ़िन खाली कर दिया? आज दोपहर दो बजे मुझे वो दफ़्तर ले जाना है!'),
  line('char_a', 'मेहर, कसम से, मैंने तो उसे छुआ तक नहीं।'),
  line('narrator', 'सुबह के नौ बजे, पुणे की एक छोटी सी रसोई में कुकर बार-बार सीटी दे रहा था।'),
  line('char_kid', 'मेहर दीदी, मैंने सब देखा है, पर मैं कुछ नहीं बताऊँगी।'),
  line('char_b', 'पीहू, सच बता दे, तुझे नई पेंसिल मिलेगी।'),
  line('char_kid', 'टिफ़िन के ढक्कन पर हरा रंग लगा था, बस इतना ही बताऊँगी।'),
  line('char_a', 'हरा रंग? हमारे घर में तो सिर्फ़ बालकनी की रेलिंग हरी है।'),
  line('narrator', 'बाहर बालकनी में किसी के कदमों की आहट हुई।'),
  line('char_b', 'चलो, बालकनी में देखते हैं, घड़ी में डेढ़ बज चुका है।'),
  line('char_a', 'यहाँ तो एक बिल्ली बैठी है, और उसकी मूँछों पर दाल लगी है।'),
  line('char_kid', 'वो रोज़ आती है, मैं उसे अपना आधा खाना देती हूँ।'),
  line('char_b', 'तो टिफ़िन का चोर एक बिल्ली निकली, और उसकी दोस्त हमारी पीहू।'),
  line('char_a', 'अब से टिफ़िन में एक कटोरी बिल्ली के नाम की भी जाएगी।'),
];

const OPTS: SerialShapeOptions = {
  part: 3,
  characters: ['char_a', 'char_b', 'char_kid'],
  names: { char_a: 'कबीर', char_b: 'मेहर', char_kid: 'पीहू' },
  defined: 'Kabir and Meher are siblings and use names; Pihu is their neighbour',
  expectedLast: 'अब से टिफ़िन में एक कटोरी बिल्ली के नाम की भी जाएगी।',
  min: 12,
  max: 18,
  noListenerName: true,
};

describe('stage-direction leaks', () => {
  it('catches directions, labels, brackets and SFX read aloud', () => {
    expect(leaksDirection('उनके shoes हैं PannaPani. delivery: hushed।')).toBe(true);
    expect(leaksDirection('(धीमी आवाज़ में) सुनो, कोई है।')).toBe(true);
    expect(leaksDirection('मेहर: चलो, जल्दी करो।', ['मेहर'])).toBe(true);
    expect(leaksDirection('SFX दरवाज़ा खुलता है।')).toBe(true);
    expect(leaksDirection('[hushed] ये राज़ है।')).toBe(true);
    expect(leaksDirection('narrator: रात के बारह बजे।')).toBe(true);
    expect(leaksDirection('ये product, delivery hushed, बहुत अच्छा है।')).toBe(true);
  });

  it('lets ordinary spoken lines through', () => {
    expect(leaksDirection('रात 11:30 की लोकल।')).toBe(false);
    expect(leaksDirection('मेहर, ये टिफ़िन फिर मेरी डेस्क पर कैसे?')).toBe(false);
    expect(leaksDirection('30 मिनट में home delivery, वो भी गरम।')).toBe(false);
    expect(leaksDirection('T&C: सिर्फ़ रविवार को लागू।')).toBe(false);
    for (const l of PLAY) expect(leaksDirection(l.text, ['कबीर', 'मेहर', 'पीहू'])).toBe(false);
  });
});

describe('names early', () => {
  it('finds names inflected, with loose vowel length', () => {
    expect(saysName('कबीर को बुलाओ', 'कबीर')).toBe(true);
    expect(saysName('ईशान, रुको!', 'इशान')).toBe(true);
    expect(saysName('அர்ஜுனுக்கு தெரியும்.', 'அர்ஜுன்')).toBe(true);
  });

  it('flags a character the listener never hears named', () => {
    expect(namesLate(PLAY, OPTS.names)).toEqual([]);
    const unnamed = PLAY.map((l) => ({ ...l, text: l.text.replace(/कबीर/g, 'तू') }));
    expect(namesLate(unnamed, OPTS.names)).toEqual(['char_a']);
    expect(namesLate(PLAY, { char_a: 'none' })).toEqual([]);
  });

  it('sends back a character who calls out their own name', () => {
    const self = PLAY.map((l, i) => (i === 3 ? { ...l, text: 'पीहू ने सब देखा है, पर पीहू कुछ नहीं बताएगी।' } : l));
    expect(serialShape(hindi, self, OPTS).hard.some((p) => p.includes('own name'))).toBe(true);
  });
});

describe('kinship words', () => {
  const papa = [line('char_a', 'पापा, आप फिर से चाबी भूल गए?')];

  it('flags a kinship word the relations never defined', () => {
    expect(kinshipOutside(papa, 'hi', 'Kabir and Tara are neighbours')).toEqual(['पापा']);
  });

  it('allows it when the relations say so, in the script or in English', () => {
    expect(kinshipOutside(papa, 'hi', 'Tara calls Kabir "पापा"')).toEqual([]);
    expect(kinshipOutside(papa, 'hi', "Kabir is Tara's father")).toEqual([]);
  });

  it('does not mistake ordinary words for kinship', () => {
    expect(kinshipOutside([line('char_a', 'उसकी माँग पूरी करनी होगी।')], 'hi', 'neighbours')).toEqual([]);
    expect(kinshipOutside([line('char_a', 'அந்த பாட்டில் எங்கே?')], 'ta', 'friends')).toEqual([]);
    expect(kinshipOutside([line('char_a', 'அப்பாவுக்கு சொல்லிடு.')], 'ta', 'friends')).toEqual(['அப்பா']);
    expect(kinshipOutside([line('char_a', 'भैया, दीदी, ज़रा रास्ता दीजिए।')], 'hi', 'strangers')).toEqual([]);
  });
});

describe('line overlap', () => {
  it('measures how much of the planned line was said, inflections allowed', () => {
    expect(lineOverlap(OPTS.expectedLast!, OPTS.expectedLast!)).toBe(1);
    expect(lineOverlap('ढक्कन पर हरा रंग लगा था।', 'ढक्कन पर हरा रंग लगा था, और रेलिंग पर दाल।')).toBeGreaterThan(0.5);
    expect(lineOverlap('चलो घर चलते हैं।', 'ढक्कन पर हरा रंग लगा था, और रेलिंग पर दाल।')).toBeLessThan(0.3);
  });

  it('knows a question when it hears one', () => {
    expect(endsWithQuestion('वो कौन था?')).toBe(true);
    expect(endsWithQuestion('वो कौन था? ')).toBe(true);
    expect(endsWithQuestion('वो बिल्ली थी।')).toBe(false);
  });
});

describe('serial shape', () => {
  it('passes a clean part', () => {
    expect(serialShape(hindi, PLAY, OPTS).hard).toEqual([]);
  });

  it('sends back a part that runs long, never cutting it', () => {
    const long = [...PLAY.slice(0, 6), ...PLAY.slice(0, 6), ...PLAY.slice(6)];
    expect(long.length).toBe(19);
    expect(serialShape(hindi, long, OPTS).hard.some((p) => p.startsWith('Too long'))).toBe(true);
    expect(serialShape(hindi, PLAY.slice(0, 8), OPTS).hard.some((p) => p.startsWith('Too short'))).toBe(true);
  });

  it('never lets the last part end on a question', () => {
    const open = [...PLAY.slice(0, -1), line('char_a', 'पर बिल्ली टिफ़िन खोलना किससे सीखी?')];
    const hard = serialShape(hindi, open, OPTS).hard;
    expect(hard.some((p) => p.includes('must resolve'))).toBe(true);
    expect(hard.some((p) => p.includes('must end on its ending line'))).toBe(true);
    expect(serialShape(hindi, open, { ...OPTS, part: 1, expectedLast: open[open.length - 1].text }).hard).toEqual([]);
  });

  it('rejects roles outside the story, too much narration and copied examples', () => {
    const stranger = PLAY.map((l, i) => (i === 4 ? { ...l, role: 'rj' } : l));
    expect(serialShape(hindi, stranger, OPTS).hard.some((p) => p.includes('not in this story'))).toBe(true);
    const narrated = PLAY.map((l, i) => (i >= 6 && i < 12 ? { ...l, role: 'narrator' } : l));
    expect(serialShape(hindi, narrated, OPTS).hard.some((p) => p.includes('The narrator has'))).toBe(true);
    const copied = PLAY.map((l, i) => (i === 7 ? { ...l, text: 'बाहर कुकर की तीसरी सीटी बजी, और उसी पल पूरी गली की बत्ती चली गई।' } : l));
    expect(serialShape(hindi, copied, OPTS).hard.some((p) => p.includes('copies an example'))).toBe(true);
  });

  it('rejects the listener name, stock phrases and kinship the outline never defined', () => {
    const named = PLAY.map((l, i) => (i === 2 ? { ...l, text: 'ये कहानी {name} के लिए, सुबह नौ बजे की।' } : l));
    expect(serialShape(hindi, named, OPTS).hard.some((p) => p.includes('{name}'))).toBe(true);
    const stock = PLAY.map((l, i) => (i === 2 ? { ...l, text: 'एक बार की बात है, पुणे की एक रसोई थी।' } : l));
    expect(serialShape(hindi, stock, OPTS).hard.some((p) => p.includes('stock story phrase'))).toBe(true);
    const papa = PLAY.map((l, i) => (i === 10 ? { ...l, text: 'पापा, वो रोज़ आती है, मैं उसे खाना देती हूँ।' } : l));
    expect(serialShape(hindi, papa, OPTS).hard.some((p) => p.includes('Kinship words'))).toBe(true);
  });

  it('turns filler openings into a fix note', () => {
    const one = PLAY.map((l, i) => (i === 6 ? { ...l, text: `अरे, ${l.text}` } : l));
    const r1 = serialShape(hindi, one, OPTS);
    expect(r1.hard).toEqual([]);
    expect(r1.soft.some((p) => p.includes('filler'))).toBe(true);
    const two = one.map((l, i) => (i === 9 ? { ...l, text: `यार ${l.text}` } : l));
    expect(serialShape(hindi, two, OPTS).hard.some((p) => p.includes('start with a filler'))).toBe(true);
  });
});

describe('fillers and copies', () => {
  it('counts filler openings and fillers in all', () => {
    expect(fillerCount([line('char_a', 'अरे, ये क्या है?'), line('char_b', 'यार चलो।'), line('char_a', 'सब ठीक है सच में।')], 'hi')).toEqual({ starts: 2, total: 3 });
    expect(fillerCount(PLAY, 'hi')).toEqual({ starts: 0, total: 0 });
    expect(fillerCount([line('char_a', 'அட, இது என்ன?')], 'ta').starts).toBe(1);
  });

  it('catches the prompt examples in every language', () => {
    expect(copiesFictionExample('इशान, तूने फिर मेरी साइकिल की घंटी बेच दी?')).toBe(true);
    expect(copiesFictionExample('सपनों का घर, 10 मिनट, अगर आप ख़ुद उड़ सकें।')).toBe(true);
    expect(copiesFictionExample('வெளியே குக்கர் மூணாவது விசில் அடிச்சுது.')).toBe(true);
    expect(copiesFictionExample('ગોખણપટ્ટી Classes.')).toBe(true);
    expect(copiesFictionExample(PLAY[0].text)).toBe(false);
  });
});
