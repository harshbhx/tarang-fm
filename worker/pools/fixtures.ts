/**
 * India senior men's international fixtures, 15 Oct 2026 to 3 Mar 2027. Static, embedded; no runtime API.
 * Researched 2026-10-15. Used by worker/facts/cricket.ts.
 *
 * SOURCES:
 *   ICC   icc-cricket.com "India announce schedule for blockbuster home season" (26 Mar 2026): all home matches below
 *   ESPN  espn.com.au/cricket/scores/series/24469 "India tour of New Zealand 2026/27": dates, venues, start times (AEDT + local)
 *   RS    revsportz.in "New Zealand to host India for historic 12 match series" (3 Jun 2026): same NZ dates and venues
 *   CI    ESPNcricinfo India RSS (espncricinfo.com/rss/content/story/feeds/6.xml), 14 Oct 2026: WI T20I series level 2-2
 *
 * istStart: converted from ESPN local times. NZ is on NZDT (UTC+13) from 27 Sep 2026, so 20:00 NZDT = 12:30 IST,
 * 15:00 NZDT = 07:30 IST, 11:00 NZDT = 03:30 IST. Home start times were not in the ICC release: left undefined,
 * and the RJ must not state one.
 *
 * Not included: India Women v Zimbabwe (3 T20Is in Raipur, 3 ODIs in Vadodara, Oct 2026). The BCCI advisory
 * (6 May 2026) gives venues but no dates.
 */

export interface Fixture {
  /** First day, YYYY-MM-DD, IST date of the start */
  date: string;
  /** Last day for Tests */
  end?: string;
  format: 'T20I' | 'ODI' | 'Test';
  /** e.g. '5th T20I' */
  match: string;
  opponent: string;
  opponentHi: string;
  venue: string;
  venueHi: string;
  home: boolean;
  /** 'HH:mm' IST, only when a source gives it */
  istStart?: string;
  sources: readonly string[];
}

const NZ = { opponent: 'New Zealand', opponentHi: 'न्यूज़ीलैंड', home: false, sources: ['ESPN', 'RS'] } as const;
const SL = { opponent: 'Sri Lanka', opponentHi: 'श्रीलंका', home: true, sources: ['ICC'] } as const;
const ZIM = { opponent: 'Zimbabwe', opponentHi: 'ज़िम्बाब्वे', home: true, sources: ['ICC'] } as const;
const AUS = { opponent: 'Australia', opponentHi: 'ऑस्ट्रेलिया', home: true, sources: ['ICC'] } as const;

