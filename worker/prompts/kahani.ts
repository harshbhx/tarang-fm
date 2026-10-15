/**
 * The Kahani (bible §4.4, prompt pack §6-7): a 3-part serial planned once by an outline call, then written
 * part by part toward fixed ending lines; or, for the shared live show, one complete story in one call.
 * Neither ever sees the show log, the city, the weather or the listener: a story needs only its own world.
 *
 * The writer knows the characters only by name: each line's "speaker" is a character's name in the station's
 * script (or "narrator"), and code maps names back to the cast's roles. A one-shot's names and relations are
 * fixed in code before the writer starts. Story rules live here, apart from the RJ's shared preamble.
 */
import { DELIVERIES } from '../../shared/constants';
import type { SegmentRequest } from '../../shared/schemas';
import type { RecapSource, Station, StationId } from '../../shared/types';
import { castCharacters, castSerial, type CharacterRole, type SerialCast } from '../casting';
import { fictionLocale, isSpooky, nativeName, STORY_CLICHES, STORY_NAMES, storyBrief, type StoryAvoid, type StoryBrief } from '../story';
import { EN_FIELD, languageName, LANGUAGE_STYLE, onAirName } from './common';

type Random = () => number;

// ---- Plans ------------------------------------------------------------------------------------------------

/** A one-shot's people, fixed in code: each role's name (station script), the relations, and who each kinship word means. */
export interface StoryPeople {
  names: Partial<Record<CharacterRole, string>>;
  relations: string;
  /** kinship word → the role it means (the kid calls char_a "मम्मी") */
  kin: Record<string, CharacterRole>;
}

/** Everything a Kahani is built from: its premise, its cast and the stories it must not repeat. */
export interface StoryPlan {
  brief: StoryBrief;
  cast: SerialCast;
  /** One-shots only: names and relations picked in code */
  people?: StoryPeople;
  /** Stories aired recently on this station by anyone (from the show memory) */
  aired?: string[];
  /** Normalized titles already aired; a repeat is rewritten */
  airedTitles?: ReadonlySet<string>;
}

export function storyPlan(station: Station, daypart: SegmentRequest['listener']['daypart'], avoid?: StoryAvoid, listener?: SegmentRequest['listener']): StoryPlan {
  const brief = storyBrief(station.id, daypart, Math.random, avoid);
  const cast = castSerial(station, { listener, spooky: isSpooky(brief.genre) }).cast;
  return { brief, cast, people: castPeople(station, cast, brief) };
}

/** The flat outline as it travels with the serial (role names, endings, clue, twist…). */
export type SerialOutline = Record<string, string>;

/** The roles in a story (narrator first) for a cast. */
export function storyRoles(cast: SerialCast): ('narrator' | CharacterRole)[] {
  return ['narrator', ...castCharacters(cast)];
}

// ---- Names and relations ------------------------------------------------------------------------------------

/** Names that carry a relation or an age ("Harish chacha", "Paati") make kinship and age clash with the cast. */
const KIN_NAME = /\s|^(aaji|paati|didima)$/iu;

/** The name choices for a gender, in the station's script where the table spells them. */
function nameChoices(station: StationId, latin: string[], gender: 'masculine' | 'feminine'): string[] {
  const all = [...latin, ...(STORY_NAMES[station]?.[gender] ?? [])].filter((n) => !KIN_NAME.test(n));
  const native = [...new Set(all.map((n) => nativeName(station, n)).filter((n): n is string => Boolean(n)))];
  return native.length >= 2 ? native : [...new Set(all)];
}

const pickOf = <T>(list: T[], random: Random): T => list[Math.floor(random() * list.length) % list.length];

/**
 * Names and relations for a one-shot, chosen in code: a distinct name per role (from the brief's fresh names,
 * in the station's script), how the adults know each other, and how the kid addresses them. Every kinship
 * word is quoted in the relations, so the kinship check allows exactly these and nothing else.
 */
