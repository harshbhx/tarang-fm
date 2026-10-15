/** Deterministic prefilter: language and script guards, grim, evergreen, live blogs, stock tips and clickbait. */
import type { NewsLang } from './types';

const NB = String.raw`(?<![\p{L}\p{M}])`; // no letter or mark before: an Indic-safe word start
const NA = String.raw`(?![\p{L}\p{M}])`; // no letter or mark after

/**
 * Violent crime, sexual violence, suicide and bodies. Short Indic stems carry a word-start guard, so
 * দেখুন, तलाश, जलाशय, केशव, चाहत्यांना, બદલાશે and रेपो रेट no longer match, while inflections (લાશના, लाशों)
 * still do. Tamil stays substring-based: its compounds (தற்கொலை, படுகொலை) are grim too.
 */
export const GRIM = new RegExp(
  [
    String.raw`\b(?:murder\w*|rapes?|raped|raping|gang-?rape\w*|suicide\w*|dead body|beheaded|lynch\w*|stab(?:bed|bing|s)?|sexual(?:ly)?|molest\w*)\b`,
    `${NB}(?:हत्या|हत्याकांड|आत्महत्या|मर्डर|बलात्कार|दुष्कर्म|गैंगरेप|रेप${NA}|कत्ल|लाश|शव${NA}|शवों|खून|चाकू|यौन|छेड़छाड़|विनयभंग|लैंगिक|भोसक|खुदकुशी|ख़ुदकुशी|नरसंहार|टोकाचं पाऊल|टोकाचे पाऊल)`,
    'मौत के घाट',
    `${NB}(?:খুন|হত্যা|গণহত্যা|ধর্ষণ|ধর্ষিত|গণধর্ষণ|যৌন|আত্মহত্যা|মৃতদেহ|ছুরি)`,
    `${NB}(?:હત્યા|ખૂન|બળાત્કાર|ગેંગરેપ|આત્મહત્યા|લાશ|મૃતદેહ|છરી|જાતીય)`,
    'கொலை|கத்திக்குத்து|பாலியல்|பிறப்புறுப்பு|சடலம்',
  ].join('|'),
  'iu',
);

export function isGrim(text: string): boolean {
  return GRIM.test(text);
}

export const FILTERS = {
  /** Horoscopes, astrology, quizzes, recipes, galleries: never news */
  evergreen:
    /rashifal|horoscope|राशिफल|राशीभविष्य|भविष्य\s*:|पंचांग|ராசி\s?பலன்|ராசிபலன்|பஞ்சாங்கம்|রাশিফল|পঞ্জিকা|રાશિફળ|અંકફળ|ભવિષ્યફળ|tarot|टॅरो|vastu|वास्तु|વાસ્તુ|numerology|अंक ज्योतिष|quiz|recipe|रेसिपी|ரெசிபி|রেসিপি|રેસીપી|web\s?stor|photos?\s*:|video\s*:|watch\s*:|in pics|गैलरी|फोटोगॅलरी/i,
  /** Teasers */
  clickbait:
    /जानें|जानिए|जानिये|देखें|देखिए|होश उड़|ये है वजह|यह है वजह|वायरल|viral|जाणून घ्या|पाहा|व्हायरल|பாருங்க|வைரல்|தெரியுமா|জানুন|দেখুন|ভাইরাল|জানেন|જાણો|જુઓ|વાયરલ|shocking|you won.t believe|सबसे बड़ा खुलासा|चौंक|हैरान|धमाका|बवाल|सनसनी|क्या आप जानते/i,
  /** Stock tips and pumps (index- and policy-level market news stays) */
  stockTip:
    /\btarget\b|stock to watch|stocks? to buy|\bbuy\b.*\bsell\b|multibagger|मल्टीबैगर|penny stock|पेनी स्टॉक|ipo gmp|\bgmp\b|upper circuit|अपर सर्किट|power stock|पावर स्टॉक|रॉकेट बना|% (की )?(तेजी|उछाल)|शेयर (में|पर) (तेजी|उछाल)|டார்கெட்|টার্গেট|ટાર્ગેટ|शेअर.*टार्गेट/i,
  /** Deaths, obituaries and accident tolls: soft (at most one per bulletin, never the lead or the kicker) */
  death:
    /निधन|श्रद्धांजलि|अंतिम संस्कार|मौत|मृत्यु|हादसा|हादसे|\bdeath\b|\bdied\b|\bdies\b|passes away|accident|मृत्यू|अपघात|காலமானார்|மரணம்|உயிரிழப்பு|விபத்து|প্রয়াত|মৃত্যু|দুর্ঘটনা|নিধন|અવસાન|નિધન|મોત|અકસ્માત/i,
  /** Live blogs and roundups that cannot be read as one story */
  liveBlog:
    /\blive\b|live updates|लाइव|लाईव्ह|நேரலை|লাইভ|લાઇવ|superfast|सुपरफास्ट|top \d+ news|टॉप \d+|बड़ी खबरें|ठळक बातम्या|முக்கியச் செய்திகள்|শিরোনাম|મુખ્ય સમાચાર|breaking news\s*:/i,
} as const;

