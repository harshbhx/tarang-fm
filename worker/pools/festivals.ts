/**
 * Static Indian festival and observance calendar, 11 Oct 2026 to 31 Mar 2027, for Tarang FM RJ facts (worker/facts/calendar.ts).
 * Embedded at build time: no runtime API. Researched and cross-checked 2026-10-15 (weekdays self-checked in worker/facts/calendar.test.ts).
 *
 * SOURCES (codes used in each row's `sources`):
 *   DRIK    drikpanchang.com Hindu calendar 2026, computed for New Delhi (hinducalendar.html?geoname-id=1261481&year=2026)
 *   DRIK-TA drikpanchang.com Tamil calendar 2026 (tamil/tamil-calendar.html?year=2026), computed for New Delhi
 *   DRIK-27 drikpanchang.com Thai Pongal 2027 page (Sankranti moment 21:14 IST on 14 Jan 2027, New Delhi)
 *   GCAL    Google Calendar public "Holidays in India" ICS (en.indian#holiday@group.v.calendar.google.com), fetched 2026-10-15
 *   CGEWCC  Gazetted holiday list 2026 for central govt offices (dfe.gov.in list-of-gazetted-holidays-2026.pdf)
 *   TN-GO   Tamil Nadu G.O. Ms. No. 708 (11 Nov 2025) holiday list, as reproduced by sakshipost.com / cleartax.in
 *   WB-LIST West Bengal 2026 holiday list as reproduced by cleartax.in / bankbazaar.com / officeholidays.com
 *   SHUBH   shubhpanchang.com daily calendar 2026
 *   HT      hindutone.com festival guides 2026 (secondary; cites Drik)
 *   HAIND   haindavam.org festival listings
 *   OH      officeholidays.com India 2027 listings
 *   MISC    other secondary sites named in `note`
 *   FIXED   fixed civil/commemorative date (law or convention), no lunar calculation
 *   CALC    computed in this research (SunCalc moon phases; Easter computus); see context.md
 *
 * CONFIDENCE:
 *   confirmed  DRIK (or a fixed rule) plus at least one independent source agree. Safe to say the date on air.
 *   disputed   a credible source gives a different day (the regional panchang, Google, or the state list). Use the
 *              listed date for logic, but on air say "इस हफ़्ते" / "कल-परसों" rather than asserting the exact day.
 *   single     only one source checked. Fine for logic and greetings on the day; don't build a countdown on it.
 *   tentative  depends on moon sighting (Eid). Never announce in advance.
 *
 * Panchang dates are New Delhi unless noted; tithis can shift a festival by a day in other cities.
 * `customs` are short, widely known, non-religious hooks (food, rituals people do, public events) for the
 * RJ's "festival story" payload. No religious commentary. A region-specific custom starts with "<Region>: ", where
 * Region is a cf.region state name or "North India"; use customFor() so Chennai never gets the Gujarat garba line.
 */

export type StationLang = 'hi' | 'mr' | 'ta' | 'bn' | 'gu';
export type Confidence = 'confirmed' | 'disputed' | 'single' | 'tentative';
export type FestivalKind = 'festival' | 'national' | 'observance' | 'regional';

export interface Festival {
  id: string;
  /** Main day, YYYY-MM-DD, IST */
  date: string;
  /** Last day for multi-day festivals (inclusive) */
  end?: string;
  name: string;
  /** Names in station scripts. A station only mentions a festival it has a name for, unless `stations` is 'all'. */
  names: Partial<Record<StationLang, string>>;
  /** Which stations should bring it up. 'all' = national. */
  stations: StationLang[] | 'all';
  /** cf.region values where it is the big local festival (boosts priority) */
  states?: string[];
  kind: FestivalKind;
  /** Public holiday status, where verified */
  holiday?: 'national' | 'gazetted' | 'state';
  confidence: Confidence;
  sources: string[];
  note?: string;
  customs?: string[];
}

