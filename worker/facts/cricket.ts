/**
 * India fixtures from the static table (worker/pools/fixtures.ts). Today and tomorrow carry the IST start time when a
 * source gives one; home matches have no published start time, so none is ever stated. No scores: there is no live feed.
 */
import { INDIA_FIXTURES, type Fixture } from '../pools/fixtures';
import type { Fact, FactLang } from './types';
import { HOUR_MS, dayNum, endOfIstDay, istInstant, istParts } from './util';

/** Spoken start times, per language: the only fixture times in the table are 12:30, 07:30 and 03:30 IST. */
const SPOKEN_TIME: Record<string, Record<FactLang, string>> = {
  '12:30': { hi: 'दोपहर साढ़े बारह बजे', mr: 'दुपारी साडेबारा वाजता', ta: 'மதியம் பன்னிரண்டரை மணிக்கு', bn: 'দুপুর সাড়ে বারোটায়', gu: 'બપોરે સાડા બાર વાગ્યે' },
  '07:30': { hi: 'सुबह साढ़े सात बजे', mr: 'सकाळी साडेसात वाजता', ta: 'காலை ஏழரை மணிக்கு', bn: 'সকাল সাড়ে সাতটায়', gu: 'સવારે સાડા સાત વાગ્યે' },
  '03:30': { hi: 'तड़के साढ़े तीन बजे', mr: 'पहाटे साडेतीन वाजता', ta: 'அதிகாலை மூன்றரை மணிக்கு', bn: 'ভোর সাড়ে তিনটেয়', gu: 'વહેલી સવારે સાડા ત્રણ વાગ્યે' },
};

/** Hours a day's play lasts, for "is it still on" (T20 ~3.5 h, ODI ~8 h, a Test day ~7 h). */
const PLAY_HOURS: Record<Fixture['format'], number> = { T20I: 4, ODI: 8, Test: 7 };
/** Without a published start time, "today" stops airing at this IST hour (the match may already be over). */
const NO_TIME_CUTOFF = '17:00';

const ORDINAL_HI = ['', 'पहला', 'दूसरा', 'तीसरा', 'चौथा', 'पाँचवाँ'];
const FORMAT_HI: Record<Fixture['format'], string> = { T20I: 'T20', ODI: 'वनडे', Test: 'टेस्ट' };

function matchHi(f: Fixture): string {
  const n = Number(/^(\d)/.exec(f.match)?.[1] ?? 0);
  return `${ORDINAL_HI[n] ?? ''} ${FORMAT_HI[f.format]}`.trim();
}

/** The fixture on a date (including Test days in progress), else the next within `withinDays`. */
export function fixtureFor(date: string, withinDays = 7): { fixture: Fixture; daysAway: number } | undefined {
  const d = dayNum(date);
  for (const fixture of INDIA_FIXTURES) {
    const start = dayNum(fixture.date);
    const end = dayNum(fixture.end ?? fixture.date);
    if (d >= start && d <= end) return { fixture, daysAway: 0 };
    if (start > d && start - d <= withinDays) return { fixture, daysAway: start - d };
  }
  return undefined;
}

