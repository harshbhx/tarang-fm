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

// ---- Brand puns ---------------------------------------------------------------------------------------------

/**
 * A brand-name pun that works in one language. `on` says what the pun plays on (English, for the writer);
 * `for` lists the problems it suits (absent = it suits any problem on its card).
 */
export interface AdPun {
  brand: string;
  on: string;
  for?: string[];
}

type PunTable = Partial<Record<string, AdPun[]>>;
const p = (brand: string, on: string, ...forProblems: string[]): AdPun => ({ brand, on, ...(forProblems.length ? { for: forProblems } : {}) });

/**
 * Curated brand puns per language per format card (8-12 each). The writer is offered 3 that suit the problem,
 * or coins its own on the same pattern. Never a real brand; the station-language word always comes first, so
 * the brand check finds it. Marathi, Tamil and Bangla have pools for their favourite cards so far.
 */
export const AD_PUNS: Partial<Record<StationId, PunTable>> = {
  hi: {
    mf_disclaimer: [
      p('स्नूज़ फ़ंड', 'snooze + fund', 'alarm_snooze'),
      p('मेहमान-निधि', 'मेहमान (guest) + निधि (fund)', 'guests_stay'),
      p('फ़ॉरवर्ड फ़ंड', 'the good-morning forwards as an investment', 'family_forwards'),
      p('तुलना Growth Fund', 'तुलना (comparison) as the benchmark', 'neighbour_son'),
      p('समोसा SIP', 'a monthly SIP in the last samosa', 'last_samosa'),
      p('रिश्ता-राशि Fund', 'रिश्ता (a match) + राशि (a sum)', 'marriage_question'),
      p('जगह-जमा Fund', 'जगह (space) + जमा (deposit)', 'parking'),
      p('कबाड़-कोष', 'कबाड़ (junk) + कोष (treasury)', 'diwali_cleaning'),
      p('कल-करेंगे Capital', '"we\'ll do it tomorrow" as an asset'),
      p('आलस-ए-आज़म Fund', 'laziness, the great one'),
    ],
    real_estate: [
      p('लिफ़्ट-चुप Heights', 'a building where nobody talks in the lift', 'lift_talk'),
      p('पार्किंग पैराडाइज़', 'a paradise that is mostly parking', 'parking'),
      p('बस-पहुँचा Residency', '"almost there" as an address', 'almost_there'),
      p('बिन-पासवर्ड नगर', 'a town without a Wi-Fi password', 'wifi_password'),
      p('गरम-पानी Greens', 'hot water as the luxury amenity', 'hot_water_queue'),
      p('कूलर-कोना Enclave', 'every flat gets the cooler corner', 'cooler_fight'),
      p('नज़दीक-नगर', '"near-town", which is very far'),
      p('सपना-सिटी', 'the dream city, still a dream'),
    ],
    coaching_topper: [
      p('रात-भर Classes', 'all-night cramming', 'exam_night'),
      p('जाग-जा Academy', 'wake up!', 'alarm_snooze'),
      p('तुलना Tutorials', 'being compared, as a course', 'neighbour_son'),
      p('ढक्कन-खोल Academy', 'jar-lid opening as a subject', 'jar_lid'),
      p('फ़ॉरवर्ड-ज्ञान Classes', 'knowledge from forwards', 'family_forwards'),
      p('नंबर-पूछो Classes', 'relatives asking the marks', 'results_day'),
      p('गरबा-गुरु Classes', 'a one-step garba guru', 'garba_cousin'),
      p('घोटा-लगाओ Institute', 'घोटा लगाना, to cram'),
      p('टॉप-टपरी Classes', 'topper + टपरी (a tea stall)'),
    ],
    dadi_nuskha: [
      p('याद-दाश्त तेल', 'memory oil for the night before', 'exam_night'),
      p('भिन-भिन बाम', 'भिनभिन, the buzz of a mosquito', 'mosquito'),
      p('झड़-रोक तेल', 'stops the falling', 'hair_fall'),
      p('कमर-कस बाम', 'कमर कसना (to gear up) + the back', 'back_pain'),
      p('मीठा-मुक्ति चूरन', 'freedom from sweets', 'sweets_overload'),
      p('ठुमका-ठंडक तेल', 'cooling for dancing feet', 'garba_feet'),
      p('छींक-छूमंतर काढ़ा', 'sneezes, gone like magic', 'first_cold'),
      p('रज़ाई-रिहाई तेल', 'release from the quilt', 'blanket_exit'),
      p('सौ-बूटी तेल', 'a hundred herbs'),
      p('दादी-दम तेल', "grandma's strength"),
    ],
    insurance_papa: [
      p('समोसा-सुरक्षा Plan', 'insurance for the last samosa', 'last_samosa'),
      p('मेहमान-मुक्ति बीमा', 'cover against guests', 'guests_stay'),
      p('एक-प्रतिशत Life', 'life at 1% battery', 'battery_low'),
      p('शादी-सवाल कवच', 'a shield against "when is the wedding?"', 'marriage_question'),
      p('तुलना-कवच', 'a shield against comparisons', 'neighbour_son'),
      p('मार्क्स-माफ़ी बीमा', 'cover for the marks', 'results_day'),
      p('आख़िरी-लड्डू Life', 'cover for the last laddoo', 'sweets_overload'),
      p('कोना-कवच', 'cover for your cooler corner', 'cooler_fight'),
      p('छोटी-ख़ुशी बीमा', 'insurance for small joys'),
    ],
    mega_sale: [
      p('झाड़ू-धमाका Sale', 'a broom blast', 'diwali_cleaning'),
      p('धक्का-मुक्की Mega Sale', 'the shoving crowd', 'festive_rush'),
      p('तीन-न्योता Sale', 'three invitations, one evening', 'wedding_invites'),
      p('शर्तिया Sale', 'शर्तिया (guaranteed) and शर्त (a condition)'),
      p('छूट-पे-छूट Bazaar', 'discount on discount'),
      p('लूट-लो Mart', 'loot it'),
      p('नब्बे-टका Bazaar', 'ninety percent'),
      p('थैला-छूट Mega Sale', 'the bag is what is discounted'),
    ],
    lab_coat_expert: [
      p('रिमोट-राडार', 'a radar for the remote', 'remote_lost'),
      p('उलझन-Off', 'उलझन (a tangle) off', 'earphones'),
      p('गरमा-गरम Labs', 'piping hot', 'chai_cold'),
      p('ढक्कन-Doctor', 'a doctor for jar lids', 'jar_lid'),
      p('मच्छर-मौन Labs', 'mosquito silence', 'mosquito'),
      p('नींद-नियंत्रण Labs', 'sleep control', 'alarm_snooze'),
      p('चुप्पी-तोड़ Spray', 'breaks the silence', 'lift_talk'),
      p('फ़ॉरवर्ड-फ़िल्टर', 'filters the forwards', 'family_forwards'),
      p('बाल-बचाओ Labs', 'save the hair', 'hair_fall'),
      p('कमर-कमाल Labs', 'back wonder', 'back_pain'),
      p('मेहमान-मीटर', 'measures how long guests stay', 'guests_stay', 'wifi_password'),
      p('पक्का-प्रमाणित Labs', '"certainly certified"'),
    ],
    inverter_panic: [
      p('बत्ती-बचाओ Inverter', 'save the light', 'power_cut'),
      p('एपिसोड-रक्षक', "the episode's guardian", 'power_cut'),
      p('एक-परसेंट Power Bank', 'the 1% battery', 'battery_low'),
      p('सुखाओ-शक्ति', 'drying power', 'wet_clothes'),
      p('जुगनू Power', 'a firefly: tiny light'),
      p('टिमटिम Inverter', 'twinkle'),
      p('अंधेरा-भगाओ Inverter', 'chase the dark'),
      p('क्लाइमैक्स-कवच', "the climax's shield"),
    ],
    matrimonial: [
      p('रिमोट-रिश्ते', 'matches made over the remote', 'remote_lost'),
      p('समोसा-साथी', 'a partner for the last samosa', 'last_samosa'),
      p('शादी-कब Matrimony', '"when is the wedding?"', 'marriage_question'),
      p('तुलना-तोड़ Rishtey', 'no more comparisons', 'neighbour_son'),
      p('एक-Step जोड़ी', 'a one-step couple', 'garba_cousin'),
      p('तीन-न्योता Rishtey', 'three invitations', 'wedding_invites'),
      p('जोड़ी-जासूस', 'a couple detective'),
      p('मैच-मिठाई', 'a match and sweets'),
    ],
    teleshopping: [
      p('उलझन-सुलझन', 'tangle, untangle', 'earphones'),
      p('चप्पल-चिपकू', 'the slipper sticker', 'slipper_strap'),
      p('रिमोट-ढूँढू', 'the remote finder', 'remote_lost'),
      p('चाय-चौकीदार', 'a watchman for chai', 'chai_cold'),
      p('सीटी-गिनती Pro', 'whistle counting', 'cooker_count'),
      p('खुल-जा Opener', 'open sesame', 'jar_lid'),
      p('मेहमान-विदा Bell', 'a bell that sees guests off', 'guests_stay', 'wifi_password', 'lift_talk'),
      p('भगाओ-मच्छर Magic', 'chase the mosquito', 'mosquito'),
      p('चार्ज-चौका', 'a four of charge', 'battery_low'),
      p('झटपट-झाड़ू', 'a quick broom', 'diwali_cleaning'),
      p('फ़ॉरवर्ड-फ़रार', 'the forwards run away', 'family_forwards'),
      p('जाग-जा Magic', 'wake up', 'alarm_snooze'),
    ],
    railway_announce: [
      p('विदाई Express', 'the farewell train', 'guests_stay'),
      p('पाँच-मिनट Express', '"five minutes"', 'almost_there'),
      p('जाग-जा Superfast', 'wake up', 'alarm_snooze'),
      p('रिमोट Local', 'the remote, a local train', 'remote_lost'),
      p('पार्किंग Passenger', 'the parking passenger train', 'parking'),
      p('भीड़-भड़क्का Express', 'the crowd', 'festive_rush'),
      p('न्योता Express', 'the invitation train', 'wedding_invites'),
      p('झाड़ू Mail', 'the broom mail train', 'diwali_cleaning'),
      p('लेट-लतीफ़ Express', 'the always-late train'),
    ],
    cooker_whistle: [
      p('सीटी-सम्राट Cooker', 'the whistle emperor'),
      p('गिनती-गुरु Cooker', 'the counting guru'),
      p('सीटी-सेवक', 'the whistle servant'),
      p('कुकर-कैलकुलेटर', 'a calculator cooker'),
      p('तीन-सीटी Pro', 'three whistles'),
      p('भाप-बाबू Cooker', 'Mr Steam'),
      p('सीटी-स्मार्ट', 'whistle-smart'),
      p('पका-पक्का Cooker', 'cooked, for sure'),
    ],
    strong_glue: [
      p('चिपकू-चंद Glue', 'Mr Sticky'),
      p('जोड़-जमाओ', 'join and set'),
      p('छूटे-ना Glue', 'never comes off'),
      p('चप्पल-चिपक', 'slipper stick', 'slipper_strap'),
      p('रिमोट-रोको Glue', 'stop the remote', 'remote_lost'),
      p('हिलना-मना Glue', 'no moving allowed'),
      p('पक्का-जोड़', 'a firm joint'),
      p('चिपक-चैंपियन', 'the sticking champion'),
    ],
    winter_tonic: [
      p('रज़ाई-छोड़ प्राश', 'leave the quilt', 'blanket_exit'),
      p('छींक-मुक्त प्राश', 'sneeze-free', 'first_cold'),
      p('नहाओ-Now Tonic', 'bathe now', 'hot_water_queue'),
      p('ठिठुरन-तोड़ Tonic', 'breaks the shivers'),
      p('सर्दी-सम्राट', 'the winter emperor'),
      p('कंबल-कम Tonic', 'fewer blankets'),
      p('जोश-ए-जाड़ा', 'winter zeal'),
      p('गरम-गरम Tonic', 'warm warm'),
    ],
    cooler_summer: [
      p('कोना-कूल', 'cool corner', 'cooler_fight'),
      p('झगड़ा-ठंडा Cooler', 'cools the fight', 'cooler_fight'),
      p('गद्दी-ठंडी Cooler', 'a cool seat', 'scooter_seat'),
      p('हिमालय-हवा Cooler', 'Himalayan air'),
      p('ठंडा-ठार', 'ice cold'),
      p('बर्फ़ीली-बयार', 'icy breeze'),
      p('शिमला-घर Cooler', 'Shimla at home'),
      p('पसीना-बंद Cooler', 'no more sweat'),
    ],
    rain_gear: [
      p('छाता-छोड़ो-मत', "don't leave the umbrella", 'umbrella_forgot'),
      p('छतरी-साथी', 'the umbrella buddy', 'umbrella_forgot'),
      p('सूखे-मोज़े', 'dry socks', 'wet_socks'),
      p('छप-छप Shoes', 'splash splash', 'wet_socks'),
      p('सुखाओ-सुपर', 'super drying', 'wet_clothes'),
      p('टपक-टप Raincoat', 'drip drop'),
      p('बूँद-बचाओ', 'save from the drop'),
      p('भीगो-मत', "don't get wet"),
    ],
  },
  gu: {
    mf_disclaimer: [
      p('સ્નૂઝ ફંડ', 'snooze + fund', 'alarm_snooze'),
      p('મહેમાન-મૂડી', 'મહેમાન (guest) + મૂડી (capital)', 'guests_stay'),
      p('ફોરવર્ડ ફંડ', 'the forwards as an investment', 'family_forwards'),
      p('સરખામણી Growth Fund', 'સરખામણી (comparison) as the benchmark', 'neighbour_son'),
      p('સમોસા SIP', 'a monthly SIP in the last samosa', 'last_samosa'),
      p('લગ્ન-ક્યારે Fund', '"when is the wedding?"', 'marriage_question'),
      p('પાર્કિંગ પૂંજી', 'parking capital', 'parking'),
      p('ભંગાર-ભંડોળ', 'ભંગાર (junk) + ભંડોળ (fund)', 'diwali_cleaning'),
      p('કાલે-કરીશું Capital', '"we\'ll do it tomorrow" as an asset'),
      p('આળસ Asset Management', 'laziness, managed'),
    ],
    real_estate: [
      p('લિફ્ટ-મૌન Heights', 'nobody talks in the lift', 'lift_talk'),
      p('પાર્કિંગ-પાર્ક Residency', 'a home that is mostly parking', 'parking'),
      p('બસ-પહોંચ્યો Residency', '"almost there" as an address', 'almost_there'),
      p('પાસવર્ડ-પુર', 'the Wi-Fi password town', 'wifi_password'),
      p('ગરમ-પાણી Greens', 'hot water as the amenity', 'hot_water_queue'),
      p('કૂલર-ખૂણો Enclave', 'every flat gets the cooler corner', 'cooler_fight'),
      p('નજીક-નગર', '"near-town", which is very far'),
      p('સપના-સિટી', 'the dream city, still a dream'),
    ],
    coaching_topper: [
      p('આખી-રાત Classes', 'all-night cramming', 'exam_night'),
      p('જાગ-જા Academy', 'wake up!', 'alarm_snooze'),
      p('સરખામણી Tutorials', 'being compared, as a course', 'neighbour_son'),
      p('ઢાંકણ-ખોલ Academy', 'jar-lid opening as a subject', 'jar_lid'),
      p('ફોરવર્ડ-જ્ઞાન Classes', 'knowledge from forwards', 'family_forwards'),
      p('માર્ક્સ-પૂછો Classes', 'relatives asking the marks', 'results_day'),
      p('એક-સ્ટેપ ગરબા Academy', 'the one-step garba academy', 'garba_cousin'),
      p('ટોપર-ટપરી Classes', 'topper + ટપરી (a tea stall)'),
      p('ગોખો-ગોખો Institute', 'cram, cram'),
    ],
    dadi_nuskha: [
      p('યાદ-શક્તિ તેલ', 'memory oil for the night before', 'exam_night'),
      p('ગણગણ બામ', 'ગણગણ, the buzz of a mosquito', 'mosquito'),
      p('ખરતા-રોક તેલ', 'stops the falling', 'hair_fall'),
      p('કમર-કસ બામ', 'કમર કસવી (to gear up) + the back', 'back_pain'),
      p('મીઠાઈ-મુક્તિ ચૂરણ', 'freedom from sweets', 'sweets_overload'),
      p('ગરબા-ગાદી તેલ', 'a cushion for garba feet', 'garba_feet'),
      p('છીંક-છૂ ઉકાળો', 'sneezes, gone', 'first_cold'),
      p('ગોદડું-છોડ તેલ', 'leave the quilt', 'blanket_exit'),
      p('સો-જડીબુટ્ટી તેલ', 'a hundred herbs'),
      p('બા-નો-બામ', "grandma's balm"),
    ],
    insurance_papa: [
      p('સમોસા-સુરક્ષા Plan', 'insurance for the last samosa', 'last_samosa'),
      p('મહેમાન-મુક્તિ વીમો', 'cover against guests', 'guests_stay'),
      p('એક-ટકા Life', 'life at 1% battery', 'battery_low'),
      p('લગ્ન-સવાલ કવચ', 'a shield against "when is the wedding?"', 'marriage_question'),
      p('સરખામણી-કવચ', 'a shield against comparisons', 'neighbour_son'),
      p('માર્ક્સ-માફી વીમો', 'cover for the marks', 'results_day'),
      p('છેલ્લો-લાડુ Life', 'cover for the last laddoo', 'sweets_overload'),
      p('ખૂણો-કવચ', 'cover for your cooler corner', 'cooler_fight'),
      p('નાની-ખુશી વીમો', 'insurance for small joys'),
    ],
    mega_sale: [
      p('સાફસફાઈ ધમાકા Sale', 'the cleaning blast', 'diwali_cleaning'),
      p('ધક્કા-મુક્કી Mega Sale', 'the shoving crowd', 'festive_rush'),
      p('ત્રણ-કંકોતરી Sale', 'three wedding cards, one evening', 'wedding_invites'),
      p('ભાવતાલ Bazaar', 'ભાવતાલ, the bargaining'),
      p('શરતિયા Sale', 'શરતિયા (guaranteed) and શરત (a condition)'),
      p('લૂંટી-લો Mart', 'loot it'),
      p('નેવું-ટકા Bazaar', 'ninety percent'),
      p('થેલી-છૂટ Mega Sale', 'the bag is what is discounted'),
    ],
    lab_coat_expert: [
      p('રિમોટ-રડાર', 'a radar for the remote', 'remote_lost'),
      p('ગૂંચ-Off', 'ગૂંચ (a tangle) off', 'earphones'),
      p('ગરમાગરમ Labs', 'piping hot', 'chai_cold'),
      p('ઢાંકણ-Doctor', 'a doctor for jar lids', 'jar_lid'),
      p('મચ્છર-મૌન Labs', 'mosquito silence', 'mosquito'),
      p('ઊંઘ-નિયંત્રણ Labs', 'sleep control', 'alarm_snooze'),
      p('વાળ-બચાવ Labs', 'save the hair', 'hair_fall'),
      p('ગરબા-પગ Labs', 'garba feet science', 'garba_feet'),
      p('કમર-કમાલ Labs', 'back wonder', 'back_pain'),
      p('મહેમાન-મીટર', 'measures how long guests stay', 'guests_stay', 'wifi_password'),
      p('પોળ-પંડિત Labs', 'the scholars of the pol'),
      p('પાક્કું-પ્રમાણિત Labs', '"certainly certified"'),
    ],
    inverter_panic: [
      p('બત્તી-બચાવ Inverter', 'save the light', 'power_cut'),
      p('એપિસોડ-રક્ષક', "the episode's guardian", 'power_cut'),
      p('એક-ટકા Power Bank', 'the 1% battery', 'battery_low'),
      p('સૂકવો-શક્તિ', 'drying power', 'wet_clothes'),
      p('આગિયો Power', 'a firefly: tiny light'),
      p('ટમટમ Inverter', 'twinkle'),
      p('અંધારું-ભગાડ Inverter', 'chase the dark'),
      p('ક્લાઇમેક્સ-કવચ', "the climax's shield"),
    ],
    matrimonial: [
      p('રિમોટ-જોડી', 'a couple made over the remote', 'remote_lost'),
      p('સમોસા-સાથી', 'a partner for the last samosa', 'last_samosa'),
      p('લગ્ન-ક્યારે Matrimony', '"when is the wedding?"', 'marriage_question'),
      p('સરખામણી-તોડ Matrimony', 'no more comparisons', 'neighbour_son'),
      p('એક-સ્ટેપ જોડી', 'a one-step garba couple', 'garba_cousin'),
      p('ત્રણ-કંકોતરી Matrimony', 'three wedding cards', 'wedding_invites'),
      p('જોડી-જાસૂસ', 'a couple detective'),
      p('મેળ-મીઠાઈ', 'a match and sweets'),
    ],
    teleshopping: [
      p('ગૂંચ-ઉકેલ', 'the tangle solver', 'earphones'),
      p('ચંપલ-ચીપકુ', 'the slipper sticker', 'slipper_strap'),
      p('રિમોટ-શોધક', 'the remote finder', 'remote_lost'),
      p('ચા-ચોકીદાર', 'a watchman for chai', 'chai_cold'),
      p('સીટી-ગણતરી Pro', 'whistle counting', 'cooker_count'),
      p('ખુલ-જા Opener', 'open sesame', 'jar_lid'),
      p('મહેમાન-વિદાય Bell', 'a bell that sees guests off', 'guests_stay', 'wifi_password', 'lift_talk'),
      p('ચાર્જ-ચોગ્ગો', 'a four of charge', 'battery_low'),
      p('ઝટપટ-ઝાડુ', 'a quick broom', 'diwali_cleaning'),
      p('ગરબા-ગુરુ Magic', 'the garba guru', 'garba_cousin'),
      p('ફોરવર્ડ-ફરાર', 'the forwards run away', 'family_forwards'),
      p('જાગ-જા Magic', 'wake up', 'alarm_snooze'),
    ],
    railway_announce: [
      p('વિદાય Express', 'the farewell train', 'guests_stay'),
      p('પાંચ-મિનિટ Express', '"five minutes"', 'almost_there'),
      p('જાગ-જા Superfast', 'wake up', 'alarm_snooze'),
      p('રિમોટ Local', 'the remote, a local train', 'remote_lost'),
      p('પાર્કિંગ Passenger', 'the parking passenger train', 'parking'),
      p('ભીડભાડ Express', 'the crowd', 'festive_rush'),
      p('કંકોતરી Express', 'the wedding-card train', 'wedding_invites'),
      p('ઝાડુ Mail', 'the broom mail train', 'diwali_cleaning'),
      p('લેટ-લતીફ Express', 'the always-late train'),
    ],
    cooker_whistle: [
      p('સીટી-સમ્રાટ Cooker', 'the whistle emperor'),
      p('ગણતરી-ગુરુ Cooker', 'the counting guru'),
      p('સીટી-સેવક', 'the whistle servant'),
      p('કૂકર-કેલ્ક્યુલેટર', 'a calculator cooker'),
      p('ત્રણ-સીટી Pro', 'three whistles'),
      p('વરાળ-વીર Cooker', 'the steam hero'),
      p('સીટી-સ્માર્ટ', 'whistle-smart'),
      p('પાક્કું-પાક Cooker', 'cooked, for sure'),
    ],
    strong_glue: [
      p('ચીપકુ-ચંદ Glue', 'Mr Sticky'),
      p('જોડ-જમાવ', 'join and set'),
      p('છૂટે-નહીં Glue', 'never comes off'),
      p('ચંપલ-ચીપક', 'slipper stick', 'slipper_strap'),
      p('રિમોટ-રોક Glue', 'stop the remote', 'remote_lost'),
      p('હલવું-મના Glue', 'no moving allowed'),
      p('પાક્કો-જોડ', 'a firm joint'),
      p('ચોંટી-જા Glue', 'just stick'),
    ],
    winter_tonic: [
      p('ગોદડું-છોડ પાક', 'leave the quilt (પાક, a winter sweet)', 'blanket_exit'),
      p('છીંક-મુક્ત પાક', 'sneeze-free', 'first_cold'),
      p('નહાઓ-Now Tonic', 'bathe now', 'hot_water_queue'),
      p('ઠંડી-તોડ Tonic', 'breaks the cold'),
      p('શિયાળુ-સમ્રાટ', 'the winter emperor'),
      p('ગરમાટો Tonic', 'ગરમાટો, warmth'),
      p('જોશ-એ-શિયાળો', 'winter zeal'),
      p('અડદિયા-શક્તિ', 'the strength of adadiya'),
    ],
    cooler_summer: [
      p('ખૂણો-કૂલ', 'cool corner', 'cooler_fight'),
      p('ઝઘડો-ઠંડો Cooler', 'cools the fight', 'cooler_fight'),
      p('સીટ-ઠંડી Cooler', 'a cool seat', 'scooter_seat'),
      p('હિમાલય-હવા Cooler', 'Himalayan air'),
      p('ઠંડુંગાર', 'ice cold'),
      p('બરફીલી-લહેર', 'icy breeze'),
      p('સિમલા-ઘર Cooler', 'Shimla at home'),
      p('પરસેવો-બંધ Cooler', 'no more sweat'),
    ],
    rain_gear: [
      p('છત્રી-ભૂલો-નહીં', "don't forget the umbrella", 'umbrella_forgot'),
      p('છત્રી-સાથી', 'the umbrella buddy', 'umbrella_forgot'),
      p('કોરા-મોજાં', 'dry socks', 'wet_socks'),
      p('છપ-છપ Shoes', 'splash splash', 'wet_socks'),
      p('સૂકવો-સુપર', 'super drying', 'wet_clothes'),
      p('ટપક-ટપ Raincoat', 'drip drop'),
      p('ટીપું-બચાવ', 'save from the drop'),
      p('ભીંજાવ-નહીં', "don't get wet"),
    ],
  },
  mr: {
    railway_announce: [
      p('निरोप Express', 'the farewell train', 'guests_stay'),
      p('पाच-मिनिट Express', '"five minutes"', 'almost_there'),
      p('उठ-रे Superfast', 'wake up', 'alarm_snooze'),
      p('रिमोट Local', 'the remote, a local train', 'remote_lost'),
      p('पार्किंग Passenger', 'the parking passenger train', 'parking'),
      p('गर्दी Express', 'the crowd', 'festive_rush'),
      p('झाडू Mail', 'the broom mail train', 'diwali_cleaning'),
      p('लेटलतीफ Express', 'the always-late train'),
    ],
    cooker_whistle: [
      p('शिट्टी-सम्राट Cooker', 'the whistle emperor'),
      p('मोजणी-गुरू Cooker', 'the counting guru'),
      p('शिट्टी-सेवक', 'the whistle servant'),
      p('कुकर-कॅल्क्युलेटर', 'a calculator cooker'),
      p('तीन-शिट्टी Pro', 'three whistles'),
      p('वाफ-वीर Cooker', 'the steam hero'),
      p('शिट्टी-स्मार्ट', 'whistle-smart'),
      p('पक्का-शिजव Cooker', 'cooked, for sure'),
    ],
  },
  ta: {
    teleshopping: [
      p('சிக்கல்-தீர்வு', 'the tangle solver', 'earphones'),
      p('செருப்பு-ஒட்டி', 'the slipper sticker', 'slipper_strap'),
      p('ரிமோட்-தேடி', 'the remote finder', 'remote_lost'),
      p('டீ-காவலன்', 'a watchman for tea', 'chai_cold'),
      p('விசில்-எண்ணி Pro', 'whistle counting', 'cooker_count'),
      p('விருந்தாளி-விடை Bell', 'a bell that sees guests off', 'guests_stay', 'wifi_password', 'lift_talk'),
      p('சார்ஜ்-சிக்ஸர்', 'a six of charge', 'battery_low'),
      p('எழுந்திரு Magic', 'wake up', 'alarm_snooze'),
    ],
    insurance_papa: [
      p('சமோசா-பாதுகாப்பு Plan', 'insurance for the last samosa', 'last_samosa'),
      p('விருந்தாளி-விடுதலை Insurance', 'cover against guests', 'guests_stay'),
      p('ஒரு-சதவீதம் Life', 'life at 1% battery', 'battery_low'),
      p('கல்யாணம்-எப்போ கவசம்', 'a shield against "when is the wedding?"', 'marriage_question'),
      p('ஒப்பீடு-கவசம்', 'a shield against comparisons', 'neighbour_son'),
      p('மார்க்-மன்னிப்பு Insurance', 'cover for the marks', 'results_day'),
      p('கடைசி-லட்டு Life', 'cover for the last laddoo', 'sweets_overload'),
      p('சின்ன-சந்தோஷம் Insurance', 'insurance for small joys'),
    ],
  },
  bn: {
    matrimonial: [
      p('রিমোট-জুটি', 'a couple made over the remote', 'remote_lost'),
      p('শিঙাড়া-সাথী', 'a partner for the last singara', 'last_samosa'),
      p('বিয়ে-কবে Matrimony', '"when is the wedding?"', 'marriage_question'),
      p('তুলনা-ভাঙা Matrimony', 'no more comparisons', 'neighbour_son'),
      p('তিন-নিমন্ত্রণ Matrimony', 'three invitations', 'wedding_invites'),
      p('জুটি-গোয়েন্দা', 'a couple detective'),
      p('মিল-মিষ্টি', 'a match and sweets'),
      p('মনের-মিল Match', 'a meeting of minds'),
    ],
    lab_coat_expert: [
      p('রিমোট-রাডার', 'a radar for the remote', 'remote_lost'),
      p('জট-Off', 'জট (a tangle) off', 'earphones'),
      p('গরমাগরম Labs', 'piping hot', 'chai_cold'),
      p('ঢাকনা-Doctor', 'a doctor for jar lids', 'jar_lid'),
      p('মশা-মৌন Labs', 'mosquito silence', 'mosquito'),
      p('ঘুম-নিয়ন্ত্রণ Labs', 'sleep control', 'alarm_snooze'),
      p('চুল-বাঁচাও Labs', 'save the hair', 'hair_fall'),
      p('পাড়া-পণ্ডিত Labs', 'the scholars of the para'),
    ],
  },
};

/**
 * Up to 3 puns for this card and problem: the ones made for the problem first, then the card's general ones,
 * never a brand that already aired. Empty when the station has no pool for the card (the writer coins one).
 */
export function punChoices(
  station: StationId,
  card: string,
  problem: string,
  opts: { random?: Random; avoid?: ReadonlySet<string>; normalize?: (s: string) => string } = {},
): AdPun[] {
  const random = opts.random ?? Math.random;
  const norm = opts.normalize ?? ((s: string) => s);
  const pool = (AD_PUNS[station]?.[card] ?? []).filter((x) => !opts.avoid?.has(norm(x.brand)));
  const shuffle = (list: AdPun[]) => list.map((x) => [random(), x] as const).sort((a, b) => a[0] - b[0]).map(([, x]) => x);
  const made = shuffle(pool.filter((x) => x.for?.includes(problem)));
  const general = shuffle(pool.filter((x) => !x.for));
  return [...made, ...general].slice(0, 3);
}