export function castPeople(station: Station, cast: SerialCast, brief: StoryBrief, random: Random = Math.random): StoryPeople {
  const kin = fictionLocale(station.id).kin;
  const used = new Set<string>();
  const names: Partial<Record<CharacterRole, string>> = {};
  for (const role of castCharacters(cast)) {
    const gender = cast[role]!.gender === 'feminine' ? 'feminine' : 'masculine';
    const choices = nameChoices(station.id, brief.names[gender], gender).filter((n) => !used.has(n));
    const name = choices[0] ?? `${role}`;
    used.add(name);
    names[role] = name;
  }
  const A = names.char_a!;
  const B = names.char_b;
  const K = names.char_kid;
  const fa = cast.char_a.gender === 'feminine';
  const fb = cast.char_b?.gender === 'feminine';
  const out: string[] = [];
  const words: [string, CharacterRole][] = [];
  let married = false;
  if (B) {
    const options = ['siblings', 'neighbours', 'colleagues', 'friends', 'shop', ...(fa !== fb ? ['married'] : [])];
    const rel = pickOf(options, random);
    married = rel === 'married';
    const sibling = fa && fb ? 'sisters' : !fa && !fb ? 'brothers' : 'brother and sister';
    out.push(
      {
        siblings: `${A} and ${B} are ${sibling}; they call each other by name`,
        neighbours: `${A} and ${B} are neighbours in the same building; they use names`,
        colleagues: `${A} and ${B} work together; they use names`,
        friends: `${A} and ${B} are old school friends; they use names`,
        shop: `${A} runs a small shop and ${B} is a regular customer; they use names`,
        married: `${A} and ${B} are married; they call each other by name`,
      }[rel]!,
    );
  }
  if (K) {
    const child = cast.char_kid!.gender === 'feminine' ? 'daughter' : 'son';
    if (random() < 0.6) {
      const a = fa ? kin.mother : kin.father;
      out.push(`${K} is ${A}'s ${child} and calls ${A} "${a}"`);
      words.push([a, 'char_a']);
      if (B) {
        const b = married ? (fb ? kin.mother : kin.father) : fb ? kin.elderSister : kin.elderBrother;
        out.push(`${K} calls ${B} "${b}"`);
        words.push([b, 'char_b']);
      }
    } else {
      const a = fa ? kin.elderSister : kin.elderBrother;
      out.push(`${K} is the neighbours' ${child === 'son' ? 'boy' : 'girl'} and calls ${A} "${a}"`);
      words.push([a, 'char_a']);
      if (B) {
        const b = fb ? kin.elderSister : kin.elderBrother;
        out.push(`${K} calls ${B} "${b}"`);
        words.push([b, 'char_b']);
      }
    }
    out.push(`${A}${B ? ` and ${B}` : ''} call ${K} by name`);
  }
  // A word that means two people (both adults are "दीदी") can't tell the speaker apart: it is left out of the map
  const map: Record<string, CharacterRole> = {};
  for (const [w, role] of words) {
    if (map[w] && map[w] !== role) map[w] = '' as CharacterRole;
    else map[w] = role;
  }
  for (const w of Object.keys(map)) if (!map[w]) delete map[w];
  return { names, relations: `${out.join('; ')}. Nobody uses any other kinship word.`, kin: map };
}

/** A role's name in a story: the outline's (a serial) or code's (a one-shot). */
export function namesOf(outline: SerialOutline, cast: SerialCast): Partial<Record<CharacterRole, string>> {
  return Object.fromEntries(castCharacters(cast).map((r) => [r, (outline[`${r}_name_native`] ?? '').trim()]));
}

/** The speaker values of a story: "narrator", then each character's name (a role's id when it has no name). */
export function speakerValues(cast: SerialCast, names: Partial<Record<CharacterRole, string>> = {}): string[] {
  return ['narrator', ...castCharacters(cast).map((r) => names[r] || r)];
}

// ---- Shared pieces ------------------------------------------------------------------------------------------

const script = (station: Station) => LANGUAGE_STYLE[station.language]?.script ?? 'its own';

function personFor(role: CharacterRole, cast: SerialCast): string {
  const v = cast[role];
  if (!v) return 'not in this story';
  const f = v.gender === 'feminine';
  if (role === 'char_kid') return f ? 'a girl of about 10' : 'a boy of about 10';
  return f ? 'an adult woman' : 'an adult man';
}

