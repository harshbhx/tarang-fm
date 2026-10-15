/**
 * The Kahani (bible §4.4, prompt pack §6-7): a 3-part serial planned once by an outline call, then written
 * part by part toward fixed ending lines; or, for the shared live show, one complete story in one call.
 * Neither ever sees the show log, the city, the weather or the listener: a story needs only its own world.
 */
import { DELIVERIES } from '../../shared/constants';
import type { SegmentRequest } from '../../shared/schemas';
import type { RecapSource, Station, StationId } from '../../shared/types';
import { castCharacters, castSerial, type CharacterRole, type SerialCast } from '../casting';
import { fictionLocale, isSpooky, STORY_CLICHES, storyBrief, type StoryAvoid, type StoryBrief } from '../story';
import { EN_FIELD, languageName, LANGUAGE_STYLE, onAirName } from './common';

// ---- Plans ------------------------------------------------------------------------------------------------

/** Everything a Kahani is built from: its premise, its cast and the stories it must not repeat. */
export interface StoryPlan {
  brief: StoryBrief;
  cast: SerialCast;
  /** Stories aired recently on this station by anyone (from the show memory) */
  aired?: string[];
  /** Normalized titles already aired; a repeat is rewritten */
  airedTitles?: ReadonlySet<string>;
}

export function storyPlan(station: Station, daypart: SegmentRequest['listener']['daypart'], avoid?: StoryAvoid, listener?: SegmentRequest['listener']): StoryPlan {
  const brief = storyBrief(station.id, daypart, Math.random, avoid);
  return { brief, cast: castSerial(station, { listener, spooky: isSpooky(brief.genre) }).cast };
}

/** The flat outline as it travels with the serial (role names, endings, clue, twist…). */
export type SerialOutline = Record<string, string>;

