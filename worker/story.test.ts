import { describe, expect, it } from 'vitest';
import type { SegmentRequest } from '../shared/schemas';
import { CAST_SPEAKERS, rjVoiceAt, STATION_BY_ID, STATIONS, storyVoices } from '../shared/stations';
import type { RecapSource, Station } from '../shared/types';
import { castCharacters, castFromRecord, castRecord, castSerial, type SerialCast } from './casting';
import {
  oneShotJsonSchema,
  oneShotPrompt,
  outlineJsonSchema,
  outlinePrompt,
  outlineSystem,
  partJsonSchema,
  partPrompt,
  partTitle,
  type SerialOutline,
  type StoryPlan,
} from './prompts/kahani';
import { sample, STORY_OPENINGS, STORY_SETTINGS, storyBrief } from './story';
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
const tamil = STATION_BY_ID.ta as Station;
const marathi = STATION_BY_ID.mr as Station;
const gujarati = STATION_BY_ID.gu as Station;
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

describe('story quality gate', () => {
  const line = (role: string, text: string) => ({ role, text });

  it('passes a real radio play', () => {
    const play = [
      line('narrator', 'दादर स्टेशन, सुबह 9:12 की लोकल, और यहीं से शुरू हुआ टिफ़िन का राज़।'),
      line('char_a', 'मेहर, ये टिफ़िन फिर मेरी डेस्क पर कैसे?'),
      line('char_b', 'कबीर, मुझे क्या पता, मैं तो अभी आई हूँ।'),
      line('char_kid', 'दीदी, इसमें आलू पराठे हैं!'),
      line('narrator', 'और तभी शटर खड़का।'),
    ];
    expect(storyProblems(hindi, play)).toEqual([]);
  });

  it('rejects the old "today\'s story" announcement in every language', () => {
    const chars = [line('char_a', 'चलो।'), line('char_b', 'रुको!')];
    expect(storyProblems(hindi, [line('narrator', 'तरंग कहानी… आज की कहानी: टिफ़िन का राज़।'), ...chars]).some((p) => p.includes('stock story phrase'))).toBe(true);
    expect(storyProblems(tamil, [line('narrator', 'இன்றைய கதை: ரகசிய டிபன்.'), ...chars]).some((p) => p.includes('stock story phrase'))).toBe(true);
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

describe('story openings', () => {
  it('opens stories in many different ways and avoids the ones used recently', () => {
    const random = seeded(13);
    const openings = new Set(Array.from({ length: 60 }, () => storyBrief('hi', 'night', random).opening.id));
    expect(openings.size).toBe(STORY_OPENINGS.length);
    const recent = STORY_OPENINGS.slice(0, -1).map((o) => o.id);
    expect(storyBrief('hi', 'night', seeded(2), { openings: recent }).opening.id).toBe(STORY_OPENINGS[STORY_OPENINGS.length - 1].id);
  });
});

// ---- Casting -------------------------------------------------------------------------------------------------

const speakersOf = (cast: SerialCast) => Object.values(cast).map((v) => v!.speaker);

describe('serial casting', () => {
  it('keeps the evening RJ, the ad voices, the jingle and the newsreader out of a Hindi story', () => {
    const random = seeded(21);
    const evening = { localTime: '20:15', daypart: 'evening' as const };
    const banned = ['sunny_hi_reels', 'mukul_hi_ads', 'ritu_hi_ads_informal', 'ishita_hi_ads', 'simran_hi_news'];
    for (let i = 0; i < 60; i++) {
      const { cast, relaxed } = castSerial(hindi, { listener: evening, random });
      expect(castCharacters(cast)).toHaveLength(3);
      expect(relaxed).toEqual([]);
      for (const speaker of speakersOf(cast)) expect(banned).not.toContain(speaker);
    }
  });

  it('gives every role its own voice, on every station', () => {
    const random = seeded(5);
    for (const station of STATIONS) {
      for (let i = 0; i < 20; i++) {
        const speakers = speakersOf(castSerial(station, { hour: 20, random }).cast);
        expect(new Set(speakers).size, station.id).toBe(speakers.length);
      }
    }
  });

  it('never lets the RJ on air narrate, at any hour, on any station', () => {
    const random = seeded(8);
    for (const station of STATIONS) {
      for (const hour of [8, 13, 20, 23]) {
        for (let i = 0; i < 10; i++) {
          const { cast } = castSerial(station, { hour, random });
          expect(cast.narrator.speaker, `${station.id} at ${hour}`).not.toBe(rjVoiceAt(station, hour).speaker);
        }
      }
    }
  });

  it('tells 2-character stories where voices are scarce and 3-character ones in Hindi and Marathi', () => {
    const random = seeded(9);
    for (const [station, count] of [
      [hindi, 3],
      [marathi, 3],
      [tamil, 2],
      [STATION_BY_ID.bn as Station, 2],
      [gujarati, 2],
    ] as const) {
      for (let i = 0; i < 15; i++) expect(castCharacters(castSerial(station, { hour: 20, random }).cast), station.id).toHaveLength(count);
    }
  });

  it('gives ghost stories and night mysteries a suspense narrator', () => {
    const random = seeded(5);
    const spooky = hindi.storyPool!.spookyNarrators!.map((v) => v.speaker);
    for (let i = 0; i < 30; i++) expect(spooky).toContain(castSerial(hindi, { hour: 20, spooky: true, random }).cast.narrator.speaker);
  });

  it('keeps Tamil stories on the masculine voices that exist', () => {
    const random = seeded(10);
    for (let i = 0; i < 20; i++) {
      const { cast } = castSerial(tamil, { hour: 19, random });
      expect(Object.values(cast).every((v) => v!.gender === 'masculine')).toBe(true);
    }
  });

  it('only casts voices the speech endpoint allows', () => {
    for (const station of STATIONS) for (const v of storyVoices(station)) expect(CAST_SPEAKERS.has(v.speaker), v.speaker).toBe(true);
    const random = seeded(12);
    for (const station of STATIONS) for (const s of speakersOf(castSerial(station, { hour: 22, random }).cast)) expect(CAST_SPEAKERS.has(s)).toBe(true);
  });

  it('locks the cast for all parts: the record round-trips, and a stranger or a double is refused', () => {
    const random = seeded(14);
    for (const station of STATIONS) {
      const { cast } = castSerial(station, { hour: 20, random });
      const record = castRecord(cast);
      const back = castFromRecord(station, record);
      expect(back, station.id).toBeDefined();
      expect(castRecord(back!)).toEqual(record);
    }
    const { cast } = castSerial(hindi, { hour: 20, random });
    const record = castRecord(cast);
    expect(castFromRecord(hindi, { ...record, char_a: 'nobody_hi_fake' })).toBeUndefined();
    expect(castFromRecord(hindi, { ...record, char_a: record.narrator })).toBeUndefined();
    expect(castFromRecord(hindi, { char_a: record.char_a })).toBeUndefined();
    expect(castFromRecord(hindi, undefined)).toBeUndefined();
  });

  it('gives a kid role its kid pace when the cast is rebuilt', () => {
    const { cast } = castSerial(tamil, { hour: 20, random: seeded(3) });
    const back = castFromRecord(tamil, castRecord(cast))!;
    if (back.char_kid) expect(back.char_kid.pace).toBe(tamil.storyPool!.kids[0].pace);
  });
});

// ---- Prompts ----------------------------------------------------------------------------------------------------

function planFor(station: Station, seed = 4): StoryPlan {
  const brief = storyBrief(station.id, 'evening', seeded(seed));
  return { brief, cast: castSerial(station, { hour: 20, random: seeded(seed) }).cast };
}

const OUTLINE: SerialOutline = {
  title_native: 'हरी रेलिंग का चोर',
  setting_native: 'पुणे की एक रसोई, सुबह नौ बजे।',
  char_a_name_native: 'कबीर',
  char_a_who_en: "Meher's brother, 30",
  char_a_habit_native: 'कसम से',
  char_b_name_native: 'मेहर',
  char_b_who_en: "Kabir's sister, 32",
  char_b_habit_native: 'छोटे-छोटे वाक्य',
  char_kid_name_native: 'पीहू',
  char_kid_who_en: "Meher's daughter, 9",
  char_kid_habit_native: 'हर बात पर शर्त',
  offstage_en: 'none',
  relations_en: 'Kabir and Meher are siblings and use names; Pihu calls Kabir "मामा"',
  central_question_en: 'Who empties the tiffin every day?',
  clock_en: 'the tiffin must reach the office by 2 pm',
  clue_en: 'green paint on the lid (part 1)',
  red_herring_en: 'Pihu says she knows a secret',
  twist_en: 'SECRET-TWIST the thief is a stray cat that Pihu feeds',
  part1_goal_en: 'The tiffin is empty again; Kabir stands guard.',
  part1_last_line_native: 'ढक्कन पर हरा रंग लगा था, और रेलिंग पर दाल।',
  part1_last_role: 'narrator',
  part2_goal_en: 'They suspect the neighbour; he is cleared.',
  part2_last_line_native: 'तभी रेलिंग पर बैठी किसी ने पीहू का नाम लेकर म्याऊँ किया।',
  part2_last_role: 'narrator',
  part3_goal_en: 'The cat is found; it gets its own bowl.',
  payoff_en: 'SECRET-PAYOFF the cat gets its own bowl',
  payoff_native: 'उस दिन से रसोई में एक कटोरी बिल्ली के नाम की रखी जाने लगी।',
  final_line_native: 'अब से टिफ़िन में एक कटोरी बिल्ली के नाम की भी जाएगी।',
  final_line_role: 'char_a',
  opening: 'cold-open',
};

describe('Kahani outline prompt', () => {
  it('carries the seeds and asks for every ending up front', () => {
    const plan = planFor(hindi);
    const p = outlinePrompt(hindi, req(), plan);
    expect(p).toContain(`- Setting: ${plan.brief.setting}`);
    expect(p).toContain(`- At the centre: ${plan.brief.hook}`);
    expect(p).toContain(plan.brief.twist);
    expect(p).toContain('Write the three last lines in full');
    expect(p).toContain('relations_en');
    expect(outlineSystem(hindi)).toContain('Hindi');
  });

  it("puts a caller's theme at the heart and lists what already aired", () => {
    const p = outlinePrompt(hindi, req({ theme: 'भूतिया ट्रेन', recentStories: ['The Dented Tiffin: the thief was returning it'] }), planFor(hindi));
    expect(p).toContain('"भूतिया ट्रेन"');
    expect(p).toContain('- The Dented Tiffin: the thief was returning it');
  });

  it('marks roles the station cannot cast as not in the story, and Tamil as all-male', () => {
    const p = outlinePrompt(tamil, req({ station: 'ta' }), planFor(tamil));
    expect(p).toContain('not in this story');
    expect(p).toContain('Every voice on this station is male');
  });
});

describe('Kahani part prompts', () => {
  const cast = castSerial(hindi, { hour: 20, random: seeded(2) }).cast;
  const recap: RecapSource = {
    heard: 'Meher found her tiffin empty again; Kabir stood guard.',
    cliffhanger: 'Green paint on the lid, dal on the railing.',
    lastLines: [
      { role: 'char_a', text: 'ये ढक्कन पर कुछ लगा है, हल्का हरा सा।' },
      { role: 'narrator', text: 'ढक्कन पर हरा रंग लगा था, और रेलिंग पर दाल।' },
    ],
  };

  it('hides the twist in parts 1 and 2 and plays it in part 3', () => {
    for (const part of [1, 2] as const) {
      const p = partPrompt(hindi, OUTLINE, cast, part, recap);
      expect(p).not.toContain('SECRET-TWIST');
      expect(p).not.toContain('SECRET-PAYOFF');
      expect(p).toContain('hidden from you');
    }
    const p3 = partPrompt(hindi, OUTLINE, cast, 3, recap);
    expect(p3).toContain('SECRET-TWIST');
    expect(p3).toContain('SECRET-PAYOFF');
  });

  it("ends each part on the outline's line", () => {
    expect(partPrompt(hindi, OUTLINE, cast, 1)).toContain(OUTLINE.part1_last_line_native);
    expect(partPrompt(hindi, OUTLINE, cast, 2, recap)).toContain(OUTLINE.part2_last_line_native);
    expect(partPrompt(hindi, OUTLINE, cast, 3, recap)).toContain(OUTLINE.final_line_native);
  });

  it('recaps only from what aired, and part 1 has no recap', () => {
    const p2 = partPrompt(hindi, OUTLINE, cast, 2, recap);
    expect(p2).toContain('RECAP SOURCE');
    for (const l of recap.lastLines) expect(p2).toContain(l.text);
    expect(p2).toContain(recap.heard);
    expect(p2).toContain('पिछली बार');
    expect(partPrompt(hindi, OUTLINE, cast, 1, recap)).not.toContain('RECAP SOURCE');
  });

  it('names the cast and the relations, and opens part 1 the way the outline chose', () => {
    const p = partPrompt(hindi, OUTLINE, cast, 1);
    expect(p).toContain('char_a = कबीर');
    expect(p).toContain(OUTLINE.relations_en);
    expect(p).toContain('Cold open:');
    expect(p).toContain(`"${OUTLINE.title_native}"`);
  });

  it('speaks each language: all-male Tamil, pure Marathi and Gujarati, their own part and recap words', () => {
    const ta = castSerial(tamil, { hour: 20, random: seeded(2) }).cast;
    expect(partPrompt(tamil, OUTLINE, ta, 1)).toContain('Every voice is male');
    const mr = castSerial(marathi, { hour: 20, random: seeded(2) }).cast;
    const mr2 = partPrompt(marathi, OUTLINE, mr, 2, recap);
    expect(mr2).toContain('never Hindi words');
    expect(mr2).toContain('मागच्या भागात');
    const gu = castSerial(gujarati, { hour: 20, random: seeded(2) }).cast;
    const gu3 = partPrompt(gujarati, OUTLINE, gu, 3, recap);
    expect(gu3).toContain('never Hindi words');
    expect(gu3).toContain('ગયા ભાગમાં');
    expect(outlineSystem(gujarati)).toContain('never Hindi words');
    expect(partTitle('mr', 'गोष्ट', 2)).toBe('गोष्ट · भाग 2');
    expect(partTitle('gu', 'વાર્તા', 3)).toBe('વાર્તા · ભાગ 3');
    expect(partTitle('hi', 'कहानी', 1)).toBe('कहानी · कड़ी 1');
  });
});

describe('one complete story prompt', () => {
  it('asks for 16-18 lines with a planned last line and no outside context', () => {
    const p = oneShotPrompt(hindi, req(), planFor(hindi));
    expect(p).toContain('16-18 spoken lines');
    expect(p).toContain('last_line_native');
    expect(p).not.toContain('LOCAL PACK');
    expect(p).not.toContain('PREVIOUSLY ON AIR');
    expect(oneShotPrompt(tamil, req({ station: 'ta' }), planFor(tamil))).toContain('Every voice on this station is male');
  });
});

describe('flat schemas', () => {
  type Schema = { properties: Record<string, { type: string; enum?: string[]; items?: Schema }>; required: string[] };
  const cast = castSerial(hindi, { hour: 20, random: seeded(2) }).cast;

  function expectFlat(schema: Schema) {
    for (const [key, prop] of Object.entries(schema.properties)) {
      if (key === 'lines') {
        expect(prop.type).toBe('array');
        for (const item of Object.values(prop.items!.properties)) expect(item.type).toBe('string');
      } else expect(prop.type, key).toBe('string');
    }
    expect(schema.required).toEqual(Object.keys(schema.properties));
  }

  it('keeps every schema flat, with lines the only array', () => {
    const outline = outlineJsonSchema(cast) as unknown as Schema;
    expectFlat(outline);
    expect(outline.properties.lines).toBeUndefined();
    expectFlat(partJsonSchema(cast, false) as unknown as Schema);
    expectFlat(partJsonSchema(cast, true) as unknown as Schema);
    expectFlat(oneShotJsonSchema(cast, false) as unknown as Schema);
  });

  it('puts the endings before the parts and limits the role fields to the cast', () => {
    const outline = outlineJsonSchema(cast) as unknown as Schema;
    expect(outline.required.indexOf('final_line_native')).toBeGreaterThan(outline.required.indexOf('twist_en'));
    expect(outline.properties.part1_last_role.enum).toEqual(['narrator', ...castCharacters(cast)]);
    expect(outline.properties.final_line_role.enum).toEqual(castCharacters(cast));
    const ta = castSerial(tamil, { hour: 20, random: seeded(2) }).cast;
    const one = oneShotJsonSchema(ta, false) as unknown as Schema;
    expect(one.properties.last_line_role.enum).toEqual(castCharacters(ta));
    expect(one.properties.lines.items!.properties.role.enum).toEqual(['narrator', ...castCharacters(ta)]);
    expect(one.required.indexOf('last_line_native')).toBeLessThan(one.required.indexOf('lines'));
  });
});
