/**
 * Free checks for the ad break (bible §4.3 and §5.1, prompt pack §10.3): the shape a 15-20 second parody
 * needs, no stage directions read aloud, the brand said once or twice, the fine print when the format calls
 * for it, the joke at the end, and nothing out of season.
 */
import type { StationId } from '../../shared/types';
import type { AdParody } from '../pools/ads';
import { rainInSeason } from '../pools/ads';
import { fictionLocale } from '../story';
import { copiesFictionExample, fold, leaksDirection, lineOverlap, words, type CheckLine, type CheckResult } from './story';

/** The fine-print beat in any station language (or the universal asterisk words). */
const TNC = /T\s*&\s*C|terms|conditions|शर्तें|शर्त|अटी|நிபந்தனை|শর্ত|શરત|\*/iu;

/** Rain words: never in an ad outside the rainy months (no umbrellas in October). */
const RAIN_WORDS = /monsoon|umbrella|raincoat|बारिश|बरसात|मानसून|छाता|छतरी|पाऊस|पावसा|छत्री|மழை|குடை|বৃষ্টি|বর্ষা|ছাতা|વરસાદ|ચોમાસ|છત્રી/iu;

/** Festival words: only when the ad was allowed to be festive. */
const FESTIVAL_WORDS = /navratri|diwali|deepavali|dussehra|garba|pujo|नवरात्र|दिवाली|दीवाली|दीपावली|दशहरा|दसरा|गरबा|डांडिया|दिवाळी|தீபாவளி|நவராத்திரி|দীপাবলি|দিওয়ালি|পুজো|নবরাত্রি|দশেরা|દિવાળી|નવરાત્રિ|નવરાત્રી|ગરબા|દશેરા/iu;

/** Runs of 5 or more Latin words: a full English sentence. */
const LATIN_RUN = /(?:\b[A-Za-z][A-Za-z'&.-]*\b[\s,!?]+){4,}\b[A-Za-z][A-Za-z'&.-]*\b/u;

export interface AdShapeOptions {
  card: AdParody;
  /** The brand as the script names it (the title) */
  brand: string;
  /** The writer's planned punchline */
  punchline?: string;
  month: number;
  /** The ad may touch the festival */
  festive: boolean;
}

/** How many times the brand is said (by its first word, inflected or not). */
export function brandMentions(lines: CheckLine[], brand: string): number {
  const key = words(brand)[0];
  if (!key) return 0;
  return lines.reduce((n, l) => n + words(l.text).filter((w) => w.startsWith(key)).length, 0);
}

export function adShape(station: StationId, lines: CheckLine[], opts: AdShapeOptions): CheckResult {
  const hard: string[] = [];
  const soft: string[] = [];
  const n = lines.length;
  const [min, max] = opts.card.lines;
  if (n < 3) hard.push(`Too short: ${n} lines. The format needs its ${min}-${max} beats.`);
  if (n > 6) hard.push(`Too long: ${n} lines. ${min}-${max} lines: one setup, one escalation, the punchline.`);
  const chars = lines.reduce((s, l) => s + l.text.length, 0);
  if (chars > 520) hard.push(`Too long to say in 20 seconds (${chars} characters): under 400.`);
  else if (chars > 420) soft.push(`${chars} characters: aim for under 400.`);

  if (opts.brand && ![...opts.brand].some((c) => /\p{L}/u.test(c) && !/\p{Script=Latin}/u.test(c))) {
    hard.push(`The brand "${opts.brand}" is all English: make it a pun in the station language, in its own script.`);
  }
  const mentions = brandMentions(lines, opts.brand);
  if (mentions === 0) hard.push(`The brand "${opts.brand}" is never said: say it once or twice.`);
  else if (mentions > 3) hard.push(`The brand is said ${mentions} times: once or twice, never chanted.`);
  const brandKey = words(opts.brand)[0];
  lines.forEach((l, i) => {
    const rest = words(l.text).filter((w) => !brandKey || !w.startsWith(brandKey));
    if (rest.length < 2) hard.push(`Line ${i + 1} is only the brand name: every line must move the joke.`);
    if (leaksDirection(l.text)) hard.push(`Line ${i + 1} reads a stage direction, label or bracket aloud: only spoken words go in "text", acting goes in "delivery".`);
    if (copiesFictionExample(l.text)) hard.push(`Line ${i + 1} copies an example from the instructions: write your own joke.`);
  });

  const tncLine = lines.findIndex((l) => TNC.test(l.text));
  const fastEnd = lines.slice(-2).some((l) => l.delivery === 'fast');
  if (opts.card.tnc === 'required' && tncLine < 0 && !fastEnd) {
    hard.push(`This format needs the fast fine-print beat ("${fictionLocale(station).tnc}", delivery fast) near the end, and the joke lives in it.`);
  }
  lines.forEach((l, i) => {
    if (i === tncLine) return;
    if (LATIN_RUN.test(l.text)) hard.push(`Line ${i + 1} is a full English sentence: keep the sentence in ${station === 'hi' ? 'Hindi' : 'the station language'}, English only for single words.`);
  });

  const all = lines.map((l) => l.text).join(' ');
  if (!rainInSeason(station, opts.month) && RAIN_WORDS.test(all)) hard.push('Rain, monsoon or umbrellas are out of season this month: pick a problem people have right now.');
  if (!opts.festive && FESTIVAL_WORDS.test(all)) hard.push('No festival in this ad: the joke is about the everyday PROBLEM only.');

  if (opts.punchline && n >= 2) {
    const tail = lines.slice(-2).map((l) => l.text).join(' ');
    if (lineOverlap(tail, opts.punchline) < 0.25) soft.push('The punchline should land in the last or second-to-last line.');
  }
  const fillers = fictionLocale(station).fillers.map(fold);
  if (lines.some((l) => fillers.some((f) => fold(l.text).startsWith(`${f} `) || fold(l.text).startsWith(`${f},`)))) {
    soft.push('A line starts with a filler word: open on the format instead.');
  }
  return { hard, soft };
}
