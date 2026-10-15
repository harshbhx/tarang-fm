import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { SerialStateSchema, type SegmentRequest } from '../shared/schemas';
import { CAST_SPEAKERS, STATION_BY_ID } from '../shared/stations';
import type { RecapSource, Station } from '../shared/types';
import { castRecord, castSerial } from './casting';
import { buildFiction, kahaniMode, outlineProblems, producerNote, withSafetyNet } from './fiction';
import type { SerialOutline } from './prompts/kahani';
import type { ChatJsonOptions, ChatMessage, Sarvam } from './sarvam';
import { buildSegment } from './segment';
import { Timings } from './timing';

const hindi = STATION_BY_ID.hi as Station;

interface Call {
  name: string;
  messages: ChatMessage[];
  opts: ChatJsonOptions;
}

/** A script writer that answers each call by its name (and how many times that name was called). */
function writer(reply: (name: string, n: number) => unknown) {
  const calls: Call[] = [];
  const sarvam = {
    chatJson: async (messages: ChatMessage[], _schema: unknown, zod: z.ZodType, opts: ChatJsonOptions) => {
      calls.push({ name: opts.name, messages, opts });
      const n = calls.filter((c) => c.name === opts.name).length;
      return zod.parse(reply(opts.name, n));
    },
    transliterate: async (t: string) => t,
  } as unknown as Sarvam;
  const user = (call: Call) => call.messages[call.messages.length - 1].content;
  const all = (call: Call) => call.messages.map((m) => m.content).join('\n');
  return { sarvam, calls, user, all };
}

const listener = { name: 'Harsh', city: 'Vadodara', localTime: '20:15', daypart: 'evening' as const, localDate: '2026-10-15' };
const kahani = (patch: Partial<SegmentRequest> = {}): SegmentRequest => ({
  station: 'hi',
  type: 'kahani',
  listener,
  weather: { tempC: 27, description: 'clear sky' },
  showLog: [{ type: 'rj_link', summary: 'RJ Sunny teased the Alkapuri flyover' }],
  ...patch,
});

const OUTLINE: SerialOutline = {
  plan_why: 'The green paint on the lid points to the balcony railing, where a stray cat waits.',
  title_native: 'हरी रेलिंग का चोर',
  logline_en: 'A tiffin keeps emptying itself in a Pune kitchen until the thief turns out to be a stray cat.',
  setting_native: 'पुणे की एक रसोई, सुबह नौ बजे, कुकर की सीटियाँ।',
  char_a_name_native: 'कबीर',
  char_a_who_en: "Meher's younger brother, 28",
  char_a_want_en: 'to prove he did not eat the tiffin',
  char_a_habit_native: 'कसम से',
  char_b_name_native: 'मेहर',
  char_b_who_en: "Kabir's sister, 32, an office worker",
  char_b_want_en: 'to take her tiffin to the office by 2 pm',
  char_b_habit_native: 'छोटे-छोटे वाक्य',
  char_kid_name_native: 'पीहू',
  char_kid_who_en: 'the neighbour girl, 9',
  char_kid_habit_native: 'हर बात पर शर्त',
  offstage_en: 'none',
  relations_en: 'Kabir and Meher are siblings and use names; Pihu is their neighbour and calls Meher "दीदी"',
  central_question_en: 'Who empties the tiffin every day?',
  clock_en: 'the tiffin must reach the office by 2 pm',
  clue_en: 'green paint on the lid (part 1)',
  red_herring_en: 'Pihu says she knows a secret',
  twist_en: 'the thief is a stray cat that Pihu feeds',
  part1_goal_en: 'The tiffin is empty again; Kabir stands guard and fails.',
  part1_last_line_native: 'ढक्कन पर हरा रंग लगा था, और रेलिंग पर दाल।',
  part1_last_role: 'narrator',
  part2_goal_en: 'They suspect the neighbour; he is cleared.',
  part2_last_line_native: 'तभी रेलिंग से किसी ने पीहू का नाम लेकर धीरे से म्याऊँ किया।',
  part2_last_role: 'narrator',
  part3_goal_en: 'The cat is found; it gets its own bowl.',
  payoff_en: 'the cat gets its own bowl in the kitchen',
  payoff_native: 'उस दिन से रसोई में एक कटोरी बिल्ली के नाम की रखी जाने लगी।',
  final_line_native: 'अब से टिफ़िन में एक कटोरी बिल्ली के नाम की भी जाएगी।',
  final_line_role: 'char_a',
  tease_native: 'एक टिफ़िन, जो रोज़ ख़ाली मिलता है।',
};

