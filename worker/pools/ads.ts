/**
 * The ad parody pool (bible §4.3, prompt pack §5.2): every spoof ad parodies a format an Indian listener
 * recognises in 3 seconds, for an invented product that solves one real everyday problem. Cards and problems
 * are curated here, never written by the model: signatures and beats stay in English so nothing on a card is
 * copyable spoken text, and every problem names the cards it makes sense with, so a format never meets a
 * problem it can't joke about. Months and festival windows keep the ads in season (no umbrellas in October).
 */
import type { StationId } from '../../shared/types';

type Random = () => number;

export interface AdParody {
  id: string;
  /** What the format is called, for the writer */
  name: string;
  /** How line 1 makes the format obvious (English, never spoken) */
  signature: string;
  /** role · delivery · what happens, one beat per line (English) */
  beats: string[];
  /** Where the joke lands */
  punchline: string;
  /** How the joke works, in English (the writer applies it to the PROBLEM) */
  pattern: string;
  /** One English example of the pattern, on another problem (never shown for its own problem) */
  example: string;
  exampleProblem: string;
  /** The fast fine-print beat: the joke itself (required), allowed (optional) or never */
  tnc: 'required' | 'optional' | 'none';
  /** Lines the format needs [min, max] */
  lines: [number, number];
  /** Months (1-12) when the format makes sense; absent = all year */
  months?: number[];
}