const narratorWho = (cast: SerialCast) => `${cast.narrator.gender === 'feminine' ? 'female' : 'male'}, outside the story`;

/**
 * The system message for a story's lines: script and voice rules for a radio drama, and the voices by name.
 * The outline call has its own (outlineSystem); nothing here is the RJ's.
 */
export function storySystem(station: Station, cast: SerialCast, names: Partial<Record<CharacterRole, string>>): string {
  const lang = languageName(station);
  const style = LANGUAGE_STYLE[station.language];
  const voices = castCharacters(cast).map((r) => `- ${names[r] || r}: ${personFor(r, cast)}`);
  return `You write the Kahani, the radio drama on ${onAirName(station)}, in ${lang}. Every word in "text" is spoken aloud by a voice actor. Listeners can only hear: they know people by voice and name, and places by sound and detail.

Script rules (the voice breaks otherwise):
- ${lang} in ${script(station)} script, an English word only in Latin script. Never romanized ${lang}.
- ${style?.punctuation ?? 'End sentences with normal punctuation.'} "," for a short breath.
- Numbers and times as digits.
- Each line is 4-140 characters, at most 2 sentences.
- No SSML, emojis, hashtags, brackets, asterisks, speaker labels, stage directions or sound-effect notes in "text". If something happens, the narrator or a character says it.
- ${style?.gender ?? "Verb forms follow the speaker's gender."} Each character's gender is fixed by their voice.
- Family-friendly: a kid may be listening. No real brands, celebrities, films or politicians. No jokes about religion, caste, region, gender or body.
- Every line has "delivery": one of ${DELIVERIES.join(' | ')}.

THE VOICES (each line's "speaker" is exactly one of these values):
- narrator: ${narratorWho(cast)}
${voices.join('\n')}

Return only JSON matching the schema, in field order: the plan fields first.`;
}

/** Each role's voice, gender and name choices: a woman's voice never gets a man's name. */
function castBlock(station: Station, cast: SerialCast, brief: StoryBrief): string {
  const all = station.id === 'ta' ? '\nEvery voice on this station is male: all characters are men or boys.' : '';
  const row = (role: CharacterRole) => {
    const v = cast[role];
    if (!v) return `- ${role}: not in this story`;
    const gender = v.gender === 'feminine' ? 'feminine' : 'masculine';
    const names = nameChoices(station.id, brief.names[gender], gender).slice(0, 5);
    const pronoun = v.gender === 'feminine' ? 'her' : 'his';
    return `- ${role}: ${personFor(role, cast)}; ${pronoun} name is one of ${names.join(', ')} (spelt exactly so, in ${script(station)} script)`;
  };
  return `- narrator: ${narratorWho(cast)}
${row('char_a')}
${row('char_b')}
${row('char_kid')}
Two characters never share a name. Each character's gender is fixed by the voice: verbs and pronouns follow it.${all}`;
}

function airedBlock(plan: Pick<StoryPlan, 'aired'>, req: SegmentRequest): string {
  const list = [...new Set([...(plan.aired ?? []), ...(req.recentStories ?? [])])].slice(-12);
  return list.length ? list.map((t) => `- ${t}`).join('\n') : '- none yet';
}

function cliches(station: Station): string {
  return [...STORY_CLICHES.any, ...(STORY_CLICHES[station.id] ?? [])].join('; ');
}

function seeds(brief: StoryBrief, req: SegmentRequest): string {
  return `- Setting: ${brief.setting}
- At the centre: ${brief.hook}
- Twist type (a suggestion; use another fair twist if this one doesn't fit): ${brief.twist}
- Flavour for this hour: ${brief.genre}
- Listener's request: ${req.theme ? `"${req.theme}" (the heart of the story; bend the seeds to serve it)` : 'none'}`;
}