const l = (role: string, text: string, delivery = 'normal') => ({ role, text, delivery });

/** 17 lines that keep every rule and end on part 1's planned line. */
const PART1 = [
  l('char_b', 'कबीर, तूने फिर मेरा टिफ़िन खाली कर दिया? आज दोपहर दो बजे मुझे वो दफ़्तर ले जाना है!', 'shout'),
  l('char_a', 'मेहर, कसम से, मैंने तो उसे छुआ तक नहीं।'),
  l('narrator', 'सुबह के नौ बजे, पुणे की एक छोटी सी रसोई में कुकर बार-बार सीटी दे रहा था।', 'dramatic'),
  l('char_kid', 'मेहर दीदी, मैंने सब देखा है, पर मैं कुछ नहीं बताऊँगी।'),
  l('char_b', 'पीहू, सच बता दे, तुझे नई पेंसिल मिलेगी।'),
  l('char_kid', 'नई पेंसिल के बदले भी नहीं, ये राज़ है।'),
  l('char_a', 'तो फिर मैं आज खुद पहरा दूँगा, दो बजे तक।'),
  l('char_b', 'तू? तू तो दस मिनट में सो जाता है।'),
  l('narrator', 'कबीर ने कुर्सी रसोई के दरवाज़े पर लगा दी।'),
  l('char_a', 'घड़ी में साढ़े बारह, और अभी तक कोई नहीं आया।'),
  l('char_kid', 'मुझे भूख लगी है, मैं थोड़ा बाहर खेल आऊँ?'),
  l('char_b', 'जा, पर दरवाज़ा बंद करके जाना।'),
  l('char_a', 'एक मिनट, ये ढक्कन तो फिर खुला पड़ा है!', 'excited'),
  l('char_b', 'और टिफ़िन फिर खाली, सिर्फ़ एक पत्ता बचा है।'),
  l('char_kid', 'मैंने कुछ नहीं किया, मैं तो बाहर थी।'),
  l('char_a', 'ये ढक्कन पर कुछ लगा है, हल्का हरा सा।', 'hushed'),
  l('narrator', 'ढक्कन पर हरा रंग लगा था, और रेलिंग पर दाल।', 'dramatic'),
];

/** Part 2: new lines (never repeating part 1), ending on part 2's planned line. */
const PART2 = [
  l('narrator', 'पिछली बार ढक्कन पर हरा रंग मिला था, और आज मेहर ने तय किया है कि चोर पकड़ के रहेगी।', 'dramatic'),
  l('char_b', 'कबीर, बालकनी की रेलिंग पर कल ही हरा पेंट हुआ था, याद है?'),
  l('char_a', 'मेहर, कसम से, पेंट तो सामने वाले शर्मा जी ने करवाया था।'),
  l('char_b', 'तो चल, आज उन्हीं से पूछते हैं, बस एक घंटा बचा है।'),
  l('narrator', 'दरवाज़े पर घंटी दो बार बजी।'),
  l('char_kid', 'मेहर दीदी, शर्मा अंकल तो कल से गाँव गए हैं।'),
  l('char_a', 'पीहू, तुझे कैसे पता?'),
  l('char_kid', 'उनकी चाबी मेरे पास है, पौधों को पानी देना होता है।'),
  l('char_b', 'यानी पेंट वाला चोर भी नहीं हो सकता, घड़ी में पौने दो हो गए।'),
  l('char_a', 'टिफ़िन फिर से भर दिया है, इस बार मैं पलक भी नहीं झपकाऊँगा।'),
  l('narrator', 'रसोई में सन्नाटा था, बस फ़्रिज की धीमी गुनगुनाहट।', 'hushed'),
  l('char_kid', 'मुझे लगता है चोर बहुत छोटा है, और उसके पैर गद्देदार हैं।'),
  l('narrator', OUTLINE.part2_last_line_native, 'hushed'),
];