export const AD_PARODIES: AdParody[] = [
  {
    id: 'mf_disclaimer',
    pattern: "The \"investment\" is the everyday PROBLEM treated like a financial asset; the speed-read risk warning ends on a clause that admits what the habit really costs.",
    example: "invested in \"five more minutes\" of sleep, and the warning ends: past snoozes are no guarantee of future punctuality.",
    exampleProblem: 'alarm_snooze',
    name: 'mutual-fund ad with the speed-read disclaimer',
    signature: 'a slow, trustworthy announcer talking about planning for the future: children, retirement, peace of mind',
    beats: [
      'ad_announcer · warm · the aspiration, slow and sincere',
      'ad_customer · normal · reveals what they "invested" in: the everyday PROBLEM, treated as an asset',
      'ad_announcer · fast · the speed-read risk warning; its last clause is the punchline',
    ],
    punchline: 'the last clause of the disclaimer',
    tnc: 'required',
    lines: [3, 4],
  },
  {
    id: 'real_estate',
    pattern: "The grand claim has one number; the fine print says the number only holds under an absurd condition that cancels it.",
    example: "\"just 10 minutes from the airport\", and the fine print: by helicopter; helicopter not included.",
    exampleProblem: 'parking',
    name: 'real-estate ad, "just X minutes from the airport"',
    signature: 'a grand announcer selling a home "in the heart of the city, just X minutes from the airport"',
    beats: [
      'ad_announcer · excited · the grand claim with one number',
      'ad_customer · excited · the dream-home line: how it solves the PROBLEM',
      'ad_announcer · fast · the fine print that explains the number',
    ],
    punchline: 'what the asterisk hides',
    tnc: 'required',
    lines: [3, 4],
  },
  {
    id: 'coaching_topper',
    pattern: "The topper is Rank 1 in something tiny tied to the PROBLEM; the fine print reveals the rank was out of almost nobody, or every institute claims the same topper.",
    example: "\"Rank 1 in the whole building\", and the fine print: the building has one student.",
    exampleProblem: 'exam_night',
    name: 'coaching-institute topper testimonial',
    signature: 'a proud topper testimonial with a rank',
    beats: [
      'ad_customer · excited · "I got Rank 1" in something absurdly small, tied to the PROBLEM',
      'ad_announcer · excited · the institute, its pun name, one result',
      'ad_announcer · fast · the fine print about the rank, or who else claims the same topper',
    ],
    punchline: 'rank in what, or claimed by whom',
    tnc: 'required',
    lines: [3, 4],
  },
  {
    id: 'dadi_nuskha',
    pattern: "A grand list of herbs, and the last \"ingredient\" is the plain everyday thing that really solves the PROBLEM.",
    example: "for back pain: tulsi, ashwagandha, brahmi... and a new office chair.",
    exampleProblem: 'back_pain',
    name: 'ayurvedic "grandmother\'s recipe" oil with 100 herbs',
    signature: 'a grandmother-recipe herbal oil, balm or churan "with 100 herbs", warm and old-fashioned',
    beats: [
      'ad_customer · sad · the PROBLEM (something in the body: pain, hair, digestion, a cold, memory)',
      'ad_announcer · warm · the remedy, the grandmother, the herbs',
      'ad_customer · excited · the result',
      'ad_announcer · fast · the herb list, whose last item is the joke',
    ],
    punchline: 'the last ingredient',
    tnc: 'optional',
    lines: [4, 5],
  },
  {
    id: 'insurance_papa',
    pattern: "A big emotional build-up about securing the future; the policy turns out to cover one tiny thing from the PROBLEM, with a tiny limit.",
    example: "\"because life is uncertain...\", and it is a last-samosa plan: covers the last samosa on the plate, up to one samosa.",
    exampleProblem: 'last_samosa',
    name: 'insurance tear-jerker, father and child',
    signature: 'a soft father-and-child moment and a promise about the future',
    beats: [
      'ad_customer · warm · the child (or the parent) asks a big question about the future',
      'ad_announcer · warm · "because in life…", slow and moving',
      'ad_announcer · normal · what the policy actually covers: one tiny thing from the PROBLEM',
    ],
    punchline: 'the tiny thing that is insured',
    tnc: 'optional',
    lines: [3, 4],
  },
  {
    id: 'mega_sale',
    pattern: "A shouted huge discount; the fine print says it applies only to something useless that comes with the purchase.",
    example: "\"up to 90% off!\", and the fine print: on the carry bag only.",
    exampleProblem: 'festive_rush',
    name: 'shouted "up to 90% off" mega sale',
    signature: 'a shouted "up to 90% off" sale, everything urgent',
    beats: [
      'ad_announcer · shout · the offer',
      'ad_customer · excited · the rush',
      'ad_announcer · fast · "only on…": what the discount really applies to',
    ],
    punchline: 'what the 90% applies to',
    tnc: 'required',
    lines: [3, 4],
  },
  {
    id: 'lab_coat_expert',
    pattern: "A serious expert recommends the product after a \"test\"; the expert's credentials turn out to be homely and unrelated.",
    example: "\"recommended by experts\", and the expert is the neighbour who has watched 300 cooking videos.",
    exampleProblem: 'jar_lid',
    name: 'white-coat "experts recommend" ad',
    signature: 'a white-coat "experts recommend" voice with a laboratory test',
    beats: [
      'ad_announcer · normal · the expert and the claim',
      'ad_customer · normal · the test, on the PROBLEM',
      'ad_announcer · normal · who the expert really is',
    ],
    punchline: "the expert's credentials",
    tnc: 'optional',
    lines: [3, 4],
  },
  {
    id: 'inverter_panic',
    pattern: "A thriller build-up to the power cut at the worst moment; the hero product saves something absurdly small instead of the big thing.",
    example: "the lights go out at the serial's climax, and the inverter saves... only the one bulb above the fridge.",
    exampleProblem: 'power_cut',
    name: 'inverter power-cut thriller',
    signature: 'a power-cut thriller: suspense, then the lights go out at the worst moment',
    beats: [
      'ad_customer · dramatic · the blackout at the worst moment',
      'ad_announcer · dramatic · the hero product',
      'ad_customer · excited · what it saved: something absurdly small',
    ],
    punchline: 'what was saved',
    tnc: 'optional',
    lines: [3, 4],
  },
  {
    id: 'matrimonial',
    pattern: "A sweet \"how we met\" story; the real reason they matched is one tiny shared quirk from the PROBLEM.",
    example: "they matched because both hide the TV remote in the same cushion.",
    exampleProblem: 'remote_lost',
    name: 'match-making service success story',
    signature: 'a couple telling "how we met" on a match-making service',
    beats: [
      'ad_customer · warm · "we met when…"',
      'ad_announcer · warm · the service and its "algorithm"',
      'ad_customer · normal · the real reason they matched: the PROBLEM',
    ],
    punchline: 'the absurd compatibility',
    tnc: 'optional',
    lines: [3, 4],
  },
  {
    id: 'teleshopping',
    pattern: "A miracle product for the PROBLEM; \"but wait, there's more\" adds a free gift that brings the PROBLEM straight back.",
    example: "a gadget that untangles earphones, and the free gift is a second pair of earphones, already tangled.",
    exampleProblem: 'earphones',
    name: 'tele-shopping "call now, but wait!" ad',
    signature: 'an over-excited tele-shopping host: "call now! but wait…"',
    beats: [
      'ad_announcer · excited · the miracle product for the PROBLEM',
      'ad_announcer · fast · "but wait, there is more"',
      'ad_customer · excited · the testimonial',
      'ad_announcer · fast · the price and the "free gift"',
    ],
    punchline: 'the free gift',
    tnc: 'required',
    lines: [4, 5],
  },
  {
    id: 'railway_announce',
    pattern: "The PROBLEM is announced like a delayed train in calm platform cadence; the product \"arrives on platform...\", and the twist is a delay or platform joke.",
    example: "the guest who said \"five minutes\" is now running 3 hours late; departure expected at platform \"never\".",
    exampleProblem: 'guests_stay',
    name: 'railway-platform announcement',
    signature: 'the calm railway-announcement cadence: "passengers, kindly note"',
    beats: [
      'ad_announcer · normal · the announcement, about the PROBLEM as if it were a train',
      'ad_customer · fast · the reaction on the platform',
      'ad_announcer · normal · the product arrives "on platform…"',
    ],
    punchline: 'the platform or delay twist',
    tnc: 'optional',
    lines: [3, 4],
  },
  {
    id: 'cooker_whistle',
    pattern: "Counting whistles; the product counts them for you; the twist is what else it ends up counting, or the count goes comically wrong.",
    example: "it counted 3 whistles, and also the 7 times the family asked \"is it done yet?\".",
    exampleProblem: 'cooker_count',
    name: 'pressure-cooker whistle demo',
    signature: 'a kitchen demo counting pressure-cooker whistles',
    beats: [
      'ad_customer · excited · counting whistles',
      'ad_announcer · excited · the product',
      'ad_customer · normal · the count twist',
    ],
    punchline: 'the whistle count',
    tnc: 'optional',
    lines: [3, 4],
  },
  {
    id: 'strong_glue',
    pattern: "The glue fixes the PROBLEM for good; the side effect is that something got stuck that should not have.",
    example: "it fixed the slipper strap for life, and also the slipper to the floor.",
    exampleProblem: 'slipper_strap',
    name: '"so strong that…" glue demo',
    signature: 'a proud demo of a glue so strong that something huge holds on to something small',
    beats: [
      'ad_customer · normal · the PROBLEM breaks again',
      'ad_announcer · excited · the glue and its impossible demo',
      'ad_customer · normal · what it stuck together, and the side effect',
    ],
    punchline: 'what got stuck that should not have',
    tnc: 'optional',
    lines: [3, 4],
  },
  {
    id: 'winter_tonic',
    pattern: "One spoon a day for winter strength; the result goes one step too far and creates a new problem.",
    example: "grandpa now wakes everyone at 5 am for a cold-water walk.",
    exampleProblem: 'first_cold',
    name: 'winter immunity tonic ad',
    signature: 'a cosy announcer promising strength "for the whole family, all winter"',
    beats: [
      'ad_customer · sad · the winter PROBLEM',
      'ad_announcer · warm · the tonic, one spoon a day',
      'ad_customer · excited · the result, pushed one step too far',
    ],
    punchline: 'the result, one step too far',
    tnc: 'optional',
    lines: [3, 4],
    months: [11, 12, 1, 2],
  },
  {
    id: 'cooler_summer',
    pattern: "\"Himalaya-level cooling\" promised; it works so well it flips the PROBLEM upside down.",
    example: "now the family fights over who has to sit in front of the cooler.",
    exampleProblem: 'cooler_fight',
    name: 'desert-cooler summer ad',
    signature: 'a breathless announcer promising "Himalaya-level cooling" in the hottest month',
    beats: [
      'ad_customer · dramatic · the summer PROBLEM',
      'ad_announcer · excited · the cooler and its claim',
      'ad_customer · normal · the cooling, one step too far',
    ],
    punchline: 'how cold it really gets',
    tnc: 'optional',
    lines: [3, 4],
    months: [3, 4, 5, 6],
  },
  {
    id: 'rain_gear',
    pattern: "A cheerful monsoon offer that truly solves the rain PROBLEM; the catch is a small cheeky condition.",
    example: "the umbrella is 100% waterproof; the price, sadly, is not.",
    exampleProblem: 'umbrella_forgot',
    name: 'monsoon offer on rain gear',
    signature: 'a cheerful "monsoon offer" announcer, rain everywhere',
    beats: [
      'ad_customer · sad · the rain PROBLEM',
      'ad_announcer · excited · the rain gear and its claim',
      'ad_announcer · fast · the catch',
    ],
    punchline: 'the catch',
    tnc: 'optional',
    lines: [3, 4],
    months: [6, 7, 8, 9],
  },
];

