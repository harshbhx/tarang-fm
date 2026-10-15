/**
 * Hand-written scripts that follow the show bible (§3 voice rules, §4 segment specs): the producer must pass
 * them. Their slate and serial are invented for calibration only and are given as the context, so every
 * real-world claim in them is supported.
 */
import type { CalibrationCase } from './types';
import type { ReviewLine, SlateItem } from '../types';
import { OPENER_BLOCKS_HI } from './baseline';

const HI_FRAME = ['तरंग FM 91.1', 'Tarang FM', '91.1', 'सनी', 'सिमरन', 'बड़ौदा', 'वडोदरा', 'Vadodara', 'Baroda', 'गुजरात', 'Gujarat'];
const TA_FRAME = ['தரங் FM 98.3', 'Tarang FM', '98.3', 'கோகுல்', 'விஜய்', 'வதோதரா', 'Vadodara', 'குஜராத்', 'Gujarat'];

const L = (role: string, delivery: string, text: string): ReviewLine => ({ role, delivery, text });

export const GOOD_OPENER_HI: ReviewLine[] = [
  L('rj', 'warm', 'नमस्ते बड़ौदा! सनी है आपके साथ, तरंग FM 91.1 पे, और हर्ष, ये शाम आपके नाम।'),
  L('rj', 'normal', 'रात के सवा आठ, आसमान एकदम साफ़, यानी garba के लिए मौसम ने भी हाँ कह दी है।'),
  L('rj', 'excited', 'नवरात्रि की शुभकामनाएँ! आज जितने चक्कर लगें, थकान कल की, मज़ा आज का।'),
  L('rj', 'normal', 'अब खबरें, सिमरन के साथ।'),
];

const SERIAL_LOG = '[kahani p1] Nisha found out her brother Kabir had sold their grandmother\'s blue tin trunk to the scrap dealer; with grandmother back at 7, they found the shed locked, and the part ended with someone inside counting silver coins from the trunk.';

export const GOOD_KAHANI_OUT_HI: ReviewLine[] = [
  L('rj', 'normal', 'बक्से में अख़बार नहीं, चाँदी के सिक्के? मैं तो अब अपनी अलमारी भी कान लगाकर खोलूँगा।'),
  L('rj', 'excited', 'मेरा सीधा हिसाब है: शादी में पहले खाना, फोटो बाद में, क्योंकि photographer भूखा नहीं रहता, हम रह जाते हैं।'),
  L('rj', 'warm', 'पिछले महीने मौसी की शादी में मैंने पहले फोटो खिंचवाई, और मेरे हिस्से में सिर्फ़ सलाद आया।'),
  L('rj', 'normal', 'बस एक छोटा सा break, और मैं यहीं हूँ।'),
];

export const GOOD_SLATE: SlateItem[] = [
  { id: 'n1', slot: 'city', source: 'दिव्य भास्कर', title: 'वडोदरा: विश्वामित्री नदी के पुल की मरम्मत, 20 अक्टूबर तक रात में एक तरफ़ का रास्ता बंद', detail: 'नगर निगम के मुताबिक मरम्मत का काम रात 10 बजे से सुबह 6 बजे तक होगा। इस दौरान वाहनों को दूसरे रास्ते से भेजा जाएगा।' },
  { id: 'n2', slot: 'state', source: 'संदेश', title: 'गुजरात में अगले दो दिन हल्की बारिश का अनुमान, मौसम विभाग ने yellow alert जारी किया', detail: 'मौसम विभाग के अनुसार सौराष्ट्र और दक्षिण गुजरात के कुछ ज़िलों में हल्की बारिश हो सकती है।' },
  { id: 'n3', slot: 'national', source: 'BBC हिंदी', title: 'ISRO ने श्रीहरिकोटा से नए मौसम उपग्रह का सफल प्रक्षेपण किया', detail: 'यह उपग्रह चक्रवात की चेतावनी को और सटीक बनाएगा।' },
  { id: 'n4', slot: 'world', source: 'BBC हिंदी', title: 'जापान में तेज़ रफ़्तार ट्रेन का एक नया रूट शुरू' },
  { id: 'n5', slot: 'sport', source: 'अमर उजाला', title: 'महिला क्रिकेट: भारत ने ऑस्ट्रेलिया को 6 विकेट से हराया', detail: 'भारत ने 48वें ओवर में लक्ष्य हासिल किया।' },
  { id: 'n6', slot: 'kicker', light: true, source: 'गुजरात समाचार', title: 'सूरत के एक स्कूल के बच्चों ने पुरानी साइकिलें ठीक करके गाँव के छात्रों को दान कीं' },
];