const part = (lines: ReturnType<typeof l>[], cliffhanger = 'Green paint on the lid, dal on the railing.') => ({
  plan_scene: 'A Pune kitchen, 9 am to 12:30',
  plan_names: 'Kabir by Meher in line 1; Meher by Kabir in line 2; Pihu by Meher in line 5',
  plan_turn: 'Kabir guards the kitchen and the tiffin empties anyway',
  lines,
  summary_en: 'Meher found her tiffin empty again; Kabir stood guard, and the lid came back with green paint on it.',
  cliffhanger_en: cliffhanger,
});

describe('Kahani serial: part 1 writes the outline first', () => {
  it('plans once with reasoning, then writes the part toward its ending, and returns the serial', async () => {
    const w = writer((name) => (name === 'tarang_kahani_outline' ? OUTLINE : part(PART1)));
    const segment = await buildSegment(w.sarvam, hindi, kahani({ part: 1 }), new Timings());
    expect(w.calls.map((c) => c.name)).toEqual(['tarang_kahani_outline', 'tarang_kahani_part1']);
    // The outline is the only call that may think; every part is written with reasoning off
    expect([null, 'low']).toContain(w.calls[0].opts.reasoningEffort);
    expect(w.calls[1].opts.reasoningEffort).toBeNull();
    for (const c of w.calls) expect(c.opts.maxTokens).toBeLessThanOrEqual(4096);
    expect(segment.fallback).toBeUndefined();
    expect(segment.title).toContain('कड़ी 1');
    expect(segment.title).toContain(OUTLINE.title_native);
    // Never truncated: all 17 lines air, ending on the planned line
    expect(segment.lines).toHaveLength(17);
    expect(segment.lines[16].text).toBe(OUTLINE.part1_last_line_native);
    const serial = segment.serial!;
    expect(serial.id).toBeTruthy();
    expect(serial.part).toBe(1);
    expect(serial.outline.title_native).toBe(OUTLINE.title_native);
    expect(serial.outline.aired_cliffhanger_en).toBe('Green paint on the lid, dal on the railing.');
    expect(serial.outline.opening).toBeTruthy();
    expect(Object.keys(serial.cast).sort()).toEqual(['char_a', 'char_b', 'char_kid', 'narrator']);
    for (const speaker of Object.values(serial.cast)) expect(CAST_SPEAKERS.has(speaker!)).toBe(true);
    for (const line of segment.lines) expect(line.speaker).toBe(serial.cast[line.role as keyof typeof serial.cast]);
    // The client can echo it straight back
    expect(SerialStateSchema.safeParse(serial).success).toBe(true);
    expect(segment.summary).toMatch(/^Kahani part 1 of 3: Meher found/);
  });

  it('gives the story only its own world: no show log, city, weather or listener', async () => {
    const w = writer((name) => (name === 'tarang_kahani_outline' ? OUTLINE : part(PART1)));
    await buildSegment(w.sarvam, hindi, kahani({ part: 1 }), new Timings());
    for (const c of w.calls) {
      const u = w.user(c);
      for (const leak of ['LOCAL PACK', 'PREVIOUSLY ON AIR', 'WEATHER', 'Vadodara', 'Alkapuri', 'Harsh', '27']) expect(u, `${c.name}: ${leak}`).not.toContain(leak);
      expect(w.all(c)).not.toContain('Harsh');
    }
  });

  it('falls back to one complete story when no usable outline comes back', async () => {
    const broken = { ...OUTLINE, char_a_name_native: 'none', final_line_native: '' };
    const w = writer((name) => (name === 'tarang_kahani_outline' ? broken : { ...part(PART1), title: 'टिफ़िन', char_a_name_native: 'कबीर', char_b_name_native: 'मेहर', char_kid_name_native: 'पीहू', relations_en: OUTLINE.relations_en, last_line_native: PART1[16].text, last_line_role: 'char_a' }));
    const segment = await buildFiction(w.sarvam, hindi, kahani({ part: 1 }), new Timings());
    expect(w.calls.filter((c) => c.name === 'tarang_kahani_outline')).toHaveLength(2);
    expect(w.calls.some((c) => c.name === 'tarang_kahani_story')).toBe(true);
    expect(segment.serial).toBeUndefined();
  });
});

