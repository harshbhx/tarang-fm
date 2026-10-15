/**
 * Festival facts from the static calendar (worker/pools/festivals.ts). Dates are IST. Scope rules:
 * - today and tomorrow: `confirmed` rows only for "tomorrow"; `single` rows only on the day itself;
 * - `disputed` rows are never "today", "tomorrow" or a date: they air as "this week" (इस हफ़्ते) while in range;
 * - `tentative` rows (moon sighting) never air in advance;
 * - countdowns only for `confirmed` rows, the nearest one, 2–30 days away;
 * - regional rows on the Hindi station only reach listeners in the states where they matter;
 * - customs come from customFor(), so a listener never gets another region's custom.
 */
import { FESTIVALS, customFor, type Festival, type StationLang } from '../pools/festivals';
import type { Fact, FactLang } from './types';
import { DAY_MS, dayNum, endOfIstDay, istParts } from './util';

const T = {
  today: { hi: (n: string) => `आज ${n} है।`, mr: (n: string) => `आज ${n} आहे.`, ta: (n: string) => `இன்று ${n}.`, bn: (n: string) => `আজ ${n}।`, gu: (n: string) => `આજે ${n} છે.` },
  ongoing: {
    hi: (n: string) => `${n} के दिन चल रहे हैं।`,
    mr: (n: string) => `${n}चे दिवस सुरू आहेत.`,
    ta: (n: string) => `${n} நாட்கள் நடந்து வருகின்றன.`,
    bn: (n: string) => `${n}র দিন চলছে।`,
    gu: (n: string) => `${n}ના દિવસો ચાલી રહ્યા છે.`,
  },
  tomorrow: { hi: (n: string) => `कल ${n} है।`, mr: (n: string) => `उद्या ${n} आहे.`, ta: (n: string) => `நாளை ${n}.`, bn: (n: string) => `কাল ${n}।`, gu: (n: string) => `આવતીકાલે ${n} છે.` },
  week: {
    hi: (n: string) => `${n} इसी हफ़्ते है।`,
    mr: (n: string) => `${n} याच आठवड्यात आहे.`,
    ta: (n: string) => `${n} இந்த வாரம் வருகிறது.`,
    bn: (n: string) => `${n} এই সপ্তাহেই।`,
    gu: (n: string) => `${n} આ અઠવાડિયે છે.`,
  },
  countdown: {
    hi: (n: string, d: number) => `${n} में ${d} दिन बाकी हैं।`,
    mr: (n: string, d: number) => `${n}ला ${d} दिवस उरले आहेत.`,
    ta: (n: string, d: number) => `${n}க்கு இன்னும் ${d} நாட்கள் உள்ளன.`,
    bn: (n: string, d: number) => `${n} আসতে আর ${d} দিন বাকি।`,
    gu: (n: string, d: number) => `${n}ને હવે ${d} દિવસ બાકી છે.`,
  },
} as const;

const WEEK_NATIVE: Record<FactLang, string> = { hi: 'इस हफ़्ते', mr: 'या आठवड्यात', ta: 'இந்த வாரம்', bn: 'এই সপ্তাহে', gu: 'આ અઠવાડિયે' };

type Mode = 'today' | 'ongoing' | 'tomorrow' | 'week' | 'countdown';

function native(f: Festival, mode: Mode, days = 0): { text: Partial<Record<FactLang, string>>; kept: Partial<Record<FactLang, string[]>> } {
  const text: Partial<Record<FactLang, string>> = {};
  const kept: Partial<Record<FactLang, string[]>> = {};
  for (const [lang, name] of Object.entries(f.names) as [FactLang, string][]) {
    text[lang] = mode === 'countdown' ? T.countdown[lang](name, days) : T[mode][lang](name);
    kept[lang] = mode === 'week' ? [name, WEEK_NATIVE[lang]] : [name];
  }
  return { text, kept };
}

const forStation = (f: Festival, lang: StationLang) => f.stations === 'all' || f.stations.includes(lang);

/** Regional rows on the Hindi station only reach the states they belong to (when the state is known). */
function inScope(f: Festival, lang: StationLang, state?: string): boolean {
  if (!forStation(f, lang)) return false;
  if (lang === 'hi' && f.kind === 'regional' && f.states?.length && state) return f.states.includes(state);
  return true;
}