export const GOOD_NEWS_HI: ReviewLine[] = [
  L('news', 'warm', 'रात के सवा आठ की खबरें, तरंग FM 91.1 पर। मैं हूँ सिमरन।'),
  L('news', 'normal', 'मुख्य समाचार: वडोदरा में पुल की मरम्मत से रात का रास्ता बदला, गुजरात में बारिश का yellow alert, और ISRO का नया मौसम उपग्रह।'),
  L('news', 'normal', 'अब विस्तार से।'),
  L('news', 'normal', 'बड़ौदा से: विश्वामित्री नदी के पुल की मरम्मत के चलते 20 अक्टूबर तक रात में एक तरफ़ का रास्ता बंद रहेगा।'),
  L('news', 'normal', 'नगर निगम के मुताबिक काम रात 10 बजे से सुबह 6 बजे तक चलेगा। आपके लिए मतलब: उस समय दूसरा रास्ता लीजिए।'),
  L('news', 'normal', 'गुजरात से खबर: मौसम विभाग ने अगले दो दिन हल्की बारिश का yellow alert जारी किया है।'),
  L('news', 'normal', 'मौसम विभाग के अनुसार सौराष्ट्र और दक्षिण गुजरात के कुछ ज़िलों में हल्की बारिश हो सकती है।'),
  L('news', 'normal', 'देश में: ISRO ने श्रीहरिकोटा से नए मौसम उपग्रह का सफल प्रक्षेपण किया।'),
  L('news', 'normal', 'यह उपग्रह चक्रवात की चेतावनी को और सटीक बनाएगा।'),
  L('news', 'normal', 'दुनिया में: जापान में तेज़ रफ़्तार ट्रेन का एक नया रूट शुरू हुआ है।'),
  L('news', 'normal', 'खेल में: महिला क्रिकेट में भारत ने ऑस्ट्रेलिया को 6 विकेट से हराया, लक्ष्य 48वें ओवर में हासिल हुआ।'),
  L('news', 'warm', 'और आख़िर में, सूरत के एक स्कूल के बच्चों ने पुरानी साइकिलें ठीक करके गाँव के छात्रों को दान कीं।'),
  L('news', 'normal', 'ये थीं रात के सवा आठ की खबरें। सुनते रहिए तरंग FM 91.1।'),
];

export const GOOD_AD_HI: ReviewLine[] = [
  L('ad_announcer', 'normal', 'यात्रीगण कृपया ध्यान दें, रविवार से रुके हुए मामाजी अब तक घर का platform छोड़ने को तैयार नहीं हैं।'),
  L('ad_customer', 'fast', 'तीन दिन से कह रहे हैं, बस कल निकलता हूँ, और उनका कल रोज़ कल ही रहता है!'),
  L('ad_announcer', 'normal', 'पेश है विदाई Express: एक बटन दबाइए, और पूरे घर में गूँजेगा, आपकी गाड़ी छूटने वाली है।'),
  L('ad_announcer', 'fast', 'विदाई Express। पिछली बार घोषणा सुनकर मामाजी ने अपना reservation दो दिन और बढ़ा लिया।'),
];