/** Formats each station leans on (bible §5.3): drawn twice as often. */
const FAVOURITES: Partial<Record<StationId, string[]>> = {
  mr: ['railway_announce', 'cooker_whistle'],
  ta: ['teleshopping', 'insurance_papa'],
  bn: ['matrimonial', 'lab_coat_expert'],
  gu: ['mega_sale', 'mf_disclaimer'],
};

export interface AdProblem {
  id: string;
  /** The everyday problem, in English; the writer puts it in the station language */
  en: string;
  /** The formats it makes sense with */
  cards: string[];
  /** Months (1-12) when it is real; absent = all year */
  months?: number[];
  /** Tied to a festival window: only in that window, and only when the ad may be festive */
  festival?: FestivalId;
  /** Only on these stations (or for listeners in these states) */
  stations?: StationId[];
  regions?: string[];
}

/** Rain is in season Jun-Sep everywhere, and Oct-Dec too in Chennai (the northeast monsoon). */
const RAIN: Partial<Record<StationId, number[]>> & { any: number[] } = { any: [6, 7, 8, 9], ta: [6, 7, 8, 9, 10, 11, 12] };

export const AD_PROBLEMS: AdProblem[] = [
  { id: 'guests_stay', en: 'guests who say "just five minutes" and stay three hours', cards: ['teleshopping', 'insurance_papa', 'railway_announce', 'lab_coat_expert', 'mf_disclaimer'] },
  { id: 'remote_lost', en: 'the TV remote that vanishes every evening', cards: ['teleshopping', 'lab_coat_expert', 'railway_announce', 'strong_glue', 'matrimonial'] },
  { id: 'family_forwards', en: "the family group chat's forty good-morning forwards", cards: ['mf_disclaimer', 'coaching_topper', 'teleshopping', 'lab_coat_expert'] },
  { id: 'alarm_snooze', en: 'the 6 am alarm snoozed nine times', cards: ['coaching_topper', 'teleshopping', 'lab_coat_expert', 'railway_announce', 'mf_disclaimer'] },
  { id: 'lift_talk', en: 'awkward small talk with the neighbour in the lift', cards: ['real_estate', 'teleshopping', 'lab_coat_expert'] },
  { id: 'cooker_count', en: 'losing count of the pressure-cooker whistles', cards: ['cooker_whistle', 'teleshopping'] },
  { id: 'earphones', en: 'earphones that tangle themselves inside the pocket', cards: ['teleshopping', 'lab_coat_expert'] },
  { id: 'neighbour_son', en: "being compared with the neighbour's \"perfect\" son", cards: ['coaching_topper', 'matrimonial', 'mf_disclaimer', 'insurance_papa'] },
  { id: 'parking', en: 'no parking spot in your own housing society', cards: ['real_estate', 'railway_announce', 'mf_disclaimer'] },
  { id: 'last_samosa', en: 'who gets the last samosa on the plate', cards: ['insurance_papa', 'matrimonial', 'teleshopping', 'mf_disclaimer'] },
  { id: 'wifi_password', en: 'guests who ask for the Wi-Fi password before saying hello', cards: ['teleshopping', 'lab_coat_expert', 'real_estate'] },
  { id: 'battery_low', en: 'the phone at 1% battery at the worst moment', cards: ['inverter_panic', 'insurance_papa', 'teleshopping'] },
  { id: 'chai_cold', en: 'chai going cold while you scroll your phone', cards: ['lab_coat_expert', 'teleshopping'] },
  { id: 'power_cut', en: 'a power cut right at the climax of the family TV serial', cards: ['inverter_panic'] },
  { id: 'exam_night', en: 'starting to study the night before the exam', cards: ['coaching_topper', 'dadi_nuskha', 'insurance_papa'] },
  { id: 'marriage_question', en: 'relatives asking "when are you getting married?" at every function', cards: ['matrimonial', 'insurance_papa', 'mf_disclaimer'] },
  { id: 'almost_there', en: 'the friend who says "almost there" while still at home', cards: ['railway_announce', 'real_estate'] },
  { id: 'slipper_strap', en: 'a slipper strap snapping in the middle of the road', cards: ['strong_glue', 'teleshopping'] },
  { id: 'jar_lid', en: 'the pickle-jar lid nobody in the house can open', cards: ['lab_coat_expert', 'teleshopping', 'coaching_topper'] },
  { id: 'mosquito', en: 'one mosquito buzzing in your ear at 2 am', cards: ['lab_coat_expert', 'teleshopping', 'dadi_nuskha'] },
  { id: 'hair_fall', en: 'hair on the comb every morning', cards: ['dadi_nuskha', 'lab_coat_expert'] },
  { id: 'back_pain', en: 'the back pain from a whole day at the office chair', cards: ['dadi_nuskha', 'lab_coat_expert', 'teleshopping'] },
  // Festive windows (at most 1 ad in 3)
  { id: 'diwali_cleaning', en: 'the Diwali cleaning that keeps finding bills from 2014', cards: ['mega_sale', 'teleshopping', 'railway_announce', 'mf_disclaimer'], festival: 'diwali' },
  { id: 'sweets_overload', en: 'a box of sweets from every neighbour before Diwali', cards: ['lab_coat_expert', 'dadi_nuskha', 'insurance_papa'], festival: 'diwali' },
  { id: 'festive_rush', en: 'the festive shopping crowd in the market', cards: ['mega_sale', 'railway_announce'], festival: 'diwali' },
  { id: 'garba_feet', en: 'aching feet after a night of garba', cards: ['dadi_nuskha', 'lab_coat_expert'], festival: 'navratri', stations: ['gu'], regions: ['Gujarat'] },
  { id: 'garba_cousin', en: 'the cousin who learnt one new garba step and keeps showing it', cards: ['coaching_topper', 'teleshopping', 'matrimonial'], festival: 'navratri', stations: ['gu'], regions: ['Gujarat'] },
  { id: 'pandal_queue', en: 'the never-ending queue for pandal hopping', cards: ['railway_announce', 'real_estate'], festival: 'navratri', stations: ['bn'] },
  // Seasonal
  { id: 'blanket_exit', en: 'getting out of the blanket on a cold morning', cards: ['winter_tonic', 'teleshopping', 'dadi_nuskha', 'railway_announce'], months: [12, 1, 2] },
  { id: 'hot_water_queue', en: 'the family queue for hot water on a winter morning', cards: ['railway_announce', 'real_estate', 'winter_tonic'], months: [12, 1, 2] },
  { id: 'first_cold', en: 'the whole family catching a cold in the first cool week', cards: ['winter_tonic', 'dadi_nuskha', 'lab_coat_expert'], months: [11, 12, 1] },
  { id: 'wedding_invites', en: 'three wedding invitations on the same evening', cards: ['matrimonial', 'railway_announce', 'mega_sale'], months: [11, 12, 1, 2] },
  { id: 'cooler_fight', en: 'the family fight over who sits in front of the cooler', cards: ['cooler_summer', 'insurance_papa', 'real_estate'], months: [4, 5, 6] },
  { id: 'scooter_seat', en: 'a scooter seat too hot to sit on in the afternoon', cards: ['cooler_summer', 'lab_coat_expert', 'teleshopping'], months: [4, 5, 6] },
  { id: 'results_day', en: 'results day and every relative calling to ask the marks', cards: ['coaching_topper', 'insurance_papa'], months: [3, 4, 5] },
  { id: 'wet_socks', en: 'wet socks all day after one puddle', cards: ['rain_gear', 'dadi_nuskha', 'teleshopping'], months: RAIN.any },
  { id: 'umbrella_forgot', en: 'the umbrella you always leave behind at the office', cards: ['rain_gear', 'railway_announce', 'teleshopping'], months: RAIN.any },
  { id: 'wet_clothes', en: 'clothes that never dry in the rainy season', cards: ['rain_gear', 'lab_coat_expert', 'inverter_panic'], months: RAIN.any },
  { id: 'chennai_rain_auto', en: 'no auto-rickshaw will come when it rains', cards: ['rain_gear', 'railway_announce', 'teleshopping'], months: RAIN.ta, stations: ['ta'] },
];