export const INDIA_FIXTURES: Fixture[] = [
  { date: '2026-10-17', format: 'T20I', match: '5th T20I', opponent: 'West Indies', opponentHi: 'वेस्टइंडीज़', venue: 'Bengaluru', venueHi: 'बेंगलुरु', home: true, sources: ['ICC', 'CI'] },
  { date: '2026-10-22', format: 'T20I', match: '1st T20I', venue: 'Christchurch', venueHi: 'क्राइस्टचर्च', istStart: '12:30', ...NZ },
  { date: '2026-10-24', format: 'T20I', match: '2nd T20I', venue: 'Christchurch', venueHi: 'क्राइस्टचर्च', istStart: '12:30', ...NZ },
  { date: '2026-10-27', format: 'T20I', match: '3rd T20I', venue: 'Wellington', venueHi: 'वेलिंगटन', istStart: '12:30', ...NZ },
  { date: '2026-10-30', format: 'T20I', match: '4th T20I', venue: 'Auckland', venueHi: 'ऑकलैंड', istStart: '12:30', ...NZ },
  { date: '2026-11-01', format: 'T20I', match: '5th T20I', venue: 'Hamilton', venueHi: 'हैमिल्टन', istStart: '12:30', ...NZ },
  { date: '2026-11-04', format: 'ODI', match: '1st ODI', venue: 'Auckland', venueHi: 'ऑकलैंड', istStart: '07:30', ...NZ },
  { date: '2026-11-07', format: 'ODI', match: '2nd ODI', venue: 'Wellington', venueHi: 'वेलिंगटन', istStart: '07:30', ...NZ },
  { date: '2026-11-10', format: 'ODI', match: '3rd ODI', venue: 'Hamilton', venueHi: 'हैमिल्टन', istStart: '07:30', ...NZ },
  { date: '2026-11-13', format: 'ODI', match: '4th ODI', venue: 'Mount Maunganui', venueHi: 'माउंट माउंगानुई', istStart: '07:30', ...NZ },
  { date: '2026-11-15', format: 'ODI', match: '5th ODI', venue: 'Mount Maunganui', venueHi: 'माउंट माउंगानुई', istStart: '07:30', ...NZ },
  { date: '2026-11-19', end: '2026-11-23', format: 'Test', match: '1st Test', venue: 'Wellington', venueHi: 'वेलिंगटन', istStart: '03:30', ...NZ },
  { date: '2026-11-27', end: '2026-12-01', format: 'Test', match: '2nd Test', venue: 'Christchurch', venueHi: 'क्राइस्टचर्च', istStart: '03:30', ...NZ },
  { date: '2026-12-13', format: 'ODI', match: '1st ODI', venue: 'Delhi', venueHi: 'दिल्ली', ...SL },
  { date: '2026-12-16', format: 'ODI', match: '2nd ODI', venue: 'Bengaluru', venueHi: 'बेंगलुरु', ...SL },
  { date: '2026-12-19', format: 'ODI', match: '3rd ODI', venue: 'Ahmedabad', venueHi: 'अहमदाबाद', ...SL },
  { date: '2026-12-22', format: 'T20I', match: '1st T20I', venue: 'Rajkot', venueHi: 'राजकोट', ...SL },
  { date: '2026-12-24', format: 'T20I', match: '2nd T20I', venue: 'Cuttack', venueHi: 'कटक', ...SL },
  { date: '2026-12-27', format: 'T20I', match: '3rd T20I', venue: 'Pune', venueHi: 'पुणे', ...SL },
  { date: '2027-01-03', format: 'ODI', match: '1st ODI', venue: 'Kolkata', venueHi: 'कोलकाता', ...ZIM },
  { date: '2027-01-06', format: 'ODI', match: '2nd ODI', venue: 'Hyderabad', venueHi: 'हैदराबाद', ...ZIM },
  { date: '2027-01-09', format: 'ODI', match: '3rd ODI', venue: 'Mumbai', venueHi: 'मुंबई', ...ZIM },
  { date: '2027-01-21', end: '2027-01-25', format: 'Test', match: '1st Test', venue: 'Nagpur', venueHi: 'नागपुर', ...AUS },
  { date: '2027-01-29', end: '2027-02-02', format: 'Test', match: '2nd Test', venue: 'Chennai', venueHi: 'चेन्नई', ...AUS },
  { date: '2027-02-11', end: '2027-02-15', format: 'Test', match: '3rd Test', venue: 'Guwahati', venueHi: 'गुवाहाटी', ...AUS },
  { date: '2027-02-19', end: '2027-02-23', format: 'Test', match: '4th Test', venue: 'Ranchi', venueHi: 'राँची', ...AUS },
  { date: '2027-02-27', end: '2027-03-03', format: 'Test', match: '5th Test', venue: 'Ahmedabad', venueHi: 'अहमदाबाद', ...AUS },
];

const dayNum = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / 86_400_000);

/** Today's match (including Test days in progress), else the next one within `withinDays`. */
export function cricketFor(date: string, withinDays = 7): { fixture: Fixture; daysAway: number } | undefined {
  const d = dayNum(date);
  for (const fixture of INDIA_FIXTURES) {
    const start = dayNum(fixture.date);
    const end = dayNum(fixture.end ?? fixture.date);
    if (d >= start && d <= end) return { fixture, daysAway: 0 };
    if (start > d && start - d <= withinDays) return { fixture, daysAway: start - d };
  }
  return undefined;
}