export const FESTIVALS: Festival[] = [
  // ---------------------------------------------------------------- October 2026
  {
    id: 'navratri', date: '2026-10-11', end: '2026-10-19', name: 'Sharad Navratri',
    names: { hi: 'नवरात्रि', mr: 'नवरात्र', ta: 'நவராத்திரி', bn: 'নবরাত্রি', gu: 'નવરાત્રી' },
    stations: 'all', states: ['Gujarat', 'Maharashtra', 'Uttar Pradesh', 'Delhi'], kind: 'festival', confidence: 'confirmed',
    sources: ['DRIK', 'GCAL'],
    note: 'DRIK: begins Sun 11 Oct; Durga Ashtami and Maha Navami both Mon 19 Oct (New Delhi). Never announce a day number: calendars disagree.',
    customs: ['Gujarat: garba and dandiya nights', 'Tamil Nadu: golu, steps of dolls set up at home', 'Maharashtra: a colour of the day for clothes on each of the nine days'],
  },
  {
    id: 'durga-shashthi', date: '2026-10-17', name: 'Durga Puja: Maha Shashthi',
    names: { bn: 'মহাষষ্ঠী', hi: 'दुर्गा पूजा (षष्ठी)' }, stations: ['bn', 'hi'], states: ['West Bengal', 'Tripura', 'Assam'],
    kind: 'regional', confidence: 'confirmed', sources: ['GCAL', 'HT'],
    note: 'GCAL "First Day of Durga Puja Festivities" 17 Oct; HT Kolkata Shashthi Sat 17 Oct. One secondary site says 16 Oct; DRIK shows the Durga Puja range 16-21 Oct.',
    customs: ['pandal hopping late into the night', 'Bodhon, the unveiling of the idol\'s face'],
  },
  {
    id: 'durga-saptami', date: '2026-10-18', name: 'Durga Puja: Maha Saptami',
    names: { bn: 'মহাসপ্তমী' }, stations: ['bn'], states: ['West Bengal'], kind: 'regional', confidence: 'confirmed',
    sources: ['GCAL', 'HT'], customs: ['Kola Bou (nabapatrika) bath at dawn by the river'],
  },
  {
    id: 'durga-ashtami', date: '2026-10-19', name: 'Durga Puja: Maha Ashtami',
    names: { bn: 'মহাষ্টমী', hi: 'दुर्गा अष्टमी' }, stations: ['bn', 'hi'], states: ['West Bengal'], kind: 'regional',
    confidence: 'confirmed', sources: ['GCAL', 'HT', 'DRIK'],
    customs: ['Ashtami anjali in the morning, often fasting till then', 'Kumari Puja', 'dhunuchi dance at the evening arati'],
  },
  {
    id: 'ayudha-pooja', date: '2026-10-19', name: 'Ayudha Pooja / Saraswati Pooja',
    names: { ta: 'ஆயுத பூஜை' }, stations: ['ta'], states: ['Tamil Nadu', 'Karnataka'], kind: 'regional', holiday: 'state',
    confidence: 'disputed', sources: ['TN-GO', 'DRIK-TA'],
    note: 'TN holiday lists: Mon 19 Oct. DRIK-TA (New Delhi-computed) lists Ayutha Poojai on Tue 20 Oct. Prefer the state holiday date.',
    customs: ['tools, vehicles and books cleaned and decorated with sandal paste and kumkum', 'pori, sundal and sweets shared'],
  },
  {
    id: 'durga-navami', date: '2026-10-20', name: 'Durga Puja: Maha Navami',
    names: { bn: 'মহানবমী' }, stations: ['bn'], states: ['West Bengal'], kind: 'regional', confidence: 'disputed',
    sources: ['HT'], note: 'HT (Bengal panjika): Tue 20 Oct. DRIK (New Delhi) puts Maha Navami on 19 Oct with Ashtami.',
  },
  {
    id: 'dussehra', date: '2026-10-20', name: 'Dussehra / Vijayadashami',
    names: { hi: 'दशहरा', mr: 'दसरा', ta: 'விஜயதசமி', bn: 'দশেরা', gu: 'દશેરા' },
    stations: 'all', kind: 'festival', holiday: 'gazetted', confidence: 'confirmed', sources: ['DRIK', 'GCAL', 'CGEWCC', 'MISC'],
    note: 'MISC: angelone.in holiday list (Tue 20 Oct). Bengal\'s Bijoya Dashami is 21 Oct (see next row).',
    customs: ['North India: Ravan effigies burnt at Ramlila grounds', 'Maharashtra: apta leaves exchanged as "gold" (सोनं घ्या, सोन्यासारखं राहा)', 'Gujarat: fafda-jalebi for breakfast', 'Tamil Nadu: Vidyarambham, children write their first letters'],
  },
  {
    id: 'bijoya-dashami', date: '2026-10-21', name: 'Bijoya Dashami (Bengal)',
    names: { bn: 'বিজয়া দশমী' }, stations: ['bn'], states: ['West Bengal'], kind: 'regional', confidence: 'confirmed',
    sources: ['HT', 'DRIK'], note: 'DRIK Durga Puja range ends 21 Oct; HT: Wed 21 Oct, a day after the all-India Vijayadashami.',
    customs: ['sindoor khela among married women', 'idol immersion processions', 'Bijoya greetings and sweets (narkel naru, nimki) for days after'],
  },
  {
    id: 'sharad-purnima', date: '2026-10-25', name: 'Sharad Purnima / Kojagiri / Kojagari Lakshmi Puja',
    names: { hi: 'शरद पूर्णिमा', mr: 'कोजागिरी पौर्णिमा', gu: 'શરદ પૂનમ', bn: 'কোজাগরী লক্ষ্মীপূজা' },
    stations: ['hi', 'mr', 'gu', 'bn'], kind: 'festival', confidence: 'confirmed', sources: ['DRIK', 'SHUBH', 'CALC'],
    note: 'DRIK: Sharad Purnima and Kojagara Puja Sun 25 Oct; Ashwina Purnima Mon 26 Oct. CALC: astronomical full moon on 26 Oct (IST). The night of 25 Oct is the one people celebrate.',
    customs: ['North India: kheer left out in the moonlight', 'Maharashtra: masala doodh at midnight', 'Gujarat: doodh-pauva on the terrace', 'West Bengal: Kojagari Lakshmi Puja at home, with alpana on the floor'],
  },
  {
    id: 'valmiki-jayanti', date: '2026-10-26', name: 'Maharishi Valmiki Jayanti',
    names: { hi: 'वाल्मीकि जयंती' }, stations: ['hi'], kind: 'observance', confidence: 'confirmed', sources: ['GCAL', 'DRIK'],
    note: 'GCAL 26 Oct; matches DRIK Ashwina Purnima 26 Oct.',
  },
  {
    id: 'karva-chauth', date: '2026-10-29', name: 'Karva Chauth',
    names: { hi: 'करवा चौथ' }, stations: ['hi'], states: ['Delhi', 'Punjab', 'Haryana', 'Rajasthan', 'Uttar Pradesh'],
    kind: 'festival', confidence: 'confirmed', sources: ['DRIK', 'GCAL', 'SHUBH'],
    note: 'GCAL calls it "Karaka Chaturthi". Delhi moonrise about 20:12 IST per vedpanchang.com / panchangbodh.com (SunCalc gives 20:00): say "सवा आठ के आसपास", never an exact minute.',
    customs: ['sargi eaten before dawn', 'fast until the moon is seen', 'the moon, then the husband, seen through a sieve'],
  },
  {
    id: 'ekta-diwas', date: '2026-10-31', name: 'Rashtriya Ekta Diwas (Sardar Patel Jayanti)',
    names: { hi: 'राष्ट्रीय एकता दिवस', gu: 'સરદાર પટેલ જયંતી' }, stations: ['hi', 'gu'], states: ['Gujarat'],
    kind: 'national', confidence: 'confirmed', sources: ['FIXED'], note: 'Sardar Patel born 31 Oct 1875.',
    customs: ['Run for Unity events', 'celebrations at the Statue of Unity, Kevadia'],
  },
  // ---------------------------------------------------------------- November 2026
  {
    id: 'ahoi-ashtami', date: '2026-11-01', name: 'Ahoi Ashtami',
    names: { hi: 'अहोई अष्टमी' }, stations: ['hi'], kind: 'festival', confidence: 'disputed', sources: ['DRIK'],
    note: 'DRIK: Sun 1 Nov. HT lists Mon 2 Nov.', customs: ['mothers fast until the stars come out'],
  },
  {
    id: 'vasubaras', date: '2026-11-05', name: 'Vasubaras / Vagh Baras (Govatsa Dwadashi)',
    names: { mr: 'वसुबारस', gu: 'વાઘ બારસ' }, stations: ['mr', 'gu'], states: ['Maharashtra', 'Gujarat'], kind: 'regional',
    confidence: 'single', sources: ['DRIK'], note: 'First day of Diwali in Maharashtra and Gujarat.',
    customs: ['Maharashtra: a cow and her calf are honoured', 'first diyas and rangoli of Diwali'],
  },
  {
    id: 'dhanteras', date: '2026-11-06', name: 'Dhanteras / Dhantrayodashi',
    names: { hi: 'धनतेरस', mr: 'धनत्रयोदशी', gu: 'ધનતેરસ', bn: 'ধনতেরাস' }, stations: 'all', kind: 'festival',
    confidence: 'confirmed', sources: ['DRIK', 'MISC'],
    note: 'DRIK: Fri 6 Nov; azafashions.com 5-day calendar agrees. One SEO page says 5 Nov.',
    customs: ['buying a new steel utensil, silver coin or gold', 'jewellery shops open late'],
  },
  {
    id: 'kali-chaudas', date: '2026-11-07', name: 'Kali Chaudas',
    names: { gu: 'કાળી ચૌદસ' }, stations: ['gu'], states: ['Gujarat'], kind: 'regional', confidence: 'single', sources: ['DRIK'],
  },
  {
    id: 'diwali', date: '2026-11-08', name: 'Diwali / Lakshmi Puja (Naraka Chaturdashi the same day)',
    names: { hi: 'दीवाली', mr: 'दिवाळी', ta: 'தீபாவளி', bn: 'দীপাবলি', gu: 'દિવાળી' }, stations: 'all', kind: 'festival',
    holiday: 'gazetted', confidence: 'confirmed', sources: ['DRIK', 'GCAL', 'CGEWCC', 'DRIK-TA', 'TN-GO'],
    note: 'Sun 8 Nov in every source. Naraka Chaturdashi / Choti Diwali also 8 Nov (DRIK, GCAL). A second DRIK Tamil page dates the Tamil pre-dawn Deepavali to Sat 7 Nov; DRIK-TA calendar and TN-GO say 8 Nov.',
    customs: ['diyas, rangoli and crackers after dark', 'North India: Lakshmi Puja in the evening, then sweets and visits to neighbours', 'West Bengal: Diwali night is Kali Puja night', 'Tamil Nadu: oil bath before dawn, new clothes, crackers in the morning', 'Maharashtra: faral (chakli, karanji, shankarpali, chivda) and kids building clay forts (killa)', 'Gujarat: chopda pujan, new account books for traders'],
  },
  {
    id: 'kali-puja', date: '2026-11-08', name: 'Kali Puja',
    names: { bn: 'কালীপূজা' }, stations: ['bn'], states: ['West Bengal'], kind: 'regional', holiday: 'state',
    confidence: 'confirmed', sources: ['WB-LIST', 'OH'], customs: ['night-long puja on the new moon', 'fourteen lamps (choddo prodip) the evening before'],
  },
  {
    id: 'govardhan-puja', date: '2026-11-10', name: 'Govardhan Puja / Annakut',
    names: { hi: 'गोवर्धन पूजा' }, stations: ['hi'], kind: 'festival', confidence: 'disputed', sources: ['DRIK', 'GCAL', 'MISC'],
    note: 'DRIK and dekhopanchang.com: Tue 10 Nov. GCAL: Mon 9 Nov. 9 Nov is still Amavasya (CALC: new moon on the morning of 9 Nov IST), which is why panchangs move Pratipada festivals to 10 Nov.',
    customs: ['annakut: a "mountain" of many dishes offered and shared'],
  },
  {
    id: 'bestu-varas', date: '2026-11-10', name: 'Bestu Varas (Gujarati New Year, Vikram Samvat 2083)',
    names: { gu: 'બેસતું વર્ષ', hi: 'गुजराती नया साल' }, stations: ['gu', 'hi'], states: ['Gujarat'], kind: 'regional',
    confidence: 'confirmed', sources: ['HT', 'HAIND'],
    note: 'HT dedicated guide (citing DRIK) and HAIND: Tue 10 Nov. One HT Diwali page says 9 Nov. Same tithi as Govardhan Puja.',
    customs: ['"Saal Mubarak" and "Nutan Varshabhinandan" greetings', 'visiting elders in new clothes', 'sabras (salt) bought at dawn for luck'],
  },
  {
    id: 'diwali-padwa', date: '2026-11-10', name: 'Diwali Padwa / Bali Pratipada',
    names: { mr: 'दिवाळी पाडवा' }, stations: ['mr'], states: ['Maharashtra'], kind: 'regional', confidence: 'disputed',
    sources: ['DRIK'], note: 'Same Kartik Shukla Pratipada as Govardhan Puja (DRIK 10 Nov; GCAL would imply 9 Nov).',
    customs: ['husbands give wives a gift, wives do aukshan (aarti)', 'one of the 3.5 auspicious days for buying gold or a new vehicle'],
  },
  {
    id: 'bhai-dooj', date: '2026-11-11', name: 'Bhai Dooj / Bhaubeej / Bhai Bij / Bhai Phonta',
    names: { hi: 'भाई दूज', mr: 'भाऊबीज', gu: 'ભાઈબીજ', bn: 'ভাইফোঁটা' }, stations: ['hi', 'mr', 'gu', 'bn'], kind: 'festival',
    confidence: 'confirmed', sources: ['DRIK', 'GCAL', 'WB-LIST'],
    note: 'Wed 11 Nov in DRIK, GCAL and the West Bengal list (Bhatridwitiya). One Bengal travel blog says "10 or 11".',
    customs: ['sister puts a tilak, brother gives a gift', 'West Bengal: sandalwood phonta on the brother\'s forehead with the rhyme "ভাইয়ের কপালে দিলাম ফোঁটা"'],
  },
  {
    id: 'labh-pancham', date: '2026-11-14', name: 'Labh Pancham',
    names: { gu: 'લાભ પાંચમ' }, stations: ['gu'], states: ['Gujarat'], kind: 'regional', confidence: 'confirmed',
    sources: ['SHUBH', 'HT'], customs: ['shops and offices reopen after the Diwali break'],
  },
  {
    id: 'childrens-day', date: '2026-11-14', name: "Children's Day",
    names: { hi: 'बाल दिवस', mr: 'बालदिन', ta: 'குழந்தைகள் தினம்', bn: 'শিশু দিবস', gu: 'બાળ દિવસ' }, stations: 'all',
    kind: 'national', confidence: 'confirmed', sources: ['FIXED'], note: 'Nehru born 14 Nov 1889.',
  },
  {
    id: 'chhath', date: '2026-11-15', name: 'Chhath Puja (evening arghya)',
    names: { hi: 'छठ पूजा' }, stations: ['hi'], states: ['Bihar', 'Jharkhand', 'Uttar Pradesh', 'Delhi'], kind: 'festival',
    confidence: 'confirmed', sources: ['DRIK', 'GCAL'], note: 'Morning arghya to the rising sun on 16 Nov (derived).',
    customs: ['arghya to the setting and then the rising sun, standing in a river or pond', 'thekua', 'ghats cleaned and lit up'],
  },
  {
    id: 'soorasamharam', date: '2026-11-15', name: 'Kanda Sashti: Soorasamharam',
    names: { ta: 'சூரசம்ஹாரம்' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'regional', confidence: 'confirmed',
    sources: ['DRIK-TA', 'HT'], note: 'An older DRIK version said 14 Nov.', customs: ['the big re-enactment on the beach at Tiruchendur'],
  },
  {
    id: 'kartiki-ekadashi', date: '2026-11-20', name: 'Prabodhini / Dev Uthani / Kartiki Ekadashi',
    names: { hi: 'देवउठनी एकादशी', mr: 'कार्तिकी एकादशी' }, stations: ['hi', 'mr'], kind: 'festival', confidence: 'disputed',
    sources: ['DRIK', 'HT'], note: 'DRIK: Fri 20 Nov (Smarta), Sat 21 Nov (Vaishnava/Gauna). Pandharpur follows the temple\'s own announcement.',
    customs: ['Kartiki wari to Pandharpur', 'the wedding season opens after this day'],
  },
  {
    id: 'tulsi-vivah', date: '2026-11-21', name: 'Tulsi Vivah',
    names: { hi: 'तुलसी विवाह', mr: 'तुळशी विवाह', gu: 'તુલસી વિવાહ' }, stations: ['hi', 'mr', 'gu'], kind: 'festival',
    confidence: 'single', sources: ['DRIK'], customs: ['a full mock wedding for the tulsi plant, with sugarcane and wedding songs'],
  },
  {
    id: 'guru-nanak-jayanti', date: '2026-11-24', name: 'Guru Nanak Jayanti (Gurpurab)',
    names: { hi: 'गुरु नानक जयंती', mr: 'गुरु नानक जयंती', ta: 'குரு நானக் ஜெயந்தி', bn: 'গুরু নানক জয়ন্তী', gu: 'ગુરુ નાનક જયંતી' },
    stations: 'all', states: ['Punjab', 'Delhi', 'Haryana'], kind: 'festival', holiday: 'gazetted', confidence: 'confirmed',
    sources: ['DRIK', 'GCAL', 'CGEWCC'], customs: ['prabhat pheri processions before dawn', 'langar open to everyone'],
  },
  {
    id: 'dev-deepawali', date: '2026-11-24', name: 'Kartik Purnima: Dev Deepawali / Dev Diwali / Karthigai Deepam',
    names: { hi: 'देव दीपावली', gu: 'દેવ દિવાળી', ta: 'கார்த்திகை தீபம்' }, stations: ['hi', 'gu', 'ta'],
    states: ['Uttar Pradesh', 'Gujarat', 'Tamil Nadu'], kind: 'festival', confidence: 'confirmed', sources: ['DRIK', 'DRIK-TA', 'HT', 'CALC'],
    note: 'CALC: full moon 24 Nov. An older DRIK version put Karthigai Deepam on 23 Nov.',
    customs: ['Uttar Pradesh: Varanasi ghats lit with lakhs of diyas', 'Tamil Nadu: rows of agal clay lamps outside homes', 'Tamil Nadu: the Maha Deepam lit on the hill at Tiruvannamalai'],
  },
  {
    id: 'constitution-day', date: '2026-11-26', name: 'Constitution Day',
    names: { hi: 'संविधान दिवस' }, stations: ['hi'], kind: 'national', confidence: 'confirmed', sources: ['FIXED'],
  },
  // ---------------------------------------------------------------- December 2026
  {
    id: 'bharathiyar', date: '2026-12-11', name: 'Mahakavi Bharathiyar birth anniversary',
    names: { ta: 'பாரதியார் பிறந்தநாள்' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'observance', confidence: 'confirmed',
    sources: ['FIXED'], note: 'Subramania Bharati born 11 Dec 1882.',
  },
  {
    id: 'champa-shashthi', date: '2026-12-15', name: 'Champa Shashthi / Subrahmanya Sashti',
    names: { mr: 'चंपाषष्ठी', ta: 'சுப்ரமண்ய சஷ்டி' }, stations: ['mr', 'ta'], kind: 'regional', confidence: 'single',
    sources: ['DRIK-TA'], note: 'Same Margashirsha Shukla Shashthi tithi; Champa Shashthi derived from the DRIK-TA date.',
    customs: ['Maharashtra: Khandoba at Jejuri, bhandara (turmeric) thrown in the air'],
  },
  {
    id: 'margazhi', date: '2026-12-16', name: 'Margazhi month begins',
    names: { ta: 'மார்கழி' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'regional', confidence: 'single', sources: ['DRIK'],
    note: 'DRIK Dhanu Sankranti 16 Dec. Chennai\'s December music season runs through this month.',
    customs: ['big kolams drawn at dawn', 'Thiruppavai sung in the early morning', 'Chennai sabha concerts and canteens'],
  },
  {
    id: 'vaikunta-ekadasi', date: '2026-12-20', name: 'Vaikunta Ekadasi / Gita Jayanti (Mokshada Ekadashi)',
    names: { ta: 'வைகுண்ட ஏகாதசி', hi: 'गीता जयंती' }, stations: ['ta', 'hi'], kind: 'festival', confidence: 'single',
    sources: ['DRIK', 'DRIK-TA'], customs: ['Tamil Nadu: Sorga Vaasal (gate of heaven) opened at dawn at Srirangam', 'people stay awake all night'],
  },
  {
    id: 'datta-jayanti', date: '2026-12-23', name: 'Datta Jayanti',
    names: { mr: 'दत्त जयंती' }, stations: ['mr'], states: ['Maharashtra'], kind: 'regional', confidence: 'single', sources: ['DRIK'],
  },
  {
    id: 'arudra-darshan', date: '2026-12-24', name: 'Arudra Darshan',
    names: { ta: 'ஆருத்ரா தரிசனம்' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'regional', confidence: 'single',
    sources: ['DRIK-TA'], customs: ['Chidambaram Nataraja festival', 'kali (a sweet) with seven-vegetable kootu'],
  },
  {
    id: 'christmas', date: '2026-12-25', name: 'Christmas',
    names: { hi: 'क्रिसमस', mr: 'नाताळ', ta: 'கிறிஸ்துமஸ்', bn: 'বড়দিন', gu: 'નાતાલ' }, stations: 'all', kind: 'national',
    holiday: 'national', confidence: 'confirmed', sources: ['FIXED', 'GCAL'],
    customs: ['West Bengal: Park Street lights and plum cake in Kolkata', 'Maharashtra: Bandra lanes and midnight mass in Mumbai', 'Goa, Kerala and the North-East light up'],
  },
  {
    id: 'new-years-eve', date: '2026-12-31', name: "New Year's Eve",
    names: { hi: 'साल की आख़िरी रात', mr: 'वर्षाची शेवटची रात्र', ta: 'புத்தாண்டு முன்னிரவு', bn: 'বর্ষশেষের রাত', gu: 'વર્ષની છેલ્લી રાત' },
    stations: 'all', kind: 'observance', confidence: 'confirmed', sources: ['FIXED'],
  },
  // ---------------------------------------------------------------- January to March 2027
  {
    id: 'new-year', date: '2027-01-01', name: 'New Year',
    names: { hi: 'नया साल', mr: 'नवीन वर्ष', ta: 'ஆங்கிலப் புத்தாண்டு', bn: 'ইংরেজি নববর্ষ', gu: 'નવું વર્ષ' }, stations: 'all',
    kind: 'observance', confidence: 'confirmed', sources: ['FIXED'],
  },
  {
    id: 'youth-day', date: '2027-01-12', name: 'National Youth Day (Swami Vivekananda Jayanti)',
    names: { hi: 'राष्ट्रीय युवा दिवस', bn: 'জাতীয় যুব দিবস' }, stations: ['hi', 'bn'], states: ['West Bengal'], kind: 'national',
    confidence: 'confirmed', sources: ['FIXED'], note: 'Vivekananda born 12 Jan 1863 (Kolkata).',
  },
  {
    id: 'lohri', date: '2027-01-13', name: 'Lohri',
    names: { hi: 'लोहड़ी' }, stations: ['hi'], states: ['Punjab', 'Haryana', 'Delhi'], kind: 'festival', confidence: 'confirmed',
    sources: ['DRIK', 'MISC'], note: 'DRIK (Lancaster calendar) and events.wayne.edu: 13 Jan 2027.',
    customs: ['bonfire with rewri, gajak, peanuts and popcorn', 'songs about Dulla Bhatti'],
  },
  {
    id: 'bhogi', date: '2027-01-14', name: 'Bhogi',
    names: { ta: 'போகி' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'regional', confidence: 'single', sources: ['DRIK-27'],
    note: 'Derived: the day before Thai Pongal.', customs: ['old things burnt in a morning bonfire', 'houses cleaned for Pongal'],
  },
  {
    id: 'uttarayan', date: '2027-01-14', end: '2027-01-15', name: 'Uttarayan (kite festival) and Vasi Uttarayan',
    names: { gu: 'ઉત્તરાયણ', hi: 'उत्तरायण' }, stations: ['gu', 'hi'], states: ['Gujarat'], kind: 'regional', confidence: 'disputed',
    sources: ['GCAL', 'DRIK-27'],
    note: 'Gujarat flies kites on 14 Jan by custom (GCAL Makar Sankranti 14 Jan). DRIK-27: the Sankranti moment is 21:14 IST on 14 Jan, so the panchang festival day is 15 Jan.',
    customs: ['terraces full of kites from dawn; "kai po che!"', 'undhiyu and jalebi', 'chikki and til-laddoo'],
  },
  {
    id: 'makar-sankranti', date: '2027-01-15', name: 'Makar Sankranti',
    names: { hi: 'मकर संक्रांति', mr: 'मकर संक्रांत', bn: 'পৌষ সংক্রান্তি', gu: 'મકરસંક્રાંતિ' }, stations: ['hi', 'mr', 'bn', 'gu'],
    kind: 'festival', confidence: 'disputed', sources: ['DRIK-27', 'OH', 'GCAL'],
    note: 'DRIK-27 and OH: Fri 15 Jan 2027 (the moment is after sunset on the 14th). GCAL and calendarlabs.com: 14 Jan. On air say "14-15 जनवरी".',
    customs: ['Maharashtra: til-gul with "तिळगूळ घ्या, गोड गोड बोला"', 'West Bengal: pithe-puli (rice cakes) for Poush Sankranti', 'kites in many cities'],
  },
  {
    id: 'pongal', date: '2027-01-15', name: 'Thai Pongal',
    names: { ta: 'தைப் பொங்கல்' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'regional', holiday: 'state',
    confidence: 'confirmed', sources: ['DRIK-27', 'GCAL', 'OH'],
    customs: ['pongal boiled in a new pot until it overflows: "பொங்கலோ பொங்கல்!"', 'sugarcane and turmeric plants', 'kolam outside every house'],
  },
  {
    id: 'guru-gobind-singh-jayanti', date: '2027-01-15', name: 'Guru Gobind Singh Jayanti',
    names: { hi: 'गुरु गोबिंद सिंह जयंती' }, stations: ['hi'], states: ['Punjab'], kind: 'festival', confidence: 'single', sources: ['GCAL'],
  },
  {
    id: 'mattu-pongal', date: '2027-01-16', name: 'Mattu Pongal / Thiruvalluvar Day',
    names: { ta: 'மாட்டுப் பொங்கல்' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'regional', confidence: 'single',
    sources: ['DRIK-27'], note: 'Derived: the day after Thai Pongal.', customs: ['cattle bathed, horns painted, bells tied', 'jallikattu in Madurai district villages'],
  },
  {
    id: 'kaanum-pongal', date: '2027-01-17', name: 'Kaanum Pongal',
    names: { ta: 'காணும் பொங்கல்' }, stations: ['ta'], states: ['Tamil Nadu'], kind: 'regional', confidence: 'single',
    sources: ['DRIK-27'], note: 'Derived: the fourth day.', customs: ['families picnic and visit relatives; Marina Beach is packed'],
  },
  {
    id: 'netaji-jayanti', date: '2027-01-23', name: 'Netaji Subhas Chandra Bose Jayanti (Parakram Diwas)',
    names: { hi: 'पराक्रम दिवस', bn: 'নেতাজি জয়ন্তী' }, stations: ['hi', 'bn'], states: ['West Bengal'], kind: 'national',
    confidence: 'confirmed', sources: ['FIXED'], note: 'Born 23 Jan 1897.',
  },
  {
    id: 'republic-day', date: '2027-01-26', name: 'Republic Day',
    names: { hi: 'गणतंत्र दिवस', mr: 'प्रजासत्ताक दिन', ta: 'குடியரசு தினம்', bn: 'প্রজাতন্ত্র দিবস', gu: 'પ્રજાસત્તાક દિવસ' },
    stations: 'all', kind: 'national', holiday: 'national', confidence: 'confirmed', sources: ['FIXED', 'GCAL'],
    customs: ['parade on Kartavya Path, Delhi', 'flag hoisting in schools and housing societies'],
  },
  {
    id: 'vasant-panchami', date: '2027-02-11', name: 'Vasant Panchami / Saraswati Puja',
    names: { hi: 'वसंत पंचमी', bn: 'সরস্বতী পূজা' }, stations: ['hi', 'bn'], kind: 'festival', confidence: 'single', sources: ['GCAL'],
    customs: ['yellow clothes and kesari sweets', 'West Bengal: students place books before Saraswati; hate khori for small children'],
  },
  {
    id: 'shivaji-jayanti', date: '2027-02-19', name: 'Shivaji Jayanti',
    names: { mr: 'शिवजयंती' }, stations: ['mr'], states: ['Maharashtra'], kind: 'regional', holiday: 'state', confidence: 'confirmed',
    sources: ['FIXED', 'GCAL'], note: 'Maharashtra government date 19 Feb.',
  },
  {
    id: 'bhasha-dibas', date: '2027-02-21', name: 'International Mother Language Day (Bhasha Dibas)',
    names: { bn: 'আন্তর্জাতিক মাতৃভাষা দিবস' }, stations: ['bn'], kind: 'observance', confidence: 'confirmed', sources: ['FIXED'],
    note: 'UNESCO day; marks the 1952 Bengali language movement.',
  },
  {
    id: 'marathi-bhasha-din', date: '2027-02-27', name: 'Marathi Bhasha Gaurav Din',
    names: { mr: 'मराठी भाषा गौरव दिन' }, stations: ['mr'], states: ['Maharashtra'], kind: 'observance', confidence: 'confirmed',
    sources: ['FIXED'], note: 'Birth anniversary of poet Kusumagraj (V. V. Shirwadkar), 27 Feb.',
  },
  {
    id: 'maha-shivaratri', date: '2027-03-06', name: 'Maha Shivaratri',
    names: { hi: 'महाशिवरात्रि', mr: 'महाशिवरात्री', ta: 'மகா சிவராத்திரி', bn: 'শিবরাত্রি', gu: 'મહાશિવરાત્રી' }, stations: 'all',
    kind: 'festival', confidence: 'single', sources: ['GCAL'], customs: ['night-long vigil', 'thandai in the north'],
  },
  {
    id: 'eid-ul-fitr', date: '2027-03-10', name: 'Eid ul-Fitr (tentative)',
    names: { hi: 'ईद-उल-फ़ित्र', mr: 'रमजान ईद', ta: 'ரம்ஜான்', bn: 'ঈদ-উল-ফিতর', gu: 'ઈદ' }, stations: 'all', kind: 'festival',
    confidence: 'tentative', sources: ['GCAL'], note: 'Depends on moon sighting. Ramadan starts about 9 Feb 2027 (GCAL, tentative). Never announce in advance.',
    customs: ['sheer khurma and seviyan', 'Eidi for children'],
  },
  {
    id: 'holika-dahan', date: '2027-03-21', name: 'Holika Dahan',
    names: { hi: 'होलिका दहन', mr: 'होळी', gu: 'હોળી' }, stations: ['hi', 'mr', 'gu'], kind: 'festival', confidence: 'disputed',
    sources: ['MISC', 'GCAL'], note: 'travelindiasmart.com and vrindavanmathuratourism.com: Sun 21 Mar. GCAL lists Holika Dahana on 22 Mar.',
    customs: ['bonfire the night before colours', 'Maharashtra: puran poli'],
  },
  {
    id: 'holi', date: '2027-03-22', name: 'Holi (Dhulandi) / Dol Jatra',
    names: { hi: 'होली', mr: 'धुळवड', gu: 'ધુળેટી', bn: 'দোলযাত্রা', ta: 'ஹோலி' }, stations: 'all', kind: 'festival',
    holiday: 'gazetted', confidence: 'confirmed', sources: ['GCAL', 'MISC'],
    note: 'GCAL (Holi and Dolyatra 22 Mar); bhaktibharat.com Mon 22 Mar.', customs: ['colours and water balloons', 'gujiya and thandai', 'West Bengal: abir and Dol songs at Santiniketan'],
  },
  {
    id: 'good-friday', date: '2027-03-26', name: 'Good Friday',
    names: { hi: 'गुड फ्राइडे' }, stations: ['hi'], kind: 'national', holiday: 'gazetted', confidence: 'confirmed',
    sources: ['GCAL', 'CALC'], note: 'CALC: Easter Sunday is 28 Mar 2027.',
  },
];

// ---------------------------------------------------------------------------------------------- helpers

const DAY_MS = 86_400_000;
const dayNum = (ymd: string) => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);

export function forStation(f: Festival, station: StationLang): boolean {
  return f.stations === 'all' || f.stations.includes(station);
}

/** Festivals happening on a date (inclusive of multi-day ranges) for a station. */
export function festivalsOn(date: string, station: StationLang): Festival[] {
  const d = dayNum(date);
  return FESTIVALS.filter((f) => forStation(f, station) && d >= dayNum(f.date) && d <= dayNum(f.end ?? f.date));
}

/** Upcoming festivals for a station, nearest first. Local-state festivals sort ahead of others on the same day. */
export function upcoming(date: string, station: StationLang, state?: string, limit = 3, withinDays = 45): { festival: Festival; daysAway: number }[] {
  const d = dayNum(date);
  return FESTIVALS.filter((f) => forStation(f, station) && f.confidence !== 'tentative')
    .map((festival) => ({ festival, daysAway: dayNum(festival.date) - d }))
    .filter((x) => x.daysAway > 0 && x.daysAway <= withinDays)
    .sort((a, b) => a.daysAway - b.daysAway || Number(b.festival.states?.includes(state ?? '') ?? false) - Number(a.festival.states?.includes(state ?? '') ?? false))
    .slice(0, limit);
}

/** Only confirmed rows (or fixed dates) may be counted down to the day on air. */
export function canCountDown(f: Festival): boolean {
  return f.confidence === 'confirmed';
}

const NORTH = new Set(['Delhi', 'Uttar Pradesh', 'Punjab', 'Haryana', 'Rajasthan', 'Bihar', 'Madhya Pradesh', 'Uttarakhand', 'Himachal Pradesh', 'Jharkhand', 'Chandigarh']);
const HOME: Record<StationLang, string> = { hi: 'North India', mr: 'Maharashtra', ta: 'Tamil Nadu', bn: 'West Bengal', gu: 'Gujarat' };

/** A custom that fits the listener: their own region first, then a generic one. Never another region's custom. */
export function customFor(f: Festival, station: StationLang, state?: string, random = Math.random): string | undefined {
  const region = state ? (NORTH.has(state) ? 'North India' : state) : HOME[station];
  const parsed = (f.customs ?? []).map((c) => {
    const m = /^([A-Z][A-Za-z ]+): (.+)$/.exec(c);
    return m ? { region: m[1], text: m[2] } : { region: undefined, text: c };
  });
  const mine = parsed.filter((c) => c.region === region);
  const pool = mine.length ? mine : parsed.filter((c) => !c.region);
  return pool.length ? pool[Math.floor(random() * pool.length)].text : undefined;
}
