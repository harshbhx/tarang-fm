/**
 * The "before" sample (preview build, 2026-10-15): 9 scripts the producer must fail. The lines are the aired
 * text; the context is what the v3 writer would have been given for the same slot.
 */
import type { CalibrationCase } from './types';

const HI_FRAME = ['तरंग FM 91.1', 'Tarang FM', '91.1', 'सनी', 'सिमरन', 'बड़ौदा', 'वडोदरा', 'Vadodara', 'Baroda', 'गुजरात', 'Gujarat'];
const TA_FRAME = ['தரங் FM 98.3', 'Tarang FM', '98.3', 'கோகுல்', 'விஜய்', 'வதோதரா', 'Vadodara', 'குஜராத்', 'Gujarat'];
export const OPENER_BLOCKS_HI = [
  { label: 'LISTENER', text: 'Harsh (हर्ष), in बड़ौदा (Vadodara), गुजरात' },
  { label: 'TIME', text: 'रात के सवा आठ, गुरुवार (20:15, Thursday 15 October 2026)' },
  { label: 'WEATHER', text: 'notable=none · 27 डिग्री, साफ़ आसमान (27 °C, clear sky)' },
  { label: 'FESTIVAL', text: 'नवरात्रि (Navratri: garba nights in Gujarat) · greeting: "नवरात्रि की शुभकामनाएँ" · customs and food only, no day numbers' },
];

