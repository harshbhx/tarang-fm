/** Script validators from the prompt pack: a failed check triggers one retry at a lower temperature. */
import type { Station } from '../shared/types';
import { STORY_BANNED } from './story';
import type { LlmSegmentType } from './prompts';

export interface ScriptLine {
  role: string;
  text: string;
  delivery?: string;
}

/** Common romanized Hindi words; any of them on a Hindi line means the voice will mangle it. */
const ROMANIZED_HINDI = /\b(aap|hai|hain|kya|nahi|yaar|mein|hum|tum|kaise|accha)\b/i;

const BANNED_HI = ['चलिए जानते हैं', 'आइए नज़र डालते हैं', 'उम्मीद है आपको पसंद आया होगा', 'इस रोमांचक सफ़र में', 'आज के डिजिटल युग में', 'दोस्तों, आज हम बात करेंगे'];

/** Fragments of the prompt's own example lines: the model tends to copy them verbatim, which makes every show sound the same. */
const EXAMPLE_FRAGMENTS = [
  'हवेली का दरवाज़ा अभी तक',
  'दरवाज़ा है, जो सिर्फ़ रात को खुलता',
  'जो सिर्फ़ रात को खुलता है',
  'seat पे बैठना अब adventure sport',
  'seat अब adventure sport',
  'अब आ रही है कहानी',
  'हवेली की पुरानी घड़ी अचानक रुक गई',
  'आख़िरी twist अभी तक दिमाग में घूम',
];

const normalize = (t: string) => t.replace(/[़\s]/gu, '');

/** True when a line reuses one of the prompt's example lines. */
export function copiesExample(text: string): boolean {
  const n = normalize(text);
  return EXAMPLE_FRAGMENTS.some((f) => n.includes(normalize(f)));
}

/** Lines longer than this are rejected; 140–200 is split into two lines later instead. */
const HARD_MAX_CHARS = 200;

function digitsIn(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/g)?.map((d) => d.replace(/,/g, '')) ?? [];
}

/** Returns the problems found; an empty list means the script passes. */
export function validateScript(
  station: Station,
  type: LlmSegmentType,
  lines: ScriptLine[],
  opts: { greet?: boolean; listenerName?: string; headlinesText?: string; timePhrase?: string } = {},
): string[] {
  const problems: string[] = [];
  const hindi = station.language === 'hi-IN';
  for (const line of lines) {
    if (type !== 'kahani' && copiesExample(line.text)) problems.push(`copied an example line: "${line.text.slice(0, 60)}"`);
    if (hindi && type === 'rj_link' && /\d{1,2}:\d{2}/.test(line.text)) problems.push('clock digits instead of the TIME phrase');
    if (hindi && ROMANIZED_HINDI.test(line.text)) problems.push(`romanized Hindi: "${line.text.slice(0, 60)}"`);
    if (line.text.length > HARD_MAX_CHARS) problems.push(`line over ${HARD_MAX_CHARS} chars`);
    if (hindi && BANNED_HI.some((p) => line.text.includes(p))) problems.push(`banned phrase: "${line.text.slice(0, 60)}"`);
  }
  if (type === 'rj_link' && opts.greet && opts.listenerName && !lines.some((l) => /\{\s*name\s*\}/i.test(l.text))) {
    problems.push('greet_listener was yes but no {name}');
  }
  if (type === 'kahani') problems.push(...storyProblems(station, lines));
  if (type === 'news' && opts.headlinesText !== undefined) {
    const allowed = new Set([...digitsIn(opts.headlinesText), ...digitsIn(opts.timePhrase ?? ''), ...digitsIn(station.frequency)]);
    for (const line of lines) {
      for (const d of digitsIn(line.text)) {
        if (!allowed.has(d)) problems.push(`news number not in input: ${d}`);
      }
    }
  }
  return problems;
}

/** A Kahani must be a radio play, not a narrated summary, and must not open or close the tired way. */
export function storyProblems(station: Station, lines: ScriptLine[]): string[] {
  const problems: string[] = [];
  const roles = lines.map((l) => l.role);
  const narrator = roles.filter((r) => r === 'narrator').length;
  const characters = new Set(roles.filter((r) => r && r !== 'narrator'));
  if (lines.length >= 4 && narrator > Math.max(5, Math.ceil(lines.length / 2))) problems.push(`story is mostly narration (${narrator} of ${lines.length} lines)`);
  if (characters.size < 2) problems.push('story needs at least two speaking characters');
  const banned = STORY_BANNED[station.id];
  for (const line of lines) {
    if (banned?.test(line.text)) problems.push(`stock story phrase: "${line.text.slice(0, 60)}"`);
  }
  return problems;
}

/** News lines that still carry a number missing from the input are dropped after the retry. */
export function dropInventedNumbers<T extends ScriptLine>(lines: T[], headlinesText: string, extra: string): T[] {
  const allowed = new Set([...digitsIn(headlinesText), ...digitsIn(extra)]);
  return lines.filter((l) => digitsIn(l.text).every((d) => allowed.has(d)));
}