export const GOOD_KAHANI_P1_HI: ReviewLine[] = [
  L('char_a', 'shout', 'कबीर, तूने दादी का नीला बक्सा कबाड़ीवाले को बेच दिया? दादी शाम 7 बजे लौट आएँगी!'),
  L('char_b', 'fast', 'निशा दीदी, वो खाली था! मैंने खोलकर देखा था, बस पुराने अख़बार थे।'),
  L('narrator', 'dramatic', 'शाम के साढ़े पाँच, मोहल्ले की गली में भुने चने की ख़ुशबू, और घर में एक ख़ाली कोना, जहाँ बरसों से नीला बक्सा रखा था।'),
  L('char_kid', 'excited', 'दीदी, मैंने कबाड़ीवाले को देखा था! वो हर बात पर बोलता है, तौल में कोई झोल नहीं!'),
  L('char_a', 'normal', 'चिंटू, शाबाश। कबीर, चप्पल पहन, हमारे पास डेढ़ घंटा है।'),
  L('narrator', 'normal', 'तीनों गली के मोड़ तक भागे, जहाँ कबाड़ का गोदाम था।'),
  L('narrator', 'dramatic', 'गोदाम पर ताला लटका था, और दरवाज़े पर चॉक से लिखा था, माल मंडी गया।'),
  L('char_b', 'sad', 'मंडी? अब तो वो बक्सा किसी के भी घर पहुँच जाएगा।'),
  L('char_a', 'hushed', 'कबीर, सुन, अंदर कोई गिनती गिन रहा है।'),
  L('char_kid', 'hushed', 'एक सौ बारह, एक सौ तेरह… और फिर वही आवाज़, तौल में कोई झोल नहीं।'),
  L('narrator', 'dramatic', 'दरवाज़े की दरार से निशा ने देखा, नीला बक्सा खुला पड़ा था, और उसमें से सिक्के निकाले जा रहे थे।'),
  L('char_a', 'hushed', 'कबीर, उस बक्से में अख़बार नहीं थे। उसमें दादी के चाँदी के सिक्के थे, और कोई उन्हें गिन रहा है।'),
];

export const SERIAL_OUTLINE = {
  title_native: 'नीला बक्सा',
  char_a_name_native: 'निशा',
  char_a_who_en: 'adult woman, 24, Kabir\'s elder sister',
  char_b_name_native: 'कबीर',
  char_b_who_en: 'adult man, 20, Nisha\'s younger brother',
  char_kid_name_native: 'चिंटू',
  char_kid_who_en: 'boy, 10, their cousin',
  offstage_en: 'दादी, their grandmother, at the temple until 7 pm (talked about, never speaks)',
  relations_en: 'Kabir calls Nisha \'दीदी\'; Chintu calls Nisha \'दीदी\' and Kabir \'भैया\'; all three call the grandmother \'दादी\'',
  central_question_en: 'Can they get grandmother\'s trunk back before she returns at 7?',
  clock_en: 'grandmother returns at 7 pm',
  clue_en: 'the scrap dealer\'s catchphrase "तौल में कोई झोल नहीं", planted in part 1',
  part1_goal_en: 'the trunk is sold; they chase it to the locked shed; someone inside is counting coins',
  part1_last_line_native: 'उसमें दादी के चाँदी के सिक्के थे, और कोई उन्हें गिन रहा है।',
};