export const TRUNCATED = /(\.\.\.|…)\s*$/;
export const QUESTION = /\?\s*['"‘’“”]?\s*$/;
/** Quote-led political headlines ("X बोले", "'…': नेता"): down-ranked, not dropped. */
const OPINION = /^\s*['"‘“][^'"’”]{6,}['"’”]\s*[:,-]|(?<![\p{L}\p{M}])(?:बोले|बोलीं|ने कहा|म्हणाले|म्हणाल्या|கூறினார்|বললেন|જણાવ્યું|કહ્યું)(?=[\s,:;.!?।]|$)/u;

/** "…, जानें क्यों" at the end of a real story: cut the teaser clause instead of dropping the story. */
const TEASER_TAIL = /\s*[,:|\-–—]\s*(?:जानें|जानिए|जानिये|देखें|जाणून घ्या|पाहा|জানুন|দেখুন|જાણો|જુઓ)[^,:|]*$/u;

export function softenClickbait(title: string): string {
  const cut = title.replace(TEASER_TAIL, '').trim();
  return cut !== title && cut.length >= 25 ? cut : title;
}

const SCRIPT_RANGES: Record<string, RegExp> = {
  deva: /[ऀ-ॿ]/g,
  beng: /[ঀ-৿]/g,
  gujr: /[઀-૿]/g,
  taml: /[஀-௿]/g,
  latn: /[A-Za-z]/g,
};
export const SCRIPT_OF_LANG: Record<NewsLang, string> = { hi: 'deva', mr: 'deva', bn: 'beng', gu: 'gujr', ta: 'taml', en: 'latn' };

/** Share of the text's letters (over the five scripts) that are in `script`. */
export function scriptShare(text: string, script: string): number {
  let total = 0;
  let hit = 0;
  for (const [k, re] of Object.entries(SCRIPT_RANGES)) {
    const n = text.match(re)?.length ?? 0;
    total += n;
    if (k === script) hit = n;
  }
  return total ? hit / total : 0;
}

// Hindi vs Marathi by function words. की/का/पर/ने also occur in Marathi, so they are not Hindi votes.
const END = String.raw`(?=\s|$|[,.:!?।'"‘’])`;
const HI_WORDS = new RegExp(`(?:^|\\s)(है|हैं|था|थे|थी|के|में|से|को|और|लिए|गया|गई|गए|किया|रहा|रही|रहे|नहीं|बोले|कहा|होगा|करेंगे|मिला|मिली)${END}`, 'g');
const MR_WORDS = new RegExp(`(?:^|\\s)(आहे|आहेत|आणि|मध्ये|नाही|केले|केली|झाले|झाली|यांनी|साठी|वर|च्या|ला|आता|पुन्हा|मोठा|मोठी|होणार|करणार|पण)${END}`, 'g');
const MR_SUFFIX = new RegExp(`[\\u0900-\\u097F]+(च्या|ाचा|ाची|ाचे|ांना|ातील|ामध्ये|णार|ल्या)${END}`, 'g');
const MR_LETTERS = /[ऱळ]/g;

export function hiOrMr(text: string): 'hi' | 'mr' | 'unknown' {
  const hi = text.match(HI_WORDS)?.length ?? 0;
  const mr =
    (text.match(MR_WORDS)?.length ?? 0) + (text.match(MR_SUFFIX)?.length ?? 0) * 0.7 + Math.min(2, text.match(MR_LETTERS)?.length ?? 0) * 1.5;
  if (hi === 0 && mr === 0) return 'unknown';
  return hi > mr ? 'hi' : mr > hi ? 'mr' : 'unknown';
}

export type DropReason = 'script' | 'otherLanguage' | 'assamese' | 'grim' | 'evergreen' | 'liveBlog' | 'stockTip' | 'clickbait' | 'truncated' | 'empty';

export interface Prefiltered {
  ok: boolean;
  reason?: DropReason;
  /** The title to keep (teaser tail cut) */
  title: string;
  /** The description to keep: emptied when it carries grim detail the title does not */
  descr: string;
  death: boolean;
  question: boolean;
  opinion: boolean;
}

/** The deterministic gate every item passes before tagging. `lang` is the language the item is written in. */
export function prefilter(title: string, descr: string, lang: NewsLang): Prefiltered {
  const t = softenClickbait(title.trim());
  // A grim description on a clean title: keep the story, never read its detail
  const d = isGrim(descr) ? '' : descr.trim();
  const base = { title: t, descr: d, death: FILTERS.death.test(t), question: QUESTION.test(t), opinion: OPINION.test(t) };
  const drop = (reason: DropReason): Prefiltered => ({ ...base, ok: false, reason });
  if (t.length < 12) return drop('empty');
  if (scriptShare(t, SCRIPT_OF_LANG[lang]) < 0.6) return drop('script');
  if (lang === 'hi' || lang === 'mr') {
    const guess = hiOrMr(`${t} ${descr.slice(0, 160)}`);
    if (guess !== 'unknown' && guess !== lang) return drop('otherLanguage');
  }
  if (lang === 'bn' && /[ৰৱ]/.test(t)) return drop('assamese');
  if (isGrim(t)) return drop('grim');
  if (FILTERS.evergreen.test(t)) return drop('evergreen');
  if (FILTERS.liveBlog.test(t)) return drop('liveBlog');
  if (FILTERS.stockTip.test(t)) return drop('stockTip');
  if (FILTERS.clickbait.test(t)) return drop('clickbait');
  if (TRUNCATED.test(t) && d.length <= 40) return drop('truncated');
  return { ...base, ok: true };
}
