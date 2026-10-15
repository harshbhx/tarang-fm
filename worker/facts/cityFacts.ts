/** City facts from the curated pool (worker/pools/localFacts.ts), rotated by day so sessions don't all open the same way. */
import { cityInfo, type CityInfo } from '../pools/localFacts';
import type { Fact } from './types';
import { dayNum, endOfIstDay, istParts } from './util';

export { cityInfo };
export type { CityInfo };

export function cityFacts(city: CityInfo | undefined, now: number): Fact[] {
  if (!city) return [];
  const { date } = istParts(now);
  const n = city.facts.length;
  const offset = ((dayNum(date) % n) + n) % n;
  return city.facts.map((_, i) => {
    const f = city.facts[(i + offset) % n];
    return {
      id: `city:${f.id}`,
      type: 'city_fact' as const,
      priority: 20 - i * 0.1,
      claimEn: f.en,
      nativeText: f.text,
      keptTokens: f.keep ?? [],
      hedge: 'A fixed fact: say it plainly, then your angle. Add no new number, date, name or place.',
      angleEn: f.angleEn,
      expiresAt: endOfIstDay(now),
      source: `${f.source} (verified ${f.verifiedOn})`,
    };
  });
}