export const GOOD_ONESHOT_HI: ReviewLine[] = [
  L('char_a', 'shout', 'रमेश, फ्रिज से पूरा केक गायब है! पिंकी की school sale सुबह 9 बजे है!'),
  L('char_b', 'normal', 'सुधा, मेरी तरफ़ मत देखो। मैंने तो बस एक चम्मच टेस्टिंग की थी, हमेशा की तरह।'),
  L('narrator', 'dramatic', 'रात के ग्यारह बजे, रसोई में सिर्फ़ फ्रिज की भिनभिनाहट थी, और ख़ाली प्लेट पर चॉकलेट की एक लंबी लकीर।'),
  L('char_kid', 'sad', 'मम्मी, मैंने उसके ऊपर चीनी के दानों से अपना नाम लिखा था। अब sale में क्या ले जाऊँगी?'),
  L('char_a', 'normal', 'पिंकी, रो मत। पहले चोर पकड़ेंगे, फिर केक बनेगा।'),
  L('char_b', 'fast', 'चोर तो पक्का पड़ोस की बिल्ली है, खिड़की खुली थी।'),
  L('narrator', 'normal', 'सुधा ने टॉर्च उठाई और खिड़की के नीचे देखा, वहाँ बिल्ली नहीं, रमेश की एक चप्पल पड़ी थी।'),
  L('char_b', 'normal', 'वो चप्पल? वो तो मैं शाम को… मैं वहाँ गया ही नहीं।'),
  L('char_kid', 'excited', 'मम्मी! पापा की मूँछ पर कुछ चमक रहा है, सफ़ेद-सफ़ेद, चीनी जैसा!'),
  L('char_a', 'normal', 'रमेश, ज़रा पास आओ। मुस्कुराओ।'),
  L('narrator', 'hushed', 'रमेश की मूँछ पर चीनी के दाने चिपके थे, और उनमें पिंकी के नाम के दो अक्षर अब भी पढ़े जा रहे थे।'),
  L('char_b', 'sad', 'ठीक है, ठीक है! एक चम्मच से शुरू हुआ था, पूरे केक पर ख़त्म हुआ।'),
  L('char_a', 'warm', 'तो सज़ा ये है: आज रात तुम नया केक बनाओगे, और पिंकी पहरा देगी कि एक भी चम्मच टेस्टिंग न हो।'),
  L('narrator', 'warm', 'रात के डेढ़ बजे तक रसोई से अंडे फेंटने की आवाज़ आती रही, और पिंकी कुर्सी पर बैठी पहरा देती रही।'),
  L('char_kid', 'excited', 'पापा, इस बार नाम मैं लिखूँगी, और चीनी गिनकर दूँगी!'),
];

export const GOOD_KAHANI_IN_HI: ReviewLine[] = [
  L('rj', 'hushed', 'एक नीला बक्सा, जो कबाड़ में बिक गया, और शाम 7 बजे से पहले उसे घर वापस आना है।'),
  L('rj', 'normal', 'कहानी कॉर्नर, पहली कड़ी, अब।'),
];

export const GOOD_OPENER_TA: ReviewLine[] = [
  L('rj', 'warm', 'வணக்கம் வதோதரா! நான் கோகுல், தரங் FM 98.3-ல, ஹார்ஷ், இந்த ராத்திரி உங்களுக்காக.'),
  L('rj', 'normal', 'ராத்திரி எட்டே கால், வானம் தெளிவா இருக்கு, கர்பா ஆட்டத்துக்கு இதைவிட நல்ல ராத்திரி கிடைக்காது.'),
  L('rj', 'excited', 'நவராத்திரி வாழ்த்துக்கள்! இன்னிக்கு ஆடுற ஒவ்வொரு சுத்தும் நாளைக்கு கால் வலியா ஞாபகம் வரும்.'),
  L('rj', 'normal', 'இப்போ செய்திகள், விஜய் கூட.'),
];