const cast = castSerial(hindi, { hour: 20 }).cast;
const serial = (p: 1 | 2 | 3) => ({ id: 'serial-1', part: p, outline: { ...OUTLINE, opening: 'cold-open' }, cast: castRecord(cast) });
const recap: RecapSource = {
  heard: 'Meher found her tiffin empty again; Kabir stood guard, and the lid came back with green paint on it.',
  cliffhanger: 'Green paint on the lid, dal on the railing.',
  lastLines: [
    { role: 'char_a', text: 'ये ढक्कन पर कुछ लगा है, हल्का हरा सा।' },
    { role: 'narrator', text: 'ढक्कन पर हरा रंग लगा था, और रेलिंग पर दाल।' },
  ],
};

describe('Kahani serial: later parts', () => {
  it('recaps from what aired and keeps the locked voices', async () => {
    const w = writer(() => part(PART2, 'A voice from the railing meowed Pihu\'s name.'));
    const segment = await buildFiction(w.sarvam, hindi, kahani({ part: 2, serial: serial(1), recapSource: recap }), new Timings());
    expect(w.calls.map((c) => c.name)).toEqual(['tarang_kahani_part2']);
    const u = w.user(w.calls[0]);
    expect(u).toContain('RECAP SOURCE');
    expect(u).toContain(recap.heard);
    for (const line of recap.lastLines) expect(u).toContain(line.text);
    expect(u).not.toContain(OUTLINE.twist_en);
    expect(segment.serial!.id).toBe('serial-1');
    expect(segment.serial!.part).toBe(2);
    expect(segment.serial!.cast).toEqual(castRecord(cast));
    for (const line of segment.lines) expect(line.speaker).toBe(castRecord(cast)[line.role as 'narrator']);
    expect(segment.title).toContain('कड़ी 2');
  });

  it('recaps from the serial itself when the client sends no recap source', async () => {
    const w = writer(() => part(PART2));
    const s = serial(1);
    s.outline = { ...s.outline, aired_heard_en: 'HEARD-LAST-TIME', aired_cliffhanger_en: 'ENDED-ON-THIS' };
    await buildFiction(w.sarvam, hindi, kahani({ serial: s }), new Timings());
    expect(w.calls[0].name).toBe('tarang_kahani_part2');
    expect(w.user(w.calls[0])).toContain('HEARD-LAST-TIME');
    expect(w.user(w.calls[0])).toContain('ENDED-ON-THIS');
  });

  it('recasts a serial whose voices do not belong to the station', async () => {
    const w = writer(() => part(PART2));
    const s = { ...serial(1), cast: { narrator: 'nobody_hi_fake', char_a: 'mukul_hi_suspense' } };
    const segment = await buildFiction(w.sarvam, hindi, kahani({ part: 2, serial: s, recapSource: recap }), new Timings());
    for (const speaker of Object.values(segment.serial!.cast)) expect(CAST_SPEAKERS.has(speaker!)).toBe(true);
    expect(segment.serial!.cast.narrator).not.toBe('nobody_hi_fake');
  });

  it('always resolves part 3: a question twice gets the payoff and the planned last line appended', async () => {
    const open = [...PART1.slice(0, 12), l('char_a', 'पर बिल्ली ने ढक्कन खोलना किससे सीखा?')];
    const w = writer(() => part(open, 'resolved'));
    const segment = await buildFiction(w.sarvam, hindi, kahani({ part: 3, serial: serial(2), recapSource: recap }), new Timings());
    expect(w.calls.map((c) => c.name)).toEqual(['tarang_kahani_part3', 'tarang_kahani_part3']);
    expect(w.user(w.calls[0])).not.toContain('PRODUCER NOTE');
    expect(w.user(w.calls[1])).toContain('PRODUCER NOTE');
    expect(w.user(w.calls[1])).toContain('must resolve');
    expect(w.user(w.calls[0])).toContain(OUTLINE.twist_en);
    const last2 = segment.lines.slice(-2);
    expect(last2.map((x) => [x.role, x.text])).toEqual([
      ['narrator', OUTLINE.payoff_native],
      ['char_a', OUTLINE.final_line_native],
    ]);
    expect(segment.lines).toHaveLength(15);
    expect(segment.serial!.outline.aired_cliffhanger_en).toBe('resolved');
    expect(segment.summary).toContain('In the end');
  });
});

