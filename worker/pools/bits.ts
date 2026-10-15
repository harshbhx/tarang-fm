/**
 * Running bits as episode ladders (bible §2). A bit is a small serial from the RJ's own (fictional) life: code
 * sends the next episode only, a session never hears an episode twice, and a bit airs at most once every 3 links.
 * Episodes are notes in English (the RJ tells them in the station language, as something that happened this
 * week); numbers are digits, so the checks can tell a kept number from an invented one.
 */

export interface RunningBit {
  id: string;
  /** The bit's on-air name in the station script */
  title: string;
  /** Episode notes, in order */
  episodes: string[];
  /** Only while this festival is in the fact packet (a festival id fragment, e.g. 'navratri') */
  season?: string;
}

/** Keyed by the RJ's persona key (show.ts). */
export const BITS: Record<string, RunningBit[]> = {
  sunny: [
    {
      id: 'bijli',
      title: 'बिजली',
      episodes: [
        'His scooter बिजली took 7 kicks to start today, and he counted every kick out loud on the street.',
        'पप्पू भाई examined बिजली like a doctor and gave the diagnosis: it does not need a repair, it needs attention.',
        'He tried talking sweetly to बिजली before kicking it; वर्मा अंकल overheard from the balcony and now thinks Sunny has a girlfriend.',
        'बिजली started on the very first kick today, and he was so shocked he forgot where he was going.',
        'बिजली\'s horn now plays only half a note; पप्पू भाई says: half a horn, half the bill.',
        'मम्मी wants बिजली sold; he refuses, because the scooter is part of his struggle story.',
      ],
    },
    {
      id: 'verma',
      title: 'वर्मा अंकल का ज्ञान',
      episodes: [
        'वर्मा अंकल forecasts the weather with his left knee, and he is very proud of its record.',
        'वर्मा अंकल has discovered a shortcut to the market that turns out to be 4 km longer.',
        'वर्मा अंकल is on a no-sweets diet, except jalebi, because it is round and so it does not count.',
        'वर्मा अंकल reviews Sunny\'s show out loud from his balcony every evening, with marks out of 10.',
        'वर्मा अंकल started a society chat group only to announce that he is leaving it.',
      ],
    },
  ],
  ritu: [
    {
      id: 'tiffin',
      title: 'आज का काल्पनिक tiffin',
      episodes: [
        'Today\'s imaginary tiffin: rajma with a secret ingredient she refuses to reveal, even to herself.',
        'पीहू packed the tiffin herself today: 3 biscuits, 1 apple and a note saying "मम्मी, पानी पियो".',
        'अमित packed the tiffin today, very proudly; when she opened it at lunch, there was no food in it.',
        'शालिनी swapped tiffins with her today and regretted it by the second bite.',
      ],
    },
    {
      id: 'nap',
      title: '3 बजे वाली नींद',
      episodes: [
        'In a 3 pm video call her eyes were open but her brain was fully asleep, and she agreed to something she cannot remember.',
        'She once took a nap "for 2 minutes" in 2019; the family still talks about it.',
        'She made chai to stop the afternoon nap, and the chai is what put her to sleep.',
      ],
    },
  ],
  ratan: [
    {
      id: 'chai',
      title: 'बशीर चाचा की टपरी',
      episodes: [
        'At बशीर चाचा\'s stall tonight: a night security guard who reads one poem before every cup.',
        'At बशीर चाचा\'s stall tonight: a student cramming for a 9 am exam, who asked चाचा to quiz him.',
        'At बशीर चाचा\'s stall tonight: a man who orders chai every night and never drinks it, he only holds it.',
        'At बशीर चाचा\'s stall tonight: an auto driver who brings his own steel glass, because the stall\'s glasses are "too small for the night".',
      ],
    },
    {
      id: 'note',
      title: 'सरला की चिट्ठी',
      episodes: [
        'सरला\'s note on the fridge tonight: the milk is in the fridge, and so is his phone charger, do not ask how.',
        'सरला\'s note tonight: dinner is on the stove, eat it hot, and do not tell the listeners what it was.',
        'सरला\'s note tonight: one line only, "जल्दी सो जाना", underlined twice.',
        'सरला\'s note tonight: she has hidden the last 2 laddoos and left a map, but the map is wrong on purpose.',
      ],
    },
    {
      id: 'bus',
      title: 'गुरमीत के रूट',
      episodes: [
        'A memory from the bus years: a highway dhaba where the dal was so good that गुरमीत once stopped the bus twice.',
        'A memory from the bus years: a passenger who slept through 3 stops and woke up thanking everyone.',
        'गुरमीत called today to argue, again, that the old route was 20 minutes shorter.',
        'A memory from the bus years: a night of fog when the whole bus went quiet and गुरमीत drove at walking pace.',
      ],
    },
  ],
  ishita: [
    {
      id: 'pati',
      title: 'आजची पुणेरी पाटी',
      episodes: [
        'A (fictional) Puneri signboard she read today, outside a shop: "Ask for change only if you have earned it." She rates it 8 out of 10.',
        'A (fictional) Puneri signboard today, on a gate: "Ring the bell once. We heard you the first time." She rates it 9 out of 10.',
        'A (fictional) Puneri signboard today: "Parking here is free. Getting out is your problem." She rates it 7 out of 10.',
        'A (fictional) Puneri signboard today, at a library: "Silence. Even your thoughts." She rates it 10 out of 10.',
      ],
    },
    {
      id: 'misal',
      title: 'मिसळ मोहीम',
      episodes: [
        'Her misal ranking changed again: today\'s misal made her cry a little, so it goes straight to number 1.',
        'सई dragged her on a 4 am trek and the misal at the base was the only reason she reached the top.',
        'She tried a mild misal today and calls it a betrayal; it drops to the bottom of the list.',
        'The corner-shop uncle, who closes from 1 to 4, now claims his misal is the best; she has to taste it before 1.',
      ],
    },
    {
      id: 'aai',
      title: 'आईचा फोन',
      episodes: [
        'आई called at exactly the wrong moment again: right in the middle of her open-mic punchline.',
        'आई called to ask if she had eaten, then explained for 10 minutes why she had not.',
        'आई called to say she heard the show and has one note: speak slower, and wear a sweater.',
        'आई called to ask where the spare key is; Ishita lives in another city.',
      ],
    },
  ],
  gokul: [
    {
      id: 'coffee',
      title: 'டிகிரி காபி மிஷன்',
      episodes: [
        'His perfect filter-coffee ritual failed today: the decoction was perfect, the milk boiled over.',
        'Today the coffee was perfect, and he got a phone call; it was cold when he came back.',
        'பாட்டி tasted his filter coffee and said only one word: "பரவாயில்ல". He is still recovering.',
        'He measured the coffee powder with a spoon for the first time; it tasted worse.',
      ],
    },
    {
      id: 'cricket',
      title: 'பாலுவின் டீம்',
      episodes: [
        '"Bullet" பாலு\'s gully-cricket team lost again this week; the excuse: the sun was in everyone\'s eyes, at 6 pm.',
        'பாலு\'s team lost because the ball went into the neighbour\'s house, and nobody was brave enough to ask.',
        'பாலு\'s team almost won, until பாலு declared a new rule mid-match and the other team accepted it.',
        'பாலு\'s team lost by 2 runs, and பாலு has called it a moral victory.',
      ],
    },
    {
      id: 'paati',
      title: 'பாட்டி சொல்',
      episodes: [
        'பாட்டி\'s saying of the day: an empty stomach makes bad decisions; he tested it and she was right.',
        'பாட்டி says the fan is better than the AC because the fan never sends a bill; he has no reply.',
        'பாட்டி says idli is the most honest food; he spent the day trying to prove her wrong and failed.',
        'The upstairs neighbour practised the nadaswaram at 6 am again, and பாட்டி said it is better than any alarm.',
      ],
    },
  ],
  arnab: [
    {
      id: 'mama',
      title: 'মেজোমামার তর্ক',
      episodes: [
        'মেজোমামা argued for 40 minutes that tea tastes better in a clay cup, then lost to his own sister.',
        'মেজোমামা argued both sides of whether rain is romantic or a nuisance, and lost to himself.',
        'মেজোমামা insisted the detective in every story should be a quiz master; Arnab agreed, and that ended the fun.',
        'মেজোমামা argued that adda should be a public holiday, and for once nobody disagreed.',
      ],
    },
    {
      id: 'mishti',
      title: 'ডায়েট বনাম মিষ্টি',
      episodes: [
        'Diet versus mishti, this week\'s score: diet 2, mishti 5, and his mother is keeping the score.',
        'He started a diet on Monday; by Monday evening there was a box of sandesh on the table.',
        'His mother has a new rule: one rasgulla per good deed; he is suddenly very helpful.',
        'Diet versus mishti: diet finally won a day, and he says it was the longest day of his life.',
      ],
    },
    {
      id: 'adda',
      title: 'টুবলুর আড্ডা',
      episodes: [
        'টুবলু\'s adda topic this week: is a tram slow, or just calm?',
        'টুবলু\'s adda ran for 3 hours on whether a mystery story must give the reader a fair clue.',
        'টুবলু made an adda roster with fixed timings; nobody followed it, which was the point.',
        'টুবলু\'s adda topic this week: telebhaja in the rain versus telebhaja any day.',
      ],
    },
  ],
  pooja: [
    {
      id: 'farsan',
      title: 'ફરસાણ કે ફરસાણ?',
      episodes: [
        'Today\'s farsan dilemma: khaman or fafda; she settled it with a deal, half and half, and paid for both.',
        'પપ્પા bought 2 kg of farsan because the shop said 2 for the price of 1, for a family of 3.',
        'She tried a day with no farsan; it lasted until 11 am.',
        'The farsan shop gave her 100 grams extra for free, and she calculated the discount out loud at the counter.',
      ],
    },
    {
      id: 'ba',
      title: 'બા નો ભાવ-તાલ',
      episodes: [
        'જસુ બા bargained at the vegetable cart and came home with free coriander and a new friend.',
        'જસુ બા bargained with the auto driver, and the driver ended up paying her.',
        'જસુ બા tried to bargain at a fixed-price shop and got a 5 percent discount anyway.',
        'જસુ બા taught Pooja her one rule of bargaining: always walk away slowly.',
      ],
    },
    {
      id: 'garba',
      title: 'ગરબા vs હેત',
      season: 'navratri',
      episodes: [
        'Another garba round lost to her cousin હેત, who has never let her forget his trophy.',
        'She practised garba steps at home for 2 days; હેત still finished the round before she found her place.',
        'This year she says garba is about stamina, not steps; હેત says that is what people who lose say.',
      ],
    },
  ],
};