export const GOOD: CalibrationCase[] = [
  {
    id: 'good-hi-rj-opener',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'rj_link', mode: 'opener', station: 'hi', onAir: 'Tarang FM 91.1', lines: GOOD_OPENER_HI,
      context: { blocks: OPENER_BLOCKS_HI, next: { type: 'news', allowed: 'label only: the news is next, read by सिमरन.' }, showLog: [], frame: HI_FRAME, timePhrase: 'रात के सवा आठ', listenerName: 'हर्ष', catchphrase: { text: 'तरंग पे रहिए, तरंग में रहिए', allowed: false } },
    },
  },
  {
    id: 'good-hi-rj-kahani_out-hot_take',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'rj_link', mode: 'kahani_out', station: 'hi', onAir: 'Tarang FM 91.1', lines: GOOD_KAHANI_OUT_HI,
      context: {
        payloadType: 'hot_take',
        blocks: [{ label: 'PAYLOAD [hot_take]', text: 'Topic: "शादी में पहले खाना या पहले फोटो?". Take one side firmly and give one reason from your own life.' }],
        next: { type: 'ad_break', allowed: 'label only: a short break. Never say what is in it.' },
        showLog: [SERIAL_LOG], frame: HI_FRAME,
        catchphrase: { text: 'तरंग पे रहिए, तरंग में रहिए', allowed: false },
      },
    },
  },
  {
    id: 'good-hi-news-full',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'news', mode: 'full', station: 'hi', onAir: 'Tarang FM 91.1', lines: GOOD_NEWS_HI,
      context: { blocks: [{ label: 'TIME', text: 'रात के सवा आठ' }], slate: GOOD_SLATE, frame: HI_FRAME, timePhrase: 'रात के सवा आठ' },
    },
  },
  {
    id: 'good-hi-ad-railway',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'ad_break', station: 'hi', onAir: 'Tarang FM 91.1', lines: GOOD_AD_HI,
      context: { ad: { format: 'railway_announce', signature: 'the calm railway-announcement cadence: "passengers, kindly note"', tnc: 'optional' } },
    },
    plan: { title: 'विदाई Express', plan_punchline: 'घोषणा सुनकर मामाजी ने reservation दो दिन और बढ़ा लिया' },
  },
  {
    id: 'good-hi-kahani-p1',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'kahani', part: 1, station: 'hi', onAir: 'Tarang FM 91.1', lines: GOOD_KAHANI_P1_HI,
      context: {
        outline: SERIAL_OUTLINE,
        names: { char_a: 'निशा', char_b: 'कबीर', char_kid: 'चिंटू' },
        relations: SERIAL_OUTLINE.relations_en,
        expectedLastLine: SERIAL_OUTLINE.part1_last_line_native,
      },
    },
  },
  {
    id: 'good-hi-kahani-oneshot',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'kahani', oneShot: true, station: 'hi', onAir: 'Tarang FM 91.1', lines: GOOD_ONESHOT_HI,
      context: { names: { char_a: 'सुधा', char_b: 'रमेश', char_kid: 'पिंकी' }, relations: 'Sudha and Ramesh are married; Pinky calls Sudha \'मम्मी\' and Ramesh \'पापा\'' },
    },
  },
  {
    id: 'good-hi-rj-kahani_in',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'rj_link', mode: 'kahani_in', part: 1, station: 'hi', onAir: 'Tarang FM 91.1', lines: GOOD_KAHANI_IN_HI,
      context: {
        next: { type: 'kahani', allowed: 'KAHANI TEASE (true, spoiler-free): "एक नीला बक्सा, जो कबाड़ में बिक गया… और शाम 7 बजे से पहले उसे वापस आना है". Part word: पहली कड़ी. Corner name: कहानी कॉर्नर.' },
        showLog: ['[ad_break] A railway-announcement spoof for "विदाई Express", a button that announces the guest\'s train is leaving.'],
        frame: HI_FRAME,
      },
    },
  },
  {
    id: 'good-ta-rj-opener',
    set: 'good',
    expect: 'pass',
    input: {
      type: 'rj_link', mode: 'opener', station: 'ta', onAir: 'Tarang FM 98.3', lines: GOOD_OPENER_TA,
      context: {
        blocks: [
          { label: 'LISTENER', text: 'Harsh (ஹார்ஷ்), in வதோதரா (Vadodara), குஜராத்' },
          { label: 'TIME', text: 'ராத்திரி எட்டே கால், வியாழன் (20:15, Thursday)' },
          { label: 'WEATHER', text: 'notable=none · 27 டிகிரி, தெளிவான வானம் (27 °C, clear sky)' },
          { label: 'FESTIVAL', text: 'நவராத்திரி (Navratri: garba (கர்பா) nights in Gujarat); greeting "நவராத்திரி வாழ்த்துக்கள்"; customs and food only' },
        ],
        next: { type: 'news', allowed: 'label only: the news is next, read by விஜய்.' },
        showLog: [], frame: TA_FRAME, timePhrase: 'ராத்திரி எட்டே கால்', listenerName: 'ஹார்ஷ்',
      },
    },
  },
];

// ---- Subtly broken variants: one fault each, mostly one the free checks cannot see ------------------------------

const withLine = (lines: ReviewLine[], index: number, line: ReviewLine | null): ReviewLine[] => {
  const copy = [...lines];
  if (line) copy[index] = line;
  else copy.splice(index, 1);
  return copy;
};