// ---- Festivals and seasons ----------------------------------------------------------------------

export type FestivalId = 'navratri' | 'diwali';

/**
 * Festival windows for the ads (2026). Navratri 11-19 Oct and Dussehra 20 Oct are verified in worker/show.ts;
 * the Diwali run-up (cleaning, shopping, sweets) is the three weeks before Diwali on 8 Nov.
 */
const FESTIVAL_WINDOWS: { id: FestivalId; from: string; to: string; en: Partial<Record<StationId, string>> & { any: string } }[] = [
  {
    id: 'navratri',
    from: '2026-10-11',
    to: '2026-10-19',
    en: { any: 'Navratri is on (customs and food only, no religious commentary)', gu: 'Navratri: garba nights (customs and food only, no religious commentary)', bn: 'Pujo season (pandals, food, crowds; no religious commentary)' },
  },
  { id: 'diwali', from: '2026-10-20', to: '2026-11-10', en: { any: 'the Diwali run-up: cleaning, shopping and sweets (customs and food only)' } },
];

export function festivalOn(localDate: string | undefined): FestivalId | undefined {
  if (!localDate) return undefined;
  return FESTIVAL_WINDOWS.find((w) => localDate >= w.from && localDate <= w.to)?.id;
}

export function festivalLine(id: FestivalId, station: StationId): string {
  const w = FESTIVAL_WINDOWS.find((f) => f.id === id)!;
  return w.en[station] ?? w.en.any;
}