describe('one complete story', () => {
  const story = {
    char_a_name_native: 'कबीर',
    char_b_name_native: 'मेहर',
    char_kid_name_native: 'पीहू',
    relations_en: OUTLINE.relations_en,
    plan_want: 'Meher needs her tiffin by 2 pm',
    plan_clue: 'green paint on the lid',
    plan_twist: 'a stray cat',
    plan_payoff: 'the cat gets a bowl',
    last_line_native: OUTLINE.final_line_native,
    last_line_role: 'char_a',
    title: 'हरी रेलिंग का चोर',
    lines: [...PART1.slice(0, 15), l('char_a', OUTLINE.final_line_native, 'warm')],
    summary_en: 'Meher’s tiffin kept emptying; the thief was a stray cat, which now gets its own bowl.',
  };

  it('is what an older client (no part, no serial) and the live show get: one call, no outline', async () => {
    for (const patch of [{}, { oneShot: true, part: 2 as const }, { part: 3 as const }]) {
      const w = writer(() => story);
      const segment = await buildFiction(w.sarvam, hindi, kahani(patch), new Timings());
      expect(w.calls.length).toBeGreaterThanOrEqual(1);
      expect(w.calls.every((c) => c.name === 'tarang_kahani_story')).toBe(true);
      expect(segment.serial).toBeUndefined();
      expect(segment.title).toBe('हरी रेलिंग का चोर');
      expect(segment.lines.length).toBe(16);
      expect(segment.summary).toMatch(/^Kahani "हरी रेलिंग का चोर": /);
    }
  });

  it('never ends on a question: the planned last line is appended after the rewrite', async () => {
    const w = writer(() => ({ ...story, lines: [...story.lines.slice(0, -1), l('char_b', 'पर वो बिल्ली आई कहाँ से?')] }));
    const segment = await buildFiction(w.sarvam, hindi, kahani({ oneShot: true }), new Timings());
    expect(w.calls).toHaveLength(2);
    expect(segment.lines[segment.lines.length - 1].text).toBe(OUTLINE.final_line_native);
    expect(segment.lines[segment.lines.length - 1].role).toBe('char_a');
  });
});

describe('kahani modes', () => {
  const s = serial(1);
  it('reads what the request asks for', () => {
    expect(kahaniMode(kahani({ oneShot: true, part: 1 }))).toEqual({ kind: 'one_shot' });
    expect(kahaniMode(kahani({ part: 1 }))).toEqual({ kind: 'part', part: 1 });
    expect(kahaniMode(kahani({ part: 3, serial: s }))).toEqual({ kind: 'part', part: 3, serial: s });
    expect(kahaniMode(kahani({ serial: s }))).toEqual({ kind: 'part', part: 2, serial: s });
    expect(kahaniMode(kahani({ serial: { ...s, part: 3 } }))).toMatchObject({ kind: 'part', part: 3 });
    expect(kahaniMode(kahani({ part: 2 }))).toEqual({ kind: 'one_shot' });
    expect(kahaniMode(kahani())).toEqual({ kind: 'one_shot' });
  });
});