/** One set of native examples, chosen at random per call, and the two lines a story must never sound like. */
function examples(station: Station, random: Random = Math.random): string {
  const loc = fictionLocale(station.id);
  const set = pickOf(loc.storyExamples, random);
  const good = set.map((e) => `GOOD (${e.note}): ${e.role} · ${e.delivery} · "${e.text}"`).join('\n');
  const bad = loc.storyBad.map((e) => `BAD (${e.note}): "${e.text}"`).join('\n');
  return `Examples (style only. Never copy wording, objects or names):
${good}
${bad}`;
}

function writingRules(station: Station, short = false): string {
  const loc = fictionLocale(station.id);
  const lang = languageName(station);
  const core = `- Every line is ${lang} in ${script(station)} script, narration included. English only for single everyday words (phone, tiffin, race). Never an English sentence.
- "speaker" is whoever says the words aloud. Nobody says their own name, and nobody calls themself by a kinship word: a line spoken TO someone is said by someone else. A line that says what someone does or feels is the narrator's.
- "text" is only what the voice says aloud: never a description of an action ("she hugs him and smiles") and never a stage direction.
- Names early: before any character's second line ends, someone else (or the narrator) has said that character's name.
- Kinship words (mother, father, grandmother, uncle…) only as RELATIONS gives them; everyone else uses names.`;
  if (short) return core;
  return `${core}
- Dialogue carries the story. The narrator sets place and sound, never explains a feeling the dialogue shows, never summarises the twist.
- At least one sound, said in words by the narrator or reacted to by a character. No sound-effect tags.
- Every character sounds different: their way of talking at most twice, and their own rhythm (one in short bursts, one in long worried sentences).
- Every line moves the story: a discovery, a lie, a mistake, a deadline. Concrete beats general: a number, a name, an object, a time.
- Keep it simple and logical: every line follows from the one before, and a listener hearing it once can retell it. No new mysteries the story never answers.
- No line starts with a filler (${loc.fillers.join(', ')}); at most 3 fillers in all.
- ${loc.dialogue}
- Never: ${cliches(station)}; the station, the RJ or the listener; a moral; the temperature or today's weather.
- Family-safe: spooky is fine, gore is not; nobody dies; the kid is safe.
- Delivery: narrator "dramatic" or "warm"; secrets "hushed"; scares "shout" (at most 2); panic "fast"; tender moments "sad" or "warm"; most lines "normal".`;
}

function lineItems(speakers: string[], subtitles: boolean): Record<string, unknown> {
  return {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['speaker', 'text', ...(subtitles ? ['en'] : []), 'delivery'],
      properties: {
        speaker: { type: 'string', enum: speakers },
        text: { type: 'string' },
        ...(subtitles ? EN_FIELD : {}),
        delivery: { type: 'string', enum: [...DELIVERIES] },
      },
    },
  };
}

/** A flat schema: string fields in order (enums where given), with `lines` where it belongs. */
function flatSchema(fields: string[], enums: Record<string, string[]>, lines?: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: fields,
    properties: Object.fromEntries(
      fields.map((k) => [k, k === 'lines' ? lines : enums[k] ? { type: 'string', enum: enums[k] } : { type: 'string' }]),
    ),
  };
}

// ---- §6 The outline call (once per serial) --------------------------------------------------------------------

/** Outline fields in thinking order: the endings are written before any part. */
export const OUTLINE_FIELDS = [
  'plan_why',
  'title_native',
  'logline_en',
  'setting_native',
  'char_a_name_native',
  'char_a_who_en',
  'char_a_want_en',
  'char_a_habit_native',
  'char_b_name_native',
  'char_b_who_en',
  'char_b_want_en',
  'char_b_habit_native',
  'char_kid_name_native',
  'char_kid_who_en',
  'char_kid_habit_native',
  'offstage_en',
  'relations_en',
  'central_question_en',
  'clock_en',
  'clue_en',
  'red_herring_en',
  'twist_en',
  'part1_goal_en',
  'part1_last_line_native',
  'part1_last_role',
  'part2_goal_en',
  'part2_last_line_native',
  'part2_last_role',
  'part3_goal_en',
  'payoff_en',
  'payoff_native',
  'final_line_native',
  'final_line_role',
  'tease_native',
] as const;