export function cricketFacts(now: number): Fact[] {
  const { date } = istParts(now);
  const hit = fixtureFor(date);
  if (!hit) return [];
  const { fixture: f, daysAway } = hit;
  const venue = f.home ? `${f.venue}` : `${f.venue}, ${f.opponent}`;
  const spoken = f.istStart ? SPOKEN_TIME[f.istStart] : undefined;
  const testDay = f.format === 'Test' && daysAway === 0 ? dayNum(date) - dayNum(f.date) + 1 : 0;
  const t20 = f.format === 'T20I' ? ['T20'] : [];
  const id = `cric:${f.date}:${f.match.replace(/\s+/g, '-').toLowerCase()}`;
  const base = { type: 'cricket' as const, source: `Tarang fixtures table (${f.sources.join(', ')})` };
  const keptHi = [f.opponentHi, f.venueHi];

  if (daysAway === 0) {
    // a time is known: before the start say when, during play say it is on, after play stop
    if (f.istStart) {
      const start = istInstant(date, f.istStart);
      const playEnd = start + PLAY_HOURS[f.format] * HOUR_MS;
      if (now >= playEnd) return [];
      const live = now >= start;
      return [
        {
          ...base,
          id: `${id}:${live ? 'live' : 'today'}${testDay ? `:d${testDay}` : ''}`,
          priority: 60,
          claimEn: live
            ? `India v ${f.opponent}, ${f.match} in ${venue}: play is scheduled to be on now (it started at ${f.istStart} IST).`
            : `India v ${f.opponent}, ${f.match} in ${venue}, today; play starts at ${f.istStart} IST.`,
          nativeText: {
            hi: live
              ? `${f.venueHi} में भारत और ${f.opponentHi} का ${matchHi(f)} मैच इस वक़्त चल रहा है।`
              : `आज ${f.venueHi} में भारत और ${f.opponentHi} के बीच ${matchHi(f)} मैच है, ${spoken?.hi ?? f.istStart} से।`,
          },
          keptTokens: t20,
          keptNative: live ? { hi: keptHi } : mergeSpoken({ hi: keptHi }, spoken),
          ...(spoken ? {} : { allowedTokens: [f.istStart] }),
          hedge: live
            ? 'There is no live score: never say who is winning, a score or a result. Say the match is on.'
            : 'There is no live score feed: never say a score, a result or a playing XI.',
          angleEn: live ? 'Fans at work can sneak a look at the score; everyone else knows why the office is quiet.' : 'Plan the day around the match: lunch break, alarm or a quiet corner with the phone.',
          expiresAt: live ? playEnd : start,
        },
      ];
    }
    const cutoff = istInstant(date, NO_TIME_CUTOFF);
    if (now >= cutoff) return [];
    return [
      {
        ...base,
        id: `${id}:today`,
        priority: 60,
        claimEn: `India v ${f.opponent}, ${f.match} in ${venue}, is today. No start time is published.`,
        nativeText: { hi: `आज ${f.venueHi} में भारत और ${f.opponentHi} के बीच ${matchHi(f)} मैच है।` },
        keptTokens: t20,
        keptNative: { hi: keptHi },
        hedge: 'No start time is published: never state one. No live score: never say a score or a result.',
        angleEn: 'Match day: the city will be watching, at home or on the phone.',
        expiresAt: cutoff,
      },
    ];
  }

  const isTomorrow = daysAway === 1;
  return [
    {
      ...base,
      id: `${id}:${isTomorrow ? 'tomorrow' : `in${daysAway}`}`,
      priority: isTomorrow ? 52 : 35,
      claimEn: isTomorrow
        ? `India v ${f.opponent}, ${f.match} in ${venue}, is tomorrow${f.istStart ? `; play starts at ${f.istStart} IST` : ' (no start time published)'}.`
        : `India v ${f.opponent}, ${f.match} in ${venue}, is in ${daysAway} days${f.istStart ? `; play starts at ${f.istStart} IST` : ''}.`,
      ...(isTomorrow
        ? { nativeText: { hi: `कल ${f.venueHi} में भारत और ${f.opponentHi} के बीच ${matchHi(f)} मैच है${spoken ? `, ${spoken.hi} से` : ''}।` } }
        : {}),
      keptTokens: isTomorrow ? t20 : [...t20, String(daysAway)],
      keptNative: mergeSpoken({ hi: keptHi }, isTomorrow ? spoken : undefined),
      ...(f.istStart && !spoken ? { allowedTokens: [f.istStart] } : {}),
      hedge: f.istStart ? 'Say the start time only as given (in IST). No score or team news.' : 'No start time is published: never state one.',
      angleEn: f.istStart === '03:30' ? 'An alarm for the real fans: the Test starts before dawn.' : 'Something to plan around: set a reminder now.',
      expiresAt: endOfIstDay(now),
    },
  ];
}

function mergeSpoken(base: Partial<Record<FactLang, string[]>>, spoken?: Record<FactLang, string>): Partial<Record<FactLang, string[]>> {
  if (!spoken) return base;
  const out: Partial<Record<FactLang, string[]>> = { ...base };
  for (const [lang, phrase] of Object.entries(spoken) as [FactLang, string][]) out[lang] = [...(out[lang] ?? []), phrase];
  return out;
}