describe('outline problems', () => {
  it('flags missing names and endings, a question ending and an aired title', () => {
    expect(outlineProblems(OUTLINE, cast)).toEqual([]);
    const bad = { ...OUTLINE, char_b_name_native: 'none', final_line_native: 'और बिल्ली?', part1_last_line_native: '' };
    const problems = outlineProblems(bad, cast, new Set(['हरीरेलिंगकाचोर']));
    expect(problems.some((p) => p.includes('char_b is in the cast but has no name'))).toBe(true);
    expect(problems.some((p) => p.includes('final_line_native is a question'))).toBe(true);
    expect(problems.some((p) => p.includes('part1_last_line_native is empty'))).toBe(true);
    expect(problems.some((p) => p.includes('already aired'))).toBe(true);
  });
});

describe('the safety net', () => {
  const make = (role: string, text: string, delivery: string) => ({ role, text, delivery });
  const ending = { payoff: OUTLINE.payoff_native, last: OUTLINE.final_line_native, lastRole: 'char_a' };

  it('leaves a part that already ends on its line alone', () => {
    const lines = [l('char_b', 'चलो।'), l('char_a', OUTLINE.final_line_native)];
    expect(withSafetyNet(lines, ending, make)).toEqual({ lines, appended: false });
  });

  it('plays the payoff and the last line after a question', () => {
    const { lines, appended } = withSafetyNet([l('char_b', 'चलो।'), l('char_a', 'पर क्यों?')], ending, make);
    expect(appended).toBe(true);
    expect(lines.slice(-2)).toEqual([make('narrator', OUTLINE.payoff_native, 'warm'), make('char_a', OUTLINE.final_line_native, 'warm')]);
  });

  it('adds only the last line when the payoff already aired', () => {
    const payoff = 'उस दिन से रसोई की खिड़की हमेशा खुली रहने लगी।';
    const { lines } = withSafetyNet([l('narrator', payoff), l('char_b', 'ठीक है, चलो दफ़्तर।')], { ...ending, payoff }, make);
    expect(lines.slice(-1)).toEqual([make('char_a', OUTLINE.final_line_native, 'warm')]);
    expect(lines).toHaveLength(3);
  });

  it('gives the narrator a last line with no character, and never appends a question', () => {
    expect(withSafetyNet([l('char_b', 'पर क्यों?')], { last: 'सब घर लौट आए।' }, make).lines.slice(-1)[0].role).toBe('narrator');
    const { lines } = withSafetyNet([l('char_b', 'पर क्यों?')], { payoff: 'बिल्ली को कटोरी मिली।', last: 'और फिर?' }, make);
    expect(lines.map((x) => x.text)).toEqual(['पर क्यों?', 'बिल्ली को कटोरी मिली।']);
  });
});

// ---- Ads ----------------------------------------------------------------------------------------------------------

const adReq = (patch: Partial<SegmentRequest> = {}): SegmentRequest => ({
  station: 'hi',
  type: 'ad_break',
  listener,
  weather: { tempC: 27, description: 'clear sky' },
  showLog: [{ type: 'rj_link', summary: 'RJ Sunny greeted Harsh' }],
  ...patch,
});

const CLEAN_AD = {
  plan_punchline: 'रिश्तेदारी बाज़ार के जोखिमों के अधीन है',
  plan_product: 'a plan that turns the Sunday spent on relatives\' calls into an investment',
  plan_brand_pun: 'फ़ोन-फ़ंड: phone + fund',
  plan_signature: 'the slow, sincere mutual-fund announcer',
  title: 'फ़ोन-फ़ंड प्लान',
  lines: [
    l('ad_announcer', 'बच्चों की पढ़ाई, बेटी की शादी, अपना retirement, सबकी planning ज़रूरी है।', 'warm'),
    l('ad_customer', 'इसीलिए मैंने अपना पूरा Sunday invest कर दिया, रिश्तेदारों के फ़ोन उठाने में।'),
    l('ad_announcer', 'फ़ोन-फ़ंड प्लान। शर्तें लागू: रिश्तेदारी बाज़ार के जोखिमों के अधीन है, कृपया बातें ध्यान से सुनें।', 'fast'),
  ],
  summary_en: 'A mutual-fund parody: the Phone-Fund plan invests your Sunday in relatives\' calls; the disclaimer is the joke.',
};