export function outlineJsonSchema(cast: SerialCast): Record<string, unknown> {
  const roles = storyRoles(cast);
  return flatSchema([...OUTLINE_FIELDS], { part1_last_role: roles, part2_last_role: roles, final_line_role: roles.filter((r) => r !== 'narrator') });
}

export function outlineSystem(station: Station): string {
  const lang = languageName(station);
  return `You are the head writer of the 3-part Kahani radio serial on ${onAirName(station)}, in ${lang}. Each part is about 90 seconds: 12-16 spoken lines. Listeners can only hear: they know people by voice and name, and places by sound and detail. You plan the serial; a scene writer turns your plan into the three parts, so every field must be concrete and usable, and the three parts must add up to one story that makes sense.
Fields ending in _native are written in ${lang}: ${script(station)} script, English words in Latin script, numbers as digits, sentences ending with "${fictionLocale(station.id).punct}". All other fields are short English.
${fictionLocale(station.id).dialogue}
No real brands, celebrities, films or politicians. Family-safe: spooky is fine, gore is not, nobody dies, the kid is safe.
Return only JSON matching the schema, in field order.`;
}

export function outlinePrompt(station: Station, req: SegmentRequest, plan: StoryPlan): string {
  const { brief, cast } = plan;
  return `SEEDS (connect them; you may bend a seed so they fit, and say how in plan_why):
${seeds(brief, req)}

CAST (fixed voices; invent people who fit them):
${castBlock(station, cast, brief)}

ALREADY AIRED (differ in premise, place, names and twist):
${airedBlock(plan, req)}
NEVER USE: ${cliches(station)}

Languages, field by field:
- Every field ending in _native is ${languageName(station)} in ${script(station)} script, names included (a name from the list, spelt exactly as given). Never English sentences in a _native field.
- The three ending lines and payoff_native are words a voice says aloud on air: dialogue (or one narrator sentence), never a description of an action like "she hugs him and smiles".
- Fields ending in _en are short English notes for the scene writer. char_*_who_en: age, job, and relation to the others. char_*_habit_native: a short phrase this person keeps saying, never an action.

Plan rules:
- plan_why comes first: the whole serial in 4 plain sentences (who wants what by when; what goes wrong in part 1; how it gets worse in part 2; the twist and the ending in part 3). Everything else follows it.
- Keep it simple: one place, one object, one want. A listener hears it once, at radio speed; if it needs explaining, it is too complicated.
- One central question a 10-year-old could repeat.
- One want with a clock: someone needs something by a stated time.
- The clue is audible and concrete (a sound, a word, a number, a smell someone names). It is planted in part 1 or 2, inside an ordinary line.
- The twist is fair: it re-explains what we heard, through the clue. No dream, no new character in part 3, no "it was all a misunderstanding" without the clue.
- Every part ends on a NEW concrete fact. Part 1 opens the question; part 2 makes it worse or personal; part 3 resolves it and ends on a smile or a one-line moral in a character's own words (never a question, never "the lesson is").
- The want, the clue and the twist belong to the same story: the twist explains the central question, and the payoff answers it. A listener who heard all 3 parts can retell it in two sentences.
- Write the three last lines in full now, each at most 20 words, with who says them (*_role). The scene writer ends each part on them. A character's ending line never calls out that character's own name. payoff_native is one narrator line that plays the payoff (not a summary like "everyone was happy"). final_line_native is a character's own spoken words.
- relations_en says who calls whom what, with each kinship word in ${script(station)} script in single quotes, in the form: <name> calls <name> '<word>'. People who are not family are neighbours, colleagues or strangers: they use names.
- Never put a double quote (") inside any value: use single quotes.
- Fields for a role marked "not in this story" are "none"; never give that role lines or a name.
- tease_native: one true, spoiler-free line the RJ may say before part 1 (at most 14 words).`;
}

// ---- §7 The part calls ---------------------------------------------------------------------------------------

export const PART_FIELDS = ['plan_scene', 'plan_names', 'plan_turn', 'lines', 'summary_en', 'cliffhanger_en'] as const;

