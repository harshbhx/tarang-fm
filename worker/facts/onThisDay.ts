/** On-this-day facts from the curated pool (worker/pools/onThisDay.ts): no runtime fetch. */
import { onThisDayFor, type OnThisDayItem } from '../pools/onThisDay';
import type { Fact, FactLang } from './types';
import { endOfIstDay, istParts } from './util';

const BORN: Record<FactLang, (name: string, year: number) => string> = {
  hi: (n, y) => `आज ही के दिन ${y} में ${n} का जन्म हुआ था।`,
  mr: (n, y) => `आजच्याच दिवशी ${y} मध्ये ${n} यांचा जन्म झाला.`,
  ta: (n, y) => `${y}-ஆம் ஆண்டு இதே நாளில் ${n} பிறந்தார்.`,
  bn: (n, y) => `${y} সালের আজকের দিনে ${n} জন্মগ্রহণ করেন।`,
  gu: (n, y) => `${y}માં આજના દિવસે ${n}નો જન્મ થયો હતો.`,
};

const slug = (item: OnThisDayItem) => (item.qid ?? item.en.slice(0, 24)).toLowerCase().replace(/[^a-z0-9]+/g, '-');

export function onThisDayFacts(now: number): Fact[] {
  const { date } = istParts(now);
  const items = onThisDayFor(date.slice(5));
  return items.map((item, i) => {
    const names = item.kind === 'birth' && item.year ? item.names : undefined;
    const nativeText = names
      ? Object.fromEntries((Object.entries(names) as [FactLang, string][]).map(([lang, n]) => [lang, BORN[lang](n, item.year!)]))
      : undefined;
    return {
      id: `otd:${date.slice(5)}:${slug(item)}`,
      type: 'on_this_day' as const,
      priority: 30 - i,
      claimEn: item.en,
      ...(nativeText ? { nativeText } : {}),
      keptTokens: item.year ? [String(item.year)] : [],
      ...(names ? { keptNative: Object.fromEntries(Object.entries(names).map(([k, v]) => [k, [v]])) as Partial<Record<FactLang, string[]>> } : {}),
      hedge: 'Say only what the claim says: no extra dates, titles, films, records or ages. Native names are spellings only.',
      angleEn: item.angleEn,
      expiresAt: endOfIstDay(now),
      source: item.source,
    };
  });
}