const LEAKY_AD = {
  ...CLEAN_AD,
  lines: [l('ad_customer', 'उनके shoes हैं PannaPani. delivery: hushed।', 'hushed'), l('ad_announcer', '(excited) फ़ोन-फ़ंड प्लान!'), l('ad_announcer', '[fast] शर्तें लागू।', 'fast')],
};

describe('ad break', () => {
  it('sends a stage-direction leak back once and airs the clean rewrite', async () => {
    const w = writer((_name, n) => (n === 1 ? LEAKY_AD : CLEAN_AD));
    const segment = await buildSegment(w.sarvam, hindi, adReq(), new Timings());
    expect(w.calls.map((c) => c.name)).toEqual(['tarang_ad_break', 'tarang_ad_break']);
    expect(w.user(w.calls[1])).toContain('PRODUCER NOTE');
    expect(w.user(w.calls[1])).toContain('stage direction');
    expect(segment.fallback).toBeUndefined();
    expect(segment.title).toBe('फ़ोन-फ़ंड प्लान');
    expect(segment.lines).toHaveLength(3);
    for (const line of segment.lines) {
      expect(line.text).not.toMatch(/delivery|hushed|\(|\[/);
      expect(line.speaker).toBe(hindi.cast[line.role].speaker);
    }
    expect(segment.summary).toContain('mutual-fund parody');
  });

  it('writes from the card and the season, never from the show log, the city or the listener', async () => {
    const w = writer(() => CLEAN_AD);
    await buildFiction(w.sarvam, hindi, adReq(), new Timings());
    const u = w.user(w.calls[0]);
    expect(u).toContain('FORMAT:');
    expect(u).toContain('EVERYDAY PROBLEM it solves:');
    expect(u).toContain('TIME OF YEAR: October');
    expect(u.indexOf('plan_punchline')).toBeLessThan(u.indexOf('plan_brand_pun'));
    for (const leak of ['LOCAL PACK', 'PREVIOUSLY ON AIR', 'Vadodara', 'Harsh', 'WEATHER']) expect(u).not.toContain(leak);
    expect(w.all(w.calls[0])).not.toContain('Harsh');
  });

  it('plays the station ID instead of an ad that is still unusable after the rewrite', async () => {
    const allLeaks = { ...LEAKY_AD, lines: LEAKY_AD.lines.map((x) => ({ ...x, text: `(hushed) ${x.text}` })) };
    const w = writer(() => allLeaks);
    const segment = await buildFiction(w.sarvam, hindi, adReq(), new Timings());
    expect(w.calls).toHaveLength(2);
    expect(segment.fallback).toBe(true);
    expect(segment.type).toBe('ad_break');
    expect(segment.lines).toHaveLength(1);
    expect(segment.lines[0].role).toBe('station_id');
    expect(segment.lines[0].text).toBe(hindi.stationIdText);
  });

  it('plays the station ID when the writer is down', async () => {
    const w = writer(() => {
      throw new Error('model down');
    });
    const segment = await buildFiction(w.sarvam, hindi, adReq({ subtitles: true }), new Timings());
    expect(segment.fallback).toBe(true);
    expect(segment.lines[0].role).toBe('station_id');
    expect(segment.lines[0].en).toBe(hindi.stationIdEn);
  });
});

describe('producer note', () => {
  it('lists the hard problems first, then the soft ones', () => {
    expect(producerNote({ hard: ['Line 3 is a question.'], soft: ['Fillers: 4 (allowed 3).'] })).toBe(
      'PRODUCER NOTE (the last draft was sent back; fix this and keep what worked):\n- Line 3 is a question.\n- Fillers: 4 (allowed 3).',
    );
  });
});