const SOURCE_NOTE = 'Tarang festival calendar (Drik Panchang, Google India holidays, state lists)';

const NO_RELIGION = 'Customs and food only: no religious meaning, no ritual instructions, no day numbers.';

export function festivalFacts(date: string, lang: StationLang, state: string | undefined, now: number, random = Math.random): Fact[] {
  const d = dayNum(date);
  const facts: Fact[] = [];
  const endToday = endOfIstDay(now);
  const local = (f: Festival) => (state && f.states?.includes(state) ? 3 : 0);
  let countdownDone = false;
  // days left in the current Monday-to-Sunday week, today included as 0
  const weekday = istParts(now).weekday;
  const daysLeftInWeek = weekday === 0 ? 0 : 7 - weekday;

  const sorted = FESTIVALS.filter((f) => inScope(f, lang, state) && f.confidence !== 'tentative')
    .map((f) => ({ f, start: dayNum(f.date) - d, end: dayNum(f.end ?? f.date) - d }))
    .sort((a, b) => a.start - b.start);

  for (const { f, start, end } of sorted) {
    if (end < 0) continue;
    const custom = customFor(f, lang, state, random);
    const customEn = custom ? ` A custom${state ? ` in ${state}` : ''}: ${custom}.` : '';
    let mode: Mode | undefined;
    let priority = 0;
    let claimEn = '';
    let expiresAt = endToday;
    let hedge = NO_RELIGION;

    if (f.confidence === 'disputed') {
      // calendars disagree by a day: "this week" only while the listed day and the day after both fall in this week
      if (start < 0 || start + 1 > daysLeftInWeek) continue;
      mode = 'week';
      priority = 55;
      claimEn = `${f.name} falls this week (calendars differ on the exact day).${customEn}`;
      hedge = `Calendars disagree on the day: say "this week" (इस हफ़्ते), never "today", "tomorrow", a weekday or a date. ${NO_RELIGION}`;
    } else if (start <= 0 && end >= 0) {
      mode = start === 0 ? 'today' : 'ongoing';
      priority = 70;
      claimEn = start === 0 ? `Today is ${f.name}.${customEn}` : `${f.name} is on these days.${customEn}`;
      if (f.end) hedge = `${NO_RELIGION} Never say which day of ${f.name} it is.`;
    } else if (start === 1 && f.confidence === 'confirmed') {
      mode = 'tomorrow';
      priority = 65;
      claimEn = `Tomorrow is ${f.name}.${customEn}`;
    } else if (!countdownDone && start >= 2 && start <= 30 && f.confidence === 'confirmed') {
      countdownDone = true;
      mode = 'countdown';
      priority = 40;
      claimEn = `${start} days to go until ${f.name}.`;
      expiresAt = Math.min(endToday, now + DAY_MS);
    }
    if (!mode) continue;
    const n = native(f, mode, start);
    facts.push({
      id: mode === 'countdown' ? `fest:${f.id}:cd${start}` : `fest:${f.id}:${mode}:${mode === 'week' ? f.date : date}`,
      type: 'festival',
      priority: priority + local(f),
      claimEn,
      ...(Object.keys(n.text).length ? { nativeText: n.text, keptNative: n.kept } : {}),
      keptTokens: mode === 'countdown' ? [String(start)] : [],
      hedge,
      ...(mode === 'week' ? { hedgeNative: WEEK_NATIVE } : {}),
      angleEn:
        mode === 'countdown'
          ? 'Something to look forward to: the planning, shopping and cleaning that start now.'
          : custom
            ? `What people around you are doing for it: ${custom}.`
            : 'A warm greeting for everyone celebrating, through one small, everyday detail.',
      expiresAt,
      source: `${SOURCE_NOTE}: ${f.sources.join(', ')}`,
    });
  }
  return facts;
}

/** Festival rows on a date for a station (inclusive of multi-day ranges): used by the calendar self-checks. */
export function festivalsOnDate(date: string, lang: StationLang): Festival[] {
  const d = dayNum(date);
  return FESTIVALS.filter((f) => forStation(f, lang) && d >= dayNum(f.date) && d <= dayNum(f.end ?? f.date));
}