/** The time of year in one English line, so an ad never sells umbrellas in October. */
const SEASON_EN: Record<number, string> = {
  1: 'January: winter, cold mornings, wedding season',
  2: 'February: the end of winter, exam season is starting',
  3: 'March: summer is arriving, exams and results',
  4: 'April: summer heat, results and school holidays',
  5: 'May: peak summer heat, school holidays',
  6: 'June: the hottest days, the monsoon is about to arrive',
  7: 'July: monsoon rains',
  8: 'August: monsoon rains',
  9: 'September: the last of the monsoon',
  10: 'October: pleasant evenings, the festive season is starting',
  11: 'November: Diwali and the wedding season, the first chill in the air',
  12: 'December: winter and the end of the year',
};
const SEASON_TA: Record<number, string> = {
  10: 'October: the northeast monsoon rains are starting in Chennai, the festive season is on',
  11: 'November: northeast monsoon rains in Chennai, Deepavali season',
  12: 'December: cool, rainy Chennai mornings and the music season',
};

export function monthOf(localDate: string | undefined, now = new Date()): number {
  const m = localDate ? Number(localDate.slice(5, 7)) : NaN;
  return m >= 1 && m <= 12 ? m : now.getUTCMonth() + 1;
}

export function seasonLine(station: StationId, month: number): string {
  return (station === 'ta' ? SEASON_TA[month] : undefined) ?? SEASON_EN[month];
}