/** A part's schema: each line's speaker is "narrator" or a character's name from the outline. */
export function partJsonSchema(cast: SerialCast, subtitles: boolean, outline?: SerialOutline): Record<string, unknown> {
  return flatSchema([...PART_FIELDS], {}, lineItems(speakerValues(cast, outline ? namesOf(outline, cast) : {}), subtitles));
}

/** How part 1 (or a one-shot) opens; described without quotable wording, so nothing here gets read aloud. */
const PART_OPENINGS: { id: string; how: string }[] = [
  { id: 'cold-open', how: 'line 1 is a character mid-sentence, already in trouble, before any narration' },
  { id: 'overheard', how: 'lines 1-2 are two characters arguing or whispering mid-scene, as if we walked in on them' },
  { id: 'note-read-aloud', how: 'line 1 is a character reading a short note or message aloud; the trouble is in it' },
  { id: 'ending-first', how: 'line 1 is the narrator giving the strange last moment of the story without explaining it; line 2 goes back to how it began' },
];

/** A part-1 opening style, kept in the outline so a retry opens the same way. */
export function pickOpening(avoid: Iterable<string> = []): string {
  const used = new Set(avoid);
  const fresh = PART_OPENINGS.filter((o) => !used.has(o.id));
  return (fresh.length ? fresh : PART_OPENINGS)[Math.floor(Math.random() * (fresh.length || PART_OPENINGS.length))].id;
}

/** The ending line each part writes toward. */
export function expectedLast(outline: SerialOutline, part: 1 | 2 | 3): { text: string; role?: string } {
  if (part === 3) return { text: outline.final_line_native ?? '', role: outline.final_line_role };
  return { text: outline[`part${part}_last_line_native`] ?? '', role: outline[`part${part}_last_role`] };
}

function outlineBlock(outline: SerialOutline, part: 1 | 2 | 3): string {
  const rows = [
    `- setting: ${outline.setting_native}`,
    `- central question: ${outline.central_question_en}`,
    `- clock: ${outline.clock_en}`,
    `- clue: ${outline.clue_en}`,
    `- red herring: ${outline.red_herring_en}`,
    part === 3 ? `- twist: ${outline.twist_en}` : '- twist: hidden from you in this part; don\'t hint at it beyond the clue',
    part === 3 ? `- payoff: ${outline.payoff_en}` : '',
    `- part 1: ${outline.part1_goal_en}`,
    `- part 2: ${outline.part2_goal_en}`,
    `- part 3: ${outline.part3_goal_en}`,
    outline.offstage_en && !/^none$/i.test(outline.offstage_en) ? `- talked about, never speaks: ${outline.offstage_en}` : '',
  ];
  return rows.filter(Boolean).join('\n');
}

/** The speaker value for a role, as the writer knows it. */
const speakerOf = (role: string | undefined, names: Partial<Record<string, string>>) => (!role || role === 'narrator' ? 'narrator' : names[role] || role);

function partCast(outline: SerialOutline, cast: SerialCast): string {
  const names = namesOf(outline, cast);
  const rows = castCharacters(cast).map(
    (role) => `- ${names[role]}: ${personFor(role, cast)}, ${outline[`${role}_who_en`]}; their way of talking: ${outline[`${role}_habit_native`]}`,
  );
  return `- narrator: ${narratorWho(cast)}; 2-5 lines in this part
${rows.join('\n')}`;
}

function recapBlock(recap: RecapSource, names: Partial<Record<string, string>>): string {
  const last = recap.lastLines.length ? recap.lastLines.map((l) => `  ${speakerOf(l.role, names)}: ${l.text}`).join('\n') : '  (not available)';
  return `RECAP SOURCE (what the listener actually heard last time; recap only from this):
- heard: ${recap.heard || 'see the last lines'}
- it ended on: ${recap.cliffhanger || 'see the last lines'}
- its last lines:
${last}`;
}