export const BASELINE: CalibrationCase[] = [
  {
    id: 'before-hi-01-rj_link',
    set: 'baseline',
    expect: 'fail',
    known: 'invents the Alkapuri flyover news (L5) and the Sursagar breeze (L2); filler opener; no point',
    mustInvent: ['alkapuri', 'flyover'],
    input: {
      type: 'rj_link', mode: 'opener', station: 'hi', onAir: 'Tarang FM 91.1',
      lines: [
  {
    "role": "rj",
    "text": "अरे यार, शो तो बस शुरू हो रहा है और मैं अभी से एक्साइटेड हूँ।",
    "delivery": "normal"
  },
  {
    "role": "rj",
    "text": "रात के सवा आठ, 27 डिग्री, एकदम मस्त breeze है Sursagar की तरफ से।",
    "delivery": "warm"
  },
  {
    "role": "rj",
    "text": "नवरात्रि की शुभकामनाएँ हर्ष! Garba की energy तो आ गई है, बस scooter पे जाने में late हो रहे हैं।",
    "delivery": "excited"
  },
  {
    "role": "rj",
    "text": "क्योंकि शहर में evening traffic jams का scene अभी भी same है।",
    "delivery": "normal"
  },
  {
    "role": "rj",
    "text": "अभी देखिए, खबर में बात होगी Alkapuri के नए flyover opening की।",
    "delivery": "normal"
  }
],
      context: {
        blocks: OPENER_BLOCKS_HI,
        next: { type: 'news', allowed: 'label only: the news is next, read by सिमरन.' },
        showLog: [],
        frame: HI_FRAME, timePhrase: 'रात के सवा आठ', listenerName: 'हर्ष',
        catchphrase: { text: 'तरंग पे रहिए, तरंग में रहिए', allowed: false },
      },
    },
  },
  {
    id: 'before-hi-02-news',
    set: 'baseline',
    expect: 'fail',
    known: 'reads an invented Alkapuri flyover story (L6); vague lines with no information (L3, L5)',
    mustInvent: ['alkapuri', 'flyover'],
    lowDims: ['fidelity'],
    input: {
      type: 'news', mode: 'full', station: 'hi', onAir: 'Tarang FM 91.1',
      lines: [
  {
    "role": "news",
    "text": "रात के सवा आठ की खबरें, तरंग FM 91.1 पे। मैं हूँ सिमरन।",
    "delivery": "normal"
  },
  {
    "role": "news",
    "text": "दिल्ली में protest करने की नई जगहें बन गई हैं।",
    "delivery": "normal"
  },
  {
    "role": "news",
    "text": "जंतर-मंतर की जगह अब ये नए spots हैं, और locals ने अपनी राय दी है।",
    "delivery": "normal"
  },
  {
    "role": "news",
    "text": "अब बड़ौदा से।",
    "delivery": "normal"
  },
  {
    "role": "news",
    "text": "वडोदरा का decoration देखने लायक है।",
    "delivery": "normal"
  },
  {
    "role": "news",
    "text": "Alkapuri flyover की opening की खबर भी आ रही है।",
    "delivery": "normal"
  },
  {
    "role": "news",
    "text": "और आखिर में, एक अच्छी खबर।",
    "delivery": "warm"
  },
  {
    "role": "news",
    "text": "नवरात्रि में आस्था और संस्कृति का संगम देखने को मिल रहा है।",
    "delivery": "warm"
  },
  {
    "role": "news",
    "text": "ये थीं अभी तक की खबरें। आप सुन रहे हैं तरंग FM 91.1।",
    "delivery": "normal"
  }
],
      context: {
        blocks: [{ label: 'TIME', text: 'रात के सवा आठ' }],
        slate: [
  {
    "slot": "city",
    "title": "गुजरात के सजावट का एरियल व्यू:रंग-बिरंगी रोशनी से जगमगा उठा वडोदरा",
    "source": "दैनिक भास्कर"
  },
  {
    "slot": "city",
    "title": "नवरात्रि फेस्टिवल में आस्था और संस्कृति का अद्भुत संगम ...",
    "source": "दैनिक जागरण"
  },
  {
    "slot": "national",
    "title": "जंतर-मंतर नहीं अब ये हैं दिल्ली में प्रोटेस्ट करने की नई जगहें, स्थानीय लोग क्या बोले?",
    "source": "BBC"
  },
  {
    "slot": "national",
    "title": "ध्रुव राठी बोले, 'मोदी चुनाव आयोग में सुधार की बात कहें तो मैं उनका भी समर्थन करूंगा'",
    "source": "BBC"
  }
],
        frame: HI_FRAME, timePhrase: 'रात के सवा आठ',
      },
    },
  },
  {
    id: 'before-hi-03-ad_break',
    set: 'baseline',
    expect: 'fail',
    known: 'reads "delivery: hushed" aloud (L3); a real palace in a fictional ad; no punchline',
    lowDims: ['point_landed'],
    input: {
      type: 'ad_break', station: 'hi', onAir: 'Tarang FM 91.1',
      lines: [
  {
    "role": "ad_customer",
    "text": "अरे neighbour, तुमने देखी मेरी friend नै? आज Laxmi Vilas Palace के बाहर उसके pumps से fresh कचौरी निकली! सच में।",
    "delivery": "normal"
  },
  {
    "role": "ad_announcer",
    "text": "अरे! क्या secret है उसका? कैसे? जल्दी बताओ मुझे।",
    "delivery": "normal"
  },
  {
    "role": "ad_customer",
    "text": "उनके shoes हैं PannaPani. delivery: hushed।",
    "delivery": "hushed"
  },
  {
    "role": "ad_announcer",
    "text": "अरे बाप रे! इस बात का तो market में पूरा gossip फैल गया है। मुझे भी अभी के अभी मंगाओ।",
    "delivery": "excited"
  },
  {
    "role": "ad_announcer",
    "text": "PannaPani, smart footwear. T&C apply: ठंड में shoes बर्फ बन सकते हैं।",
    "delivery": "fast"
  }
],
      context: { ad: { format: 'gossip', signature: 'two neighbours gossiping about a secret product' } },
    },
    plan: { title: 'PannaPani' },
  },
  {
    id: 'before-hi-04-kahani',
    set: 'baseline',
    expect: 'fail',
    known: 'ends on a question with no payoff; kinship and gender confusion (an adult says "पापा", "Sushila" is a boy and a 70-year-old aunt)',
    lowDims: ['story_resolved'],
    input: {
      type: 'kahani', oneShot: true, station: 'hi', onAir: 'Tarang FM 91.1',
      lines: [
  {
    "role": "char_b",
    "text": "अरे पापा, वो लाल थैला नीचे रख दो, नहीं तो बाहर निकल जाऊँगा!",
    "delivery": "excited"
  },
  {
    "role": "narrator",
    "text": "रात के 11:30, नई दिल्ली के राजीव चौक पर। और इस last train में जो drama शुरू हुआ, उसका नाम था निशानवाला बल्ला।",
    "delivery": "dramatic"
  },
  {
    "role": "char_a",
    "text": "अरे भैया, मेरा सामान चोरी हो रहा है, मुझे वो signed bat अभी चाहिए।",
    "delivery": "hushed"
  },
  {
    "role": "char_b",
    "text": "अरे यार, मैंने कहा ना, मैंने एक risky deal की है।",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "रिस्की? हमने 50 हज़ार दिए थे इस bat के लिए।",
    "delivery": "shout"
  },
  {
    "role": "char_kid",
    "text": "पापा, वो आदमी भाग क्यों रहा है? मुझे डर लग रहा है।",
    "delivery": "sad"
  },
  {
    "role": "char_b",
    "text": "बिल्कुल सही, वो Sushila नाम का लड़का अपनी identity छुपा कर भागा था।",
    "delivery": "normal"
  },
  {
    "role": "char_a",
    "text": "सश... सशीलिला? अरे वो तो हमारी Burari वाली बुआ है, वो batting कैसे करेगी? वो तो 70 साल की है! सच में।",
    "delivery": "normal"
  },
  {
    "role": "narrator",
    "text": "तभी platform पर announcements शुरू हुईं, और ट्रेन के doors बंद होने लगे।",
    "delivery": "dramatic"
  },
  {
    "role": "char_b",
    "text": "अरे पापा, बुआ 70 साल की नहीं, थुषिला है। थ-थ-थरिल।",
    "delivery": "normal"
  },
  {
    "role": "char_a",
    "text": "थ-थ-थरिल? अरे भाई, क्या तुम ठीक से बोल रहे हो?",
    "delivery": "normal"
  },
  {
    "role": "char_b",
    "text": "हाँ! उसे S से बोलने में problem है, मतलब S की जगह Th बोलता है।",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "मतलब? अरे भैया, मैंने सुना वो 'सश-सश-सशीलिला' बोल रहा था।",
    "delivery": "normal"
  },
  {
    "role": "char_kid",
    "text": "पापा, वो थुषिला कौन है और वो बैलगाड़ी का बल्ला क्यों ले गई?",
    "delivery": "normal"
  }
],
      context: {},
    },
  },
  {
    id: 'before-hi-05-rj_link',
    set: 'baseline',
    expect: 'fail',
    known: 'copies the prompt example and reacts to a twist that never aired (L1); time and weather again (L2); Sursagar again (L3); the invented flyover teased before an ad (L4)',
    mustInvent: ['alkapuri', 'flyover', 'twist'],
    lowDims: ['fidelity'],
    input: {
      type: 'rj_link', mode: 'kahani_out', station: 'hi', onAir: 'Tarang FM 91.1',
      lines: [
  {
    "role": "rj",
    "text": "उफ़्फ़, वो आख़िरी twist अभी तक दिमाग में घूम रहा है। सच में।",
    "delivery": "normal"
  },
  {
    "role": "rj",
    "text": "रात के सवा आठ, 27 डिग्री, साफ़ आसमान। आप सुन रहे हैं तरंग FM 91.1 पे।",
    "delivery": "normal"
  },
  {
    "role": "rj",
    "text": "वैसे, Sursagar की evening breeze में थोड़ी walk करें, तो दिमाग भी ठंडा हो जाता है।",
    "delivery": "warm"
  },
  {
    "role": "rj",
    "text": "और Alkapuri flyover खुलने की खबर सुननी है, वो भी आज।",
    "delivery": "excited"
  },
  {
    "role": "rj",
    "text": "तरंग पे रहिए, तरंग में रहिए!",
    "delivery": "normal"
  }
],
      context: {
        payloadType: 'running_bit',
        blocks: [{ label: 'PAYLOAD [running_bit sunny_scooter ep 1/5]', text: 'This episode: "Sunny\'s old scooter refuses to start on the first kick; this week it needed seven." Previously aired: none.' }],
        next: { type: 'ad_break', allowed: 'label only: a short break. Never say what is in it.' },
        showLog: [
          '[rj_link] Sunny greeted Harsh in Baroda, gave the time and weather and wished a happy Navratri.',
          '[news] Simran read new protest spots in Delhi, Vadodara\'s Navratri lights and a Navratri faith-and-culture item.',
          '[ad_break] Two neighbours gossiped about PannaPani shoes that release kachori.',
          '[kahani] On a late Delhi metro train a man and a woman argued over a signed cricket bat and a mumbled name; it stopped on the kid asking who Thushila was. No twist or ending aired.',
        ],
        frame: HI_FRAME,
        catchphrase: { text: 'तरंग पे रहिए, तरंग में रहिए', allowed: true },
      },
    },
  },
  {
    id: 'before-hi-06-ad_break',
    set: 'baseline',
    expect: 'fail',
    known: 'no punchline: ends on the brand chanted three times; a full English sentence (L3); a monsoon umbrella in October',
    lowDims: ['point_landed'],
    input: {
      type: 'ad_break', station: 'hi', onAir: 'Tarang FM 91.1',
      lines: [
  {
    "role": "ad_announcer",
    "text": "बारिश हो या garba की रात, Papad-Chhata बचाए आपके snacks!",
    "delivery": "excited"
  },
  {
    "role": "ad_customer",
    "text": "पहले बारिश में हाथ चिपचिपे होते थे, अब मैं ढोल पर भी बेफिक्र dance कर रही हूँ।",
    "delivery": "normal"
  },
  {
    "role": "ad_announcer",
    "text": "इसका canopy खुले, तो गर्मागर्म papad की plate निकलती है, जो rain में भी crunchy रहे! T&C apply, please don't eat the plastic.",
    "delivery": "excited"
  },
  {
    "role": "ad_customer",
    "text": "Papad-Chhata, बारिश में भी non-sticky और garba में non-stop! बिल्कुल सही।",
    "delivery": "normal"
  },
  {
    "role": "ad_announcer",
    "text": "तो आज ही लीजिए Papad-Chhata, Papad-Chhata! Papad-Chhata!",
    "delivery": "excited"
  }
],
      context: { ad: { format: 'jingle', signature: 'a sung jingle' } },
    },
    plan: { title: 'Papad-Chhata' },
  },
  {
    id: 'before-hi-07-kahani',
    set: 'baseline',
    expect: 'fail',
    known: 'nobody is named until narration at L9; "चाचा" before any man speaks; ends on "अचानक? क्यों?" with no payoff',
    lowDims: ['story_resolved'],
    input: {
      type: 'kahani', oneShot: true, station: 'hi', onAir: 'Tarang FM 91.1',
      lines: [
  {
    "role": "char_a",
    "text": "अरे, ये बहुत भारी है।",
    "delivery": "normal"
  },
  {
    "role": "char_b",
    "text": "अरे मुझे मत धक्का दो।",
    "delivery": "normal"
  },
  {
    "role": "narrator",
    "text": "यह कहानी है पोटली के सोने की। रात के 12 बजे। इंदौर का मशहूर सराफा बाज़ार।",
    "delivery": "dramatic"
  },
  {
    "role": "char_a",
    "text": "सच बताऊँ तो मुझे ये ब्रेसलेट अभी चाहिए।",
    "delivery": "hushed"
  },
  {
    "role": "char_b",
    "text": "मैंने कहा है न, वो मेरी माँ की निशानी है।",
    "delivery": "normal"
  },
  {
    "role": "char_a",
    "text": "अरे कोई नहीं देख रहा है। बस दे दे।",
    "delivery": "fast"
  },
  {
    "role": "char_b",
    "text": "नहीं, मैं नहीं दूँगी।",
    "delivery": "normal"
  },
  {
    "role": "char_kid",
    "text": "चाचा, ये नीचे क्या पड़ा है?",
    "delivery": "normal"
  },
  {
    "role": "narrator",
    "text": "इमरान को एक मुड़ा हुआ कागज़ मिला।",
    "delivery": "warm"
  },
  {
    "role": "char_a",
    "text": "इसे अभी यहाँ छोड़ दो।",
    "delivery": "fast"
  },
  {
    "role": "char_b",
    "text": "ये क्या है?",
    "delivery": "normal"
  },
  {
    "role": "char_b",
    "text": "ये सराफा के दुकान का बिल है।",
    "delivery": "normal"
  },
  {
    "role": "char_a",
    "text": "अरे, वो तो... मैंने नहीं किया।",
    "delivery": "dramatic"
  },
  {
    "role": "char_b",
    "text": "अचानक? क्यों?",
    "delivery": "normal"
  }
],
      context: {},
    },
  },
  {
    id: 'before-ta-01-rj_link',
    set: 'baseline',
    expect: 'fail',
    known: 'invents a Laxmi Vilas Palace traffic story in the news (L3); "Suryasagar" colour not in context',
    mustInvent: ['laxmi', 'lakshmi', 'லக்ஷ்மி', 'palace', 'பேலஸ்', 'traffic'],
    lowDims: ['fidelity'],
    input: {
      type: 'rj_link', mode: 'opener', station: 'ta', onAir: 'Tarang FM 98.3',
      lines: [
  {
    "role": "rj",
    "text": "வணக்கம் ஹார்ஷ், இன்னைக்கு மாலை 8:15 மணி, தரங் FM 98.3-ல கோகுல் பேசறேன். நவராத்திரி கொண்டாட்டங்கள்ல நீங்க ரொம்ப பிஸி-ஆ இருப்பீங்க.",
    "delivery": "warm"
  },
  {
    "role": "rj",
    "text": "27 degrees, ஆனா வெளிய நல்லா breeze. அந்த சூர்யாசகர் ஏரியால நடக்குற garba vibe-அ விட சூப்பரா என்ன இருக்க முடியும்?",
    "delivery": "normal"
  },
  {
    "role": "rj",
    "text": "இப்போ லக்ஷ்மி விலாஸ் பேலஸ் பக்கத்துல traffic எப்படி இருக்குன்னு news-ல பாக்கலாம்.",
    "delivery": "normal"
  }
],
      context: {
        blocks: [
          { label: 'LISTENER', text: 'Harsh (ஹர்ஷ்), in வதோதரா (Vadodara), குஜராத்' },
          { label: 'TIME', text: 'ராத்திரி எட்டே கால், வியாழன் (20:15, Thursday)' },
          { label: 'WEATHER', text: 'notable=none · 27 டிகிரி, தெளிவான வானம் (27 °C, clear sky)' },
          { label: 'FESTIVAL', text: 'நவராத்திரி (Navratri: garba nights in Gujarat); customs and food only' },
        ],
        next: { type: 'news', allowed: 'label only: the news is next, read by விஜய்.' },
        showLog: [],
        frame: TA_FRAME, timePhrase: 'ராத்திரி எட்டே கால்', listenerName: 'ஹார்ஷ்',
      },
    },
  },
  {
    id: 'before-ta-02-kahani',
    set: 'baseline',
    expect: 'fail',
    known: 'char_a is the father, then the son; speaks 6 lines in a row; the ending contradicts itself; no payoff',
    lowDims: ['story_resolved'],
    input: {
      type: 'kahani', oneShot: true, station: 'ta', onAir: 'Tarang FM 98.3',
      lines: [
  {
    "role": "narrator",
    "text": "சூர்யன் கடைசியா உதிச்சப்போ, ஒரு ஆட்டோ டிரைவர் ஆச்சரியத்தோட ஒரு தாத்தாவுக்கு முன்னாடி நின்னார்!",
    "delivery": "dramatic"
  },
  {
    "role": "narrator",
    "text": "இதுக்கு முன்னாடி… Rameswaram மீன்பிடி படகுக்கு போற வழியில ஒரு முரண்பாடு.",
    "delivery": "dramatic"
  },
  {
    "role": "char_a",
    "text": "ஏய், நீங்க ஆட்டோ பேசிக்கிட்டே இருந்தா எப்படி? ஒரு சில நிமிடத்துல படகு கிளம்பணும், நீங்க தான் கூட்டிட்டு போகணும்.",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "என் பையனுக்கு ஸ்கூல் இருக்கு, போங்க.",
    "delivery": "fast"
  },
  {
    "role": "char_b",
    "text": "ஐயையோ, நீங்க அப்படி சொல்லவே வேணாம். ஆத்துல இருந்து கிளம்புறதுக்கு முன்னாடியே பாஸ்ஸும் பேக்காவும் பீதியா இருக்கு.",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "அப்புறம் என்ன? கடல்ல போறது ஒரு சாகசம். சும்மா இருங்க, நான் பாத்துக்குறேன்.",
    "delivery": "normal"
  },
  {
    "role": "char_a",
    "text": "இப்போதான், அந்த பெரிய பையன் எப்படி இங்க வந்தான்? அவன் முன்னாடி வந்ததே எனக்கு தெரியல.",
    "delivery": "normal"
  },
  {
    "role": "char_b",
    "text": "ஆமா, அவன் பேரு கௌதம். அவனோட அப்பா தான் இந்த ரூட்டுக்கு புக் பண்ணிருக்காரு.",
    "delivery": "normal"
  },
  {
    "role": "char_a",
    "text": "அப்பா, நீங்க என்ன சொல்றீங்க? ஆத்துல இருந்து கிளம்பிட்டு இங்க வந்தா, எனக்கு தான் லேட் ஆகும். இப்போதான் எனக்கு பயமா இருக்கு.",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "அப்பா, டைம் 5:15, மாசா! நம்ம போக வேண்டிய டைம் 7:15. நம்ம ஆட்டோ டிரைவர் அண்ணன்கிட்ட அப்போ கேட்டிருக்கலாம்ல?",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "ஆமா, நாம இங்க இருக்கறதே ஒரு தப்புதான்.",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "ம்ம், ஆனா அப்போ கேட்டிருந்தா நாம இன்னும் லேட் ஆகியிருப்போமோ?",
    "delivery": "normal"
  },
  {
    "role": "char_a",
    "text": "எனக்கு ஒன்னும் புரியல, நாம எப்படி இங்க வந்தோம்?",
    "delivery": "fast"
  },
  {
    "role": "char_a",
    "text": "ஓ, அப்போ நாம அதே 5:15-க்கு தான் போகணும். அப்போ தான் 7:15-க்கு போக முடியும்!",
    "delivery": "normal"
  }
],
      context: {},
    },
  },
];