export const BROKEN: CalibrationCase[] = [
  {
    id: 'broken-hi-rj-invented-toll',
    set: 'broken',
    expect: 'fail',
    known: 'L3 invents local news: a new toll on the Vishwamitri bridge from this evening (native script, no number: only the judge can see it)',
    mustInvent: ['toll', 'विश्वामित्री', 'vishwamitri', 'bridge', 'पुल'],
    lowDims: ['fidelity'],
    input: {
      ...GOOD[1].input,
      lines: withLine(GOOD_KAHANI_OUT_HI, 2, L('rj', 'warm', 'और हाँ, आज शाम से विश्वामित्री पुल पर नया toll शुरू हो गया है, निकलने से पहले छुट्टे रख लीजिए।')),
    },
  },
  {
    id: 'broken-hi-news-pm-quote',
    set: 'broken',
    expect: 'fail',
    known: 'L8 adds a reaction no item gives ("प्रधानमंत्री ने ऐतिहासिक बताया")',
    mustInvent: ['प्रधानमंत्री', 'prime minister', 'pm', 'historic', 'ऐतिहासिक'],
    lowDims: ['fidelity'],
    input: {
      ...GOOD[2].input,
      lines: withLine(GOOD_NEWS_HI, 7, L('news', 'normal', 'देश में: ISRO ने श्रीहरिकोटा से नए मौसम उपग्रह का सफल प्रक्षेपण किया, जिसे प्रधानमंत्री ने ऐतिहासिक बताया।')),
    },
  },
  {
    id: 'broken-hi-ad-no-joke',
    set: 'broken',
    expect: 'fail',
    known: 'the punchline is replaced by a plain call to action: no joke',
    lowDims: ['point_landed'],
    input: {
      ...GOOD[3].input,
      lines: withLine(GOOD_AD_HI, 3, L('ad_announcer', 'excited', 'विदाई Express। आज ही घर लाइए, और हर मेहमान को प्यार से विदा कीजिए।')),
    },
    plan: { title: 'विदाई Express' },
  },
  {
    id: 'broken-hi-rj-never-aired',
    set: 'broken',
    expect: 'fail',
    known: 'L1 reacts to a twist that never aired: SHOW LOG says part 1 ended on someone counting coins, not on grandmother selling the trunk herself (no name, number or place: only the judge can see it)',
    mustInvent: ['दादी', 'grandmother', 'twist', 'sold', 'बेचा'],
    lowDims: ['fidelity'],
    input: {
      ...GOOD[1].input,
      lines: withLine(GOOD_KAHANI_OUT_HI, 0, L('rj', 'excited', 'तो बक्सा दादी ने ख़ुद बेचा था! ये twist तो मैंने सपने में भी नहीं सोचा था।')),
    },
  },
  {
    id: 'broken-hi-kahani-p1-self-address',
    set: 'broken',
    expect: 'fail',
    known: 'L2: Kabir (char_b) calls himself "कबीर भैया", so the listener loses who is speaking; names and kinship words are all in the outline, so the free checks pass it',
    lowDims: ['coherence'],
    input: {
      ...GOOD[4].input,
      lines: withLine(GOOD_KAHANI_P1_HI, 1, L('char_b', 'fast', 'कबीर भैया, वो खाली था! निशा दीदी, मैंने खोलकर देखा था, बस पुराने अख़बार थे।')),
    },
  },
  {
    id: 'broken-hi-kahani-unresolved',
    set: 'broken',
    expect: 'fail',
    known: 'the complete story stops before the payoff: the culprit is never revealed and nothing resolves (no question mark, so the free checks pass it)',
    lowDims: ['story_resolved'],
    input: {
      ...GOOD[5].input,
      lines: [...GOOD_ONESHOT_HI.slice(0, 8), L('narrator', 'dramatic', 'तभी दरवाज़े की घंटी बजी, और तीनों ने एक-दूसरे की तरफ़ देखा।'), L('char_a', 'hushed', 'इतनी रात को कौन आया होगा, रमेश, तुम दरवाज़ा खोलो।'), L('char_b', 'normal', 'ठीक है, मैं देखता हूँ, तुम दोनों यहीं रुको।'), L('narrator', 'dramatic', 'रमेश ने दरवाज़े की कुंडी खोली, और बाहर अँधेरे में कोई खड़ा था।')],
    },
  },
];