function partBeats(station: Station, outline: SerialOutline, part: 1 | 2 | 3): string {
  const recap = fictionLocale(station.id).recap;
  if (part === 1) {
    const opening = PART_OPENINGS.find((o) => o.id === outline.opening) ?? PART_OPENINGS[0];
    return `1-2. Cold open: ${opening.how}. A character is named in line 1 or 2.
3. Narrator: the place, the time, one sensory detail, and the title "${outline.title_native}" said in passing (never announced).
4-9. The want against the clock. The other characters enter, by name. A first try fails.
10-13. A complication. The clue (${outline.clue_en}) slips by inside an ordinary line.
Last. The ending line below.`;
  }
  if (part === 2) {
    return `1. Narrator recap: ONE full sentence that starts "${recap}" and says in your own words what happened (from RECAP SOURCE only). Never repeat a line from RECAP SOURCE word for word.
2-4. Pick up exactly where part 1 ended, with new lines.
5-11. A plan, then it goes wrong (or the obvious suspect is cleared). The clock gets tighter. The clue or the red herring passes by.
Last. The ending line below: worse than part 1's.`;
  }
  return `1. Narrator recap: ONE full sentence that starts "${recap}" and says in your own words what happened (from RECAP SOURCE only). Never repeat a line from RECAP SOURCE word for word.
2-7. The confrontation. Someone says the clue out loud again, so the listener connects it.
8-11. The twist, discovered in dialogue: ${outline.twist_en}
12-15. The payoff, played in dialogue: ${outline.payoff_en}
Last. The ending line below. It is never a question.`;
}

/**
 * A part's task. `short` is the rescue prompt, sent once when a rewrite timed out: the same story, ending and
 * shape with only the core rules (no examples, no field notes beyond one line each).
 */
export function partPrompt(station: Station, outline: SerialOutline, cast: SerialCast, part: 1 | 2 | 3, recap?: RecapSource, opts: { short?: boolean; lines?: number } = {}): string {
  const end = expectedLast(outline, part);
  const names = namesOf(outline, cast);
  const head = `SERIAL: "${outline.title_native}" · part ${part} of 3 · about 90 seconds
OUTLINE (fixed: never change the names, relations, clue or twist):
${outlineBlock(outline, part)}

CAST (each line's "speaker" is exactly one of these):
${partCast(outline, cast)}
RELATIONS (kinship words only as written here): ${outline.relations_en}
${part > 1 && recap ? `\n${recapBlock(recap, names)}\n` : ''}
THIS PART'S JOB: ${outline[`part${part}_goal_en`]}
IT ENDS ON THIS LINE (speaker ${speakerOf(end.role, names)}; make it the very last line, adjusting the wording only to fit): "${end.text}"

Write 12-${opts.lines ?? 16} lines (never more than ${opts.lines ?? 16}) in this shape:
${partBeats(station, outline, part)}

Rules:
${writingRules(station, opts.short)}
- Mention the clock (${outline.clock_en}) at least once.`;
  if (opts.short) {
    return `${head}

plan_scene, plan_names, plan_turn: one short English line each. summary_en: what THESE lines told, past tense. cliffhanger_en: the situation at the last line ("resolved" for part 3).`;
  }
  return `${head}

plan_scene: where and when this part happens, in one line.
plan_names: who is named by whom in which line (e.g. "${names.char_a} named by ${names.char_b ?? names.char_kid ?? 'the narrator'} in line 1").
plan_turn: what changes in the middle of this part.
summary_en: what the listener heard in THESE lines only, past tense, 1-2 sentences. Leave out anything from the outline that isn't in the lines.
cliffhanger_en: the exact situation at the last line ("resolved" for part 3).

${examples(station)}`;
}

// ---- One complete story (the shared live show) -------------------------------------------------------------------

/** The beats a one-shot plans in the station language and must play, in order. */
export const ONE_SHOT_BEATS = ['want', 'obstacle', 'twist', 'payoff'] as const;

export const ONE_SHOT_FIELDS = [
  'plan_story_en',
  'plan_want_native',
  'plan_obstacle_native',
  'plan_twist_native',
  'plan_payoff_native',
  'last_line_native',
  'last_line_role',
  'title',
  'lines',
  'summary_en',
] as const;