/** The roles in a story (narrator first) for a cast. */
export function storyRoles(cast: SerialCast): ('narrator' | CharacterRole)[] {
  return ['narrator', ...castCharacters(cast)];
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

/** Names that carry a relation or an age ("Harish chacha", "Paati") make kinship and age clash with the cast. */
const KIN_NAME = /\s|^(aaji|paati|didima)$/iu;

function namesFor(list: string[]): string[] {
  const plain = list.filter((n) => !KIN_NAME.test(n));
  return plain.length >= 2 ? plain : list;
}

/** Each role's voice, gender and name choices: a woman's voice never gets a man's name. */
function castBlock(station: Station, cast: SerialCast, brief: StoryBrief): string {
  const all = station.id === 'ta' ? '\nEvery voice on this station is male: all characters are men or boys.' : '';
  const row = (role: CharacterRole) => {
    const v = cast[role];
    if (!v) return `- ${role}: not in this story`;
    const names = namesFor(v.gender === 'feminine' ? brief.names.feminine : brief.names.masculine);
    const pronoun = v.gender === 'feminine' ? 'her' : 'his';
    return `- ${role}: ${personFor(role, cast)}; ${pronoun} name is one of ${names.join(', ')} (written in ${script(station)} script)`;
  };
  return `- narrator: ${cast.narrator.gender === 'feminine' ? 'female' : 'male'}, outside the story
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

function examples(station: Station): string {
  const loc = fictionLocale(station.id);
  const set = loc.storyExamples[Math.floor(Math.random() * loc.storyExamples.length)];
  const good = set.map((e) => `GOOD (${e.note}): ${e.role} · ${e.delivery} · "${e.text}"`).join('\n');
  return `Examples (style only. Never copy wording, objects or names):
${good}
BAD: a stub anyone could say, like "Hey, what's this?" (tells us nothing)
BAD: the narrator summarising the payoff, like "And then everyone learned the truth and was happy." (play it, don't tell it)`;
}

function writingRules(station: Station): string {
  const loc = fictionLocale(station.id);
  const lang = languageName(station);
  return `- Every line is ${lang} in ${script(station)} script, narration included. English only for single everyday words (phone, tiffin, race). Never an English sentence.
- "text" is only what the voice says aloud: never a description of an action ("she hugs him and smiles") and never a stage direction.
- Names early: before any character's second line ends, the listener has heard that character's name. Someone says it to them, or the narrator does. Nobody says their own name to themselves.
- The role is the person saying the words. A line that describes what someone does or feels belongs to the narrator. A character uses a kinship word (मम्मी, चाचा…) only for the person RELATIONS gives it to.
- Kinship words (father, mother, grandmother, uncle…) only as RELATIONS defines them; everyone else uses names.
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

function lineItems(roles: string[], subtitles: boolean): Record<string, unknown> {
  return {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['role', 'text', ...(subtitles ? ['en'] : []), 'delivery'],
      properties: {
        role: { type: 'string', enum: roles },
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
- Every field ending in _native is ${languageName(station)} in ${script(station)} script, names included (e.g. a name from the list, spelt in ${script(station)}). Never English sentences in a _native field.
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
- Write the three last lines in full now, each at most 20 words, with who says them (*_role). The scene writer ends each part on them. payoff_native is one narrator line that plays the payoff (not a summary like "everyone was happy"). final_line_native is a character's own spoken words.
- relations_en says who calls whom what, with each kinship word in ${script(station)} script in quotes (e.g. Tara calls Kamla "दादी"). People who are not family are "neighbours", "colleagues" or "strangers": they use names.
- Fields for a role marked "not in this story" are "none"; never give that role lines or a name.
- tease_native: one true, spoiler-free line the RJ may say before part 1 (at most 14 words).`;
}

// ---- §7 The part calls ---------------------------------------------------------------------------------------

export const PART_FIELDS = ['plan_scene', 'plan_names', 'plan_turn', 'lines', 'summary_en', 'cliffhanger_en'] as const;

export function partJsonSchema(cast: SerialCast, subtitles: boolean): Record<string, unknown> {
  return flatSchema([...PART_FIELDS], {}, lineItems(storyRoles(cast), subtitles));
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

function partCast(outline: SerialOutline, cast: SerialCast): string {
  const row = (role: CharacterRole) =>
    cast[role]
      ? `- ${role} = ${outline[`${role}_name_native`]} (${personFor(role, cast)}), ${outline[`${role}_who_en`]}; their way of talking: ${outline[`${role}_habit_native`]}`
      : `- ${role} is not in this story: never use it`;
  return `- narrator (${cast.narrator.gender === 'feminine' ? 'female' : 'male'}): outside the story; 2-5 lines in this part
${row('char_a')}
${row('char_b')}
${row('char_kid')}`;
}

function recapBlock(recap: RecapSource): string {
  const last = recap.lastLines.length ? recap.lastLines.map((l) => `  ${l.role}: ${l.text}`).join('\n') : '  (not available)';
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

export function partPrompt(station: Station, outline: SerialOutline, cast: SerialCast, part: 1 | 2 | 3, recap?: RecapSource): string {
  const end = expectedLast(outline, part);
  return `SERIAL: "${outline.title_native}" · part ${part} of 3 · about 90 seconds
OUTLINE (fixed: never change the names, relations, clue or twist):
${outlineBlock(outline, part)}

CAST (speak only through these roles):
${partCast(outline, cast)}
RELATIONS (kinship words only as written here): ${outline.relations_en}
${part > 1 && recap ? `\n${recapBlock(recap)}\n` : ''}
THIS PART'S JOB: ${outline[`part${part}_goal_en`]}
IT ENDS ON THIS LINE (spoken by ${end.role ?? 'the character it fits'}; make it the very last line, adjusting the wording only to fit): "${end.text}"

Write 12-16 lines in this shape:
${partBeats(station, outline, part)}

Rules:
${writingRules(station)}
- Mention the clock (${outline.clock_en}) at least once.

plan_scene: where and when this part happens, in one line.
plan_names: who is named in which line (e.g. "Ishaan named by Tara in line 1; Tara named by the narrator in line 3").
plan_turn: what changes in the middle of this part.
summary_en: what the listener heard in THESE lines only, past tense, 1-2 sentences. Leave out anything from the outline that isn't in the lines.
cliffhanger_en: the exact situation at the last line ("resolved" for part 3).

${examples(station)}`;
}

// ---- One complete story (the shared live show) -------------------------------------------------------------------

export const ONE_SHOT_FIELDS = [
  'plan_story_en',
  'char_a_name_native',
  'char_b_name_native',
  'char_kid_name_native',
  'relations_en',
  'plan_want',
  'plan_clue',
  'plan_twist',
  'plan_payoff',
  'last_line_native',
  'last_line_role',
  'title',
  'lines',
  'summary_en',
] as const;

export function oneShotJsonSchema(cast: SerialCast, subtitles: boolean): Record<string, unknown> {
  const roles = storyRoles(cast);
  return flatSchema([...ONE_SHOT_FIELDS], { last_line_role: roles.filter((r) => r !== 'narrator') }, lineItems(roles, subtitles));
}

export function oneShotPrompt(station: Station, req: SegmentRequest, plan: StoryPlan): string {
  const { brief, cast } = plan;
  const opening = PART_OPENINGS.find((o) => o.id === brief.opening.id) ?? PART_OPENINGS[0];
  return `Write one complete radio play in ${languageName(station)}: 16-18 spoken lines, about 2 minutes, with a beginning, a middle and an ending that pays off. It airs straight after the RJ hands over, so it needs no introduction: drop the listener into it.

SEEDS (connect them; you may bend a seed so they fit):
${seeds(brief, req)}

CAST (fixed voices; invent people who fit them):
${castBlock(station, cast, brief)}

STORIES ALREADY ON AIR (this one must differ in premise, place, names, title and twist):
${airedBlock(plan, req)}

Plan first, in these fields (before any line):
- plan_story_en: the whole story in 3 plain English sentences a 10-year-old could follow: who wants what by when; what goes wrong; the twist and how it ends. Everything else follows this.
- char_a_name_native, char_b_name_native, char_kid_name_native: each character's name in ${script(station)} script ("none" for a role not in this story).
- relations_en: who calls whom what, with each kinship word in ${script(station)} script in quotes; people who are not family use names.
- plan_want: who wants what, by what time.
- plan_clue: the audible clue (a sound, a word, a number), planted early inside an ordinary line.
- plan_twist: the twist, and how the clue proves it. Fair: no dream, no new character at the end.
- plan_payoff: how the want is resolved or turned around.
- last_line_native: the very last line, written in full now in ${languageName(station)}: a smile or a one-line moral in a character's own spoken words (at most 14 words, never a question, never a description of an action).
- last_line_role: who says it.

Then write the lines in this shape:
1-2. Cold open: ${opening.how}. A character is named in line 1 or 2.
3. Narrator: the place, the time, one sensory detail, and the title said in passing (never announced).
4-7. The want against the clock. The others enter, by name. A first try fails. The clue slips by inside an ordinary line.
8-11. It gets worse: a complication or the wrong suspect, the clock tighter.
12-15. The twist, discovered in dialogue (someone says the clue out loud again, so the listener connects it). Then the payoff, played in dialogue.
Last. last_line_native, as the very last line. The story is finished: nothing is left hanging.

Rules:
${writingRules(station)}

title: 2-5 intriguing words in ${languageName(station)} (no "the mystery", "the ghost").
summary_en: what the listener heard, past tense, 1-2 sentences: who wanted what, the twist, how it ended. Only what is in the lines.

${examples(station)}`;
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