/** True when rain is in season for this station in this month. */
export function rainInSeason(station: StationId, month: number): boolean {
  return (RAIN[station] ?? RAIN.any).includes(month);
}

// ---- Picking one ad ------------------------------------------------------------------------------

export interface AdPick {
  card: AdParody;
  problem: AdProblem;
  month: number;
  /** The festival this ad may touch (only when the problem is festive) */
  festival?: FestivalId;
}

export interface AdAvoid {
  /** Card ids aired recently, newest last */
  formats?: string[];
  /** Problem ids aired recently, newest last */
  problems?: string[];
}

function weightedPick<T>(items: T[], weight: (t: T) => number, random: Random): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let r = random() * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}

const inMonth = (months: number[] | undefined, month: number) => !months || months.includes(month);

/** True when a problem id is tied to a festival (used to keep festive ads to 1 in 3). */
export function isFestiveProblem(id: string): boolean {
  return AD_PROBLEMS.some((p) => p.id === id && p.festival);
}

/**
 * One card and one problem that belong together, in season, avoiding the last 3 formats and the last 14
 * problems. A festive problem only when its festival is on and none of the last 2 ads was festive.
 */
export function pickAd(
  station: StationId,
  opts: { localDate?: string; region?: string; avoid?: AdAvoid; random?: Random; now?: Date } = {},
): AdPick {
  const random = opts.random ?? Math.random;
  const month = monthOf(opts.localDate, opts.now);
  const festival = festivalOn(opts.localDate);
  const recentFormats = new Set((opts.avoid?.formats ?? []).slice(-3));
  const recentProblems = new Set((opts.avoid?.problems ?? []).slice(-14));
  const lastTwo = (opts.avoid?.problems ?? []).slice(-2);
  const festiveOk = Boolean(festival) && !lastTwo.some(isFestiveProblem) && (opts.avoid?.problems ? true : random() < 1 / 3);
  const fits = (p: AdProblem, card: AdParody) =>
    p.cards.includes(card.id) &&
    inMonth(p.months, month) &&
    (!p.stations || p.stations.includes(station) || Boolean(opts.region && p.regions?.includes(opts.region))) &&
    (!p.festival || (festiveOk && p.festival === festival));
  const favourite = new Set(FAVOURITES[station] ?? []);
  const seasonal = AD_PARODIES.filter((c) => inMonth(c.months, month) && AD_PROBLEMS.some((p) => fits(p, c)));
  const fresh = seasonal.filter((c) => !recentFormats.has(c.id));
  const card = weightedPick(fresh.length ? fresh : seasonal, (c) => (favourite.has(c.id) ? 2 : 1), random);
  const all = AD_PROBLEMS.filter((p) => fits(p, card));
  const unused = all.filter((p) => !recentProblems.has(p.id));
  const pool = unused.length ? unused : all;
  const festive = pool.filter((p) => p.festival);
  const everyday = pool.filter((p) => !p.festival);
  const problem = festive.length && (!everyday.length || random() < 0.5) ? festive[Math.floor(random() * festive.length) % festive.length] : everyday[Math.floor(random() * everyday.length) % everyday.length];
  return { card, problem, month, ...(problem.festival ? { festival: problem.festival } : {}) };
}