export function oneShotJsonSchema(cast: SerialCast, subtitles: boolean, people?: StoryPeople): Record<string, unknown> {
  const speakers = speakerValues(cast, people?.names);
  return flatSchema([...ONE_SHOT_FIELDS], { last_line_role: speakers.filter((r) => r !== 'narrator') }, lineItems(speakers, subtitles));
}

/** A one-shot's task. `short` is the rescue prompt (see partPrompt). */
export function oneShotPrompt(station: Station, req: SegmentRequest, plan: StoryPlan, opts: { short?: boolean } = {}): string {
  const { brief, cast } = plan;
  const people = plan.people ?? castPeople(station, cast, brief);
  const lang = languageName(station);
  const opening = PART_OPENINGS.find((o) => o.id === brief.opening.id) ?? PART_OPENINGS[0];
  const all = station.id === 'ta' ? '\nEvery voice on this station is male: all characters are men or boys.' : '';
  const castRows = castCharacters(cast).map((r) => `- ${people.names[r]}: ${personFor(r, cast)}`);
  const head = `Write one complete radio play in ${lang}: 16-18 spoken lines, about 2 minutes, with a beginning, a middle and an ending that pays off. It airs straight after the RJ hands over, so it needs no introduction: drop the listener into it.

SEEDS (connect them; you may bend a seed so they fit):
${seeds(brief, req)}

CAST (fixed; each line's "speaker" is exactly one of these):
- narrator: ${narratorWho(cast)}
${castRows.join('\n')}${all}
RELATIONS (fixed; kinship words only as written here): ${people.relations}
${opts.short ? '' : `\nSTORIES ALREADY ON AIR (this one must differ in premise, place, title and twist):\n${airedBlock(plan, req)}\n`}
Plan first, in these fields (before any line):
- plan_story_en: the whole story in 3 plain English sentences a 10-year-old could follow.
- The four beats, each ONE short ${lang} sentence with its key object or name, in ${script(station)} script. Each beat must then be played in the lines, in this order:
  - plan_want_native: who wants what, by what time.
  - plan_obstacle_native: what stands in the way, and the first try that fails.
  - plan_twist_native: the surprise that turns it around, proved by a clue planted early (a sound, a word, a number). Fair: no dream, no new character at the end.
  - plan_payoff_native: how the want is won, lost or turned around.
- last_line_native: the very last line, written in full now in ${lang}: a smile or a one-line moral in a character's own spoken words (at most 14 words, never a question, never a description of an action, never the speaker's own name).
- last_line_role: who says it.

Then write the lines in this shape:
1-2. Cold open: ${opening.how}. A character is named in line 1 or 2.
3. Narrator: the place, the time, one sensory detail, and the title said in passing (never announced).
4-7. THE WANT against the clock. The others enter, by name. THE OBSTACLE: a first try fails. The clue slips by inside an ordinary line.
8-11. It gets worse: a complication or the wrong suspect, the clock tighter.
12-15. THE TWIST, discovered in dialogue (someone says the clue out loud again, so the listener connects it). Then THE PAYOFF, played in dialogue.
Last. last_line_native, as the very last line. The story is finished: nothing is left hanging.

Rules:
${writingRules(station, opts.short)}

title: 2-5 intriguing words in ${lang} (no "the mystery", "the ghost").
summary_en: what the listener heard, past tense, 1-2 sentences: who wanted what, the twist, how it ended. Only what is in the lines.`;
  return opts.short ? head : `${head}\n\n${examples(station)}`;
}

/** The legacy single-call prompt (segmentMessages): one complete story. */
export function kahaniPrompt(station: Station, req: SegmentRequest, plan: StoryPlan): string {
  return oneShotPrompt(station, req, plan);
}

/** Kahani fields filled before the lines in the legacy single-call path (see PLAN_FIELDS in ./index). */
export const KAHANI_PLAN_FIELDS: string[] = ONE_SHOT_FIELDS.slice(0, ONE_SHOT_FIELDS.indexOf('title'));

/** The part word on air ("कड़ी"), for the now-playing title. */
export function partTitle(station: StationId, title: string, part: number): string {
  return `${title} · ${fictionLocale(station).partWord} ${part}`;
}
