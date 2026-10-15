/**
 * Curated city facts for RJ links: landmarks, history, food and festivals specific to each city. Never generated
 * at runtime. Every fact was checked against the English Wikipedia article named in `source` on `verifiedOn`
 * (plain-text extract, key words and numbers matched). No populations, rankings that change, or opinions.
 *
 * Native text uses ASCII digits so `keptTokens` match in every script. Each city carries native text in Hindi and
 * in its own station language (when Tarang has one); other stations render `en`.
 */
import type { StationLang } from './festivals';

export interface CityFact {
  /** Stable id, e.g. 'vad-01'. Sent back in usedFactIds once aired. */
  id: string;
  en: string;
  text: Partial<Record<StationLang, string>>;
  /** Numbers and Latin tokens the line must keep verbatim */
  keep?: string[];
  /** Why a listener cares: the RJ's natural way in */
  angleEn: string;
  /** English Wikipedia article the fact was checked against */
  source: string;
  verifiedOn: string;
}

export interface CityInfo {
  key: string;
  /** English names and aliases as Cloudflare or listeners give them (lower case) */
  aliases: string[];
  state: string;
  lat: number;
  lon: number;
  /** City name per station script */
  names: Record<StationLang, string>;
  /** District or city names an official alert may use for this city (matched as whole words, English) */
  alertNames: string[];
  facts: CityFact[];
}

const V = '2026-10-15';
const wp = (title: string) => `en.wikipedia.org/wiki/${title.replace(/ /g, '_')}`;

export const CITIES: CityInfo[] = [
  {
    key: 'vadodara',
    aliases: ['vadodara', 'baroda'],
    state: 'Gujarat',
    lat: 22.31,
    lon: 73.18,
    names: { hi: 'बड़ौदा', gu: 'વડોદરા', mr: 'वडोदरा', ta: 'வதோதரா', bn: 'ভাদোদরা' },
    alertNames: ['Vadodara', 'Baroda'],
    facts: [
      {
        id: 'vad-01',
        en: "Laxmi Vilas Palace, built for Maharaja Sayajirao Gaekwad III and completed in 1890, is described as the world's largest private residence.",
        text: {
          hi: 'बड़ौदा का लक्ष्मी विलास पैलेस 1890 में बनकर तैयार हुआ था, और इसे दुनिया का सबसे बड़ा निजी निवास कहा जाता है।',
          gu: 'વડોદરાનો લક્ષ્મી વિલાસ પેલેસ 1890માં બનીને તૈયાર થયો હતો, અને તેને દુનિયાનું સૌથી મોટું ખાનગી નિવાસસ્થાન કહેવાય છે.',
        },
        keep: ['1890'],
        angleEn: 'The biggest private home in the world is in our own city: local pride with a smile.',
        source: wp('Lakshmi Vilas Palace, Vadodara'),
        verifiedOn: V,
      },
      {
        id: 'vad-02',
        en: "The name Vadodara comes from the Sanskrit 'vatodara', 'in the belly of the banyan tree'.",
        text: {
          hi: "वडोदरा नाम संस्कृत के 'वटोदर' से आया है, यानी बरगद के पेड़ के बीच बसा शहर।",
          gu: "વડોદરા નામ સંસ્કૃતના 'વટોદર' પરથી આવ્યું છે, એટલે કે વડના ઝાડની વચ્ચે વસેલું શહેર.",
        },
        angleEn: 'The city literally has a tree in its name; a gentle nudge about the green the city grew up in.',
        source: wp('Vadodara'),
        verifiedOn: V,
      },
      {
        id: 'vad-03',
        en: 'Sayaji Baug, also called Kamati Baug, was laid out in 1879 by Maharaja Sayajirao Gaekwad III on the banks of the Vishwamitri river.',
        text: {
          hi: 'सयाजी बाग, जिसे कमाटी बाग भी कहते हैं, 1879 में महाराजा सयाजीराव गायकवाड़ तृतीय ने विश्वामित्री नदी के किनारे बनवाया था।',
          gu: 'સયાજીબાગ, જેને કમાટીબાગ પણ કહે છે, 1879માં મહારાજા સયાજીરાવ ગાયકવાડ ત્રીજાએ વિશ્વામિત્રી નદીના કિનારે બનાવડાવ્યો હતો.',
        },
        keep: ['1879'],
        angleEn: "Everyone's Sunday-evening garden is older than most of the city's buildings.",
        source: wp('Sayaji Baug'),
        verifiedOn: V,
      },
      {
        id: 'vad-04',
        en: 'The Maharaja Sayajirao University of Baroda became a university in 1949; the great dome on its main building is modelled on the Gol Gumbaz of Bijapur.',
        text: {
          hi: 'महाराजा सयाजीराव यूनिवर्सिटी 1949 में यूनिवर्सिटी बनी, और इसकी मुख्य इमारत का बड़ा गुंबद बीजापुर के गोल गुंबज की तर्ज़ पर बना है।',
          gu: 'મહારાજા સયાજીરાવ યુનિવર્સિટી 1949માં યુનિવર્સિટી બની, અને તેની મુખ્ય ઇમારતનો મોટો ઘુમ્મટ બીજાપુરના ગોળ ગુંબજની જેમ બનાવાયો છે.',
        },
        keep: ['1949'],
        angleEn: 'Half the city has a story from MSU; the dome they walked under has a famous twin in Karnataka.',
        source: wp('Maharaja Sayajirao University of Baroda'),
        verifiedOn: V,
      },
      {
        id: 'vad-05',
        en: 'Sursagar Lake, in the middle of the old city, has a tall statue of Lord Shiva standing in the water.',
        text: {
          hi: 'शहर के बीचों-बीच सुरसागर तालाब है, और उसके पानी में भगवान शिव की ऊँची प्रतिमा खड़ी है।',
          gu: 'શહેરની વચ્ચે સુરસાગર તળાવ છે, અને તેના પાણીમાં ભગવાન શિવની ઊંચી પ્રતિમા ઊભી છે.',
        },
        angleEn: 'The landmark everyone uses to give directions; evenings by the lake are a Vadodara ritual.',
        source: wp('Sursagar Lake'),
        verifiedOn: V,
      },
      {
        id: 'vad-06',
        en: 'Kirti Mandir, the memorial of the Gaekwad family, has murals by the painter Nandalal Bose.',
        text: {
          hi: 'गायकवाड़ परिवार के स्मारक कीर्ति मंदिर में मशहूर चित्रकार नंदलाल बोस के बनाए भित्ति-चित्र हैं।',
          gu: 'ગાયકવાડ પરિવારના સ્મારક કીર્તિ મંદિરમાં જાણીતા ચિત્રકાર નંદલાલ બોઝનાં ભીંતચિત્રો છે.',
        },
        angleEn: 'A world-class art treasure hiding in plain sight on a road people drive past every day.',
        source: wp('Kirti Mandir, Vadodara'),
        verifiedOn: V,
      },
      {
        id: 'vad-07',
        en: 'The Vishwamitri river, which flows through Vadodara, is home to mugger crocodiles.',
        text: {
          hi: 'बड़ौदा से होकर बहने वाली विश्वामित्री नदी में मगरमच्छ रहते हैं, शहर के बीचों-बीच।',
          gu: 'વડોદરામાંથી વહેતી વિશ્વામિત્રી નદીમાં મગરો રહે છે, શહેરની વચ્ચોવચ.',
        },
        angleEn: 'Few cities can say they share their river with crocodiles; a wide-eyed, slightly funny fact.',
        source: wp('Vishwamitri River'),
        verifiedOn: V,
      },
      {
        id: 'vad-08',
        en: 'The Baroda Museum & Picture Gallery has an Egyptian mummy in its collection.',
        text: {
          hi: 'बड़ौदा म्यूज़ियम एंड पिक्चर गैलरी में मिस्र की एक ममी रखी है।',
          gu: 'બરોડા મ્યુઝિયમ એન્ડ પિક્ચર ગેલેરીમાં ઇજિપ્તની એક મમી રાખેલી છે.',
        },
        angleEn: 'A weekend plan for families with kids: an actual mummy, a short drive away.',
        source: wp('Baroda Museum & Picture Gallery'),
        verifiedOn: V,
      },
    ],
  },
  {
    key: 'ahmedabad',
    aliases: ['ahmedabad', 'amdavad', 'ahmadabad'],
    state: 'Gujarat',
    lat: 23.02,
    lon: 72.57,
    names: { hi: 'अहमदाबाद', gu: 'અમદાવાદ', mr: 'अहमदाबाद', ta: 'அகமதாபாத்', bn: 'আহমেদাবাদ' },
    alertNames: ['Ahmedabad', 'Ahmadabad'],
    facts: [
      {
        id: 'amd-01',
        en: 'Ahmedabad was founded in 1411 by Sultan Ahmad Shah and is named after him.',
        text: {
          hi: 'अहमदाबाद 1411 में सुल्तान अहमद शाह ने बसाया था, और शहर का नाम उन्हीं के नाम पर है।',
          gu: 'અમદાવાદ 1411માં સુલતાન અહમદ શાહે વસાવ્યું હતું, અને શહેરનું નામ તેમના નામ પરથી પડ્યું છે.',
        },
        keep: ['1411'],
        angleEn: 'The city is more than six hundred years old; a birthday-style fact for a city that loves its history.',
        source: wp('Ahmedabad'),
        verifiedOn: V,
      },
      {
        id: 'amd-02',
        en: 'In July 2017 the historic old city of Ahmedabad was declared a UNESCO World Heritage Site.',
        text: {
          hi: '2017 में पुराने अहमदाबाद को UNESCO ने विश्व धरोहर घोषित किया।',
          gu: '2017માં જૂના અમદાવાદને UNESCOએ વિશ્વ ધરોહર જાહેર કર્યું.',
        },
        keep: ['2017', 'UNESCO'],
        angleEn: 'The narrow lanes people complain about are officially world heritage; local pride with a wink.',
        source: wp('Ahmedabad'),
        verifiedOn: V,
      },
      {
        id: 'amd-03',
        en: "The old city's pols are close-knit housing clusters, usually entered through a gate.",
        text: {
          hi: "पुराने अहमदाबाद की 'पोल' घरों के ऐसे मोहल्ले हैं जिनमें आम तौर पर एक दरवाज़े से होकर जाते हैं।",
          gu: 'જૂના અમદાવાદની પોળ એટલે ઘરોના એવા મહોલ્લા જેમાં સામાન્ય રીતે એક દરવાજામાંથી પ્રવેશ થાય છે.',
        },
        angleEn: 'A neighbourhood where everyone knows everyone; the RJ can wonder who guards the gate gossip.',
        source: wp('Pol (housing)'),
        verifiedOn: V,
      },
      {
        id: 'amd-04',
        en: 'Sabarmati Ashram was one of the homes of Mahatma Gandhi, and the Dandi March set out from there on 12 March 1930.',
        text: {
          hi: 'साबरमती आश्रम गांधीजी के घरों में से एक था, और 12 मार्च 1930 को दांडी यात्रा यहीं से शुरू हुई थी।',
          gu: 'સાબરમતી આશ્રમ ગાંધીજીના નિવાસોમાંનો એક હતો, અને 12 માર્ચ 1930ના રોજ દાંડીકૂચ અહીંથી જ શરૂ થઈ હતી.',
        },
        keep: ['12', '1930'],
        angleEn: 'A walk that changed history started from a place many locals pass on the riverfront.',
        source: wp('Sabarmati Ashram'),
        verifiedOn: V,
      },
      {
        id: 'amd-05',
        en: 'The carved stone lattice of intertwined trees at the Sidi Saiyyed Mosque is the unofficial symbol of Ahmedabad and inspired the logo of IIM Ahmedabad.',
        text: {
          hi: 'सीदी सैयद मस्जिद की पेड़ों वाली पत्थर की जाली अहमदाबाद की पहचान है, और IIM अहमदाबाद का logo इसी से प्रेरित है।',
          gu: 'સીદી સૈયદની મસ્જિદની વૃક્ષોવાળી પથ્થરની જાળી અમદાવાદની ઓળખ છે, અને IIM અમદાવાદનો લોગો તેનાથી પ્રેરિત છે.',
        },
        keep: ['IIM'],
        angleEn: "A five-hundred-year-old window ended up on one of India's best-known logos; a fun 'did you know'.",
        source: wp('Sidi Saiyyed Mosque'),
        verifiedOn: V,
      },
      {
        id: 'amd-06',
        en: 'Kankaria Lake was built in 1451, in the time of Sultan Qutb-ud-din Ahmad Shah II.',
        text: {
          hi: 'कांकरिया तालाब 1451 में सुल्तान कुतुबुद्दीन अहमद शाह द्वितीय के समय बना था।',
          gu: 'કાંકરિયા તળાવ 1451માં સુલતાન કુતુબુદ્દીન અહમદ શાહ બીજાના સમયમાં બન્યું હતું.',
        },
        keep: ['1451'],
        angleEn: "The city's favourite evening outing is more than five centuries old.",
        source: wp('Kankaria Lake'),
        verifiedOn: V,
      },
      {
        id: 'amd-07',
        en: 'Manek Chowk is a market by day and turns into a food street at night.',
        text: {
          hi: 'माणेक चौक दिन में बाज़ार रहता है, और रात होते ही खाने-पीने की गली बन जाता है।',
          gu: 'માણેકચોક દિવસે બજાર હોય છે, અને રાત પડતાં જ ખાણીપીણીની ગલી બની જાય છે.',
        },
        angleEn: 'Late-night food plans: the same square, two completely different lives.',
        source: wp('Manek Chowk (Ahmedabad)'),
        verifiedOn: V,
      },
      {
        id: 'amd-08',
        en: "The 'shaking minarets' (Jhulta Minar) of Ahmedabad: when one minaret is shaken, the other vibrates too.",
        text: {
          hi: "अहमदाबाद के 'झूलता मीनार' की ख़ासियत: एक मीनार को हिलाओ तो दूसरी भी काँपने लगती है।",
          gu: "અમદાવાદના 'ઝૂલતા મિનારા'ની ખાસિયત: એક મિનારો હલાવો તો બીજો પણ ધ્રૂજવા લાગે છે.",
        },
        angleEn: 'A centuries-old engineering puzzle in our own city; curiosity over lecture.',
        source: wp('Jhulta Minar'),
        verifiedOn: V,
      },
    ],
  },
  {
    key: 'mumbai',
    aliases: ['mumbai', 'bombay', 'navi mumbai'],
    state: 'Maharashtra',
    lat: 19.08,
    lon: 72.88,
    names: { hi: 'मुंबई', mr: 'मुंबई', gu: 'મુંબઈ', ta: 'மும்பை', bn: 'মুম্বই' },
    alertNames: ['Mumbai', 'Bombay'],
    facts: [
      {
        id: 'mum-01',
        en: 'The Gateway of India was built to mark the 1911 landing of King George V and Queen Mary, and was completed in 1924.',
        text: {
          hi: 'गेटवे ऑफ़ इंडिया 1911 में किंग जॉर्ज पंचम और क्वीन मैरी के आगमन की याद में बना, और 1924 में पूरा हुआ।',
          mr: 'गेटवे ऑफ इंडिया 1911 मधील किंग जॉर्ज पंचम आणि क्वीन मेरी यांच्या आगमनाच्या स्मरणार्थ बांधलं गेलं आणि 1924 मध्ये पूर्ण झालं.',
        },
        keep: ['1911', '1924'],
        angleEn: 'The arch was finished thirteen years after the visit it celebrates; Mumbai deadlines have a long history.',
        source: wp('Gateway of India'),
        verifiedOn: V,
      },
      {
        id: 'mum-02',
        en: 'Chhatrapati Shivaji Maharaj Terminus was completed in 1888 and is a UNESCO World Heritage Site.',
        text: {
          hi: 'छत्रपति शिवाजी महाराज टर्मिनस 1888 में बनकर तैयार हुआ था, और आज यह UNESCO की विश्व धरोहर है।',
          mr: 'छत्रपती शिवाजी महाराज टर्मिनस 1888 मध्ये बांधून पूर्ण झालं, आणि आज ते UNESCO चं जागतिक वारसा स्थळ आहे.',
        },
        keep: ['1888', 'UNESCO'],
        angleEn: 'Lakhs rush through a world heritage building every morning without looking up.',
        source: wp('Chhatrapati Shivaji Maharaj Terminus'),
        verifiedOn: V,
      },
      {
        id: 'mum-03',
        en: "India's first passenger train ran between Bombay and Thane in 1853.",
        text: {
          hi: 'भारत की पहली यात्री ट्रेन 1853 में मुंबई और ठाणे के बीच चली थी।',
          mr: 'भारतातली पहिली प्रवासी रेल्वे 1853 मध्ये मुंबई ते ठाणे अशी धावली.',
        },
        keep: ['1853'],
        angleEn: "Mumbai's train life started with the very first run in India; every local-train rider is part of that story.",
        source: wp('Rail transport in India'),
        verifiedOn: V,
      },
      {
        id: 'mum-04',
        en: "At night the curve of lights along Marine Drive looks like a string of pearls, which is why it is called the Queen's Necklace.",
        text: {
          hi: "रात में मरीन ड्राइव की रोशनियाँ मोतियों की माला जैसी दिखती हैं, इसीलिए इसे 'क्वीन्स नेकलेस' कहते हैं।",
          mr: "रात्री मरीन ड्राइव्हचे दिवे मोत्यांच्या माळेसारखे दिसतात, म्हणूनच त्याला 'क्वीन्स नेकलेस' म्हणतात.",
        },
        angleEn: 'An evening walk suggestion with a pretty name behind it.',
        source: wp('Marine Drive, Mumbai'),
        verifiedOn: V,
      },
      {
        id: 'mum-05',
        en: "Mumbai's dabbawalas have been delivering home-cooked lunchboxes to offices since 1890.",
        text: {
          hi: 'मुंबई के डब्बावाले 1890 से घर का बना खाना दफ़्तरों तक पहुँचा रहे हैं।',
          mr: 'मुंबईचे डबेवाले 1890 पासून घरचा डबा ऑफिसपर्यंत पोहोचवत आहेत.',
        },
        keep: ['1890'],
        angleEn: "More than a century of lunch arriving on time: a nod to the city's quiet heroes around lunch hour.",
        source: wp('Dabbawala'),
        verifiedOn: V,
      },
      {
        id: 'mum-06',
        en: 'The name Mumbai comes from Mumbadevi, the patron goddess of the Koli community, the original inhabitants of the islands.',
        text: {
          hi: 'मुंबई का नाम मुंबादेवी से आया है, जो यहाँ के कोली समुदाय की कुलदेवी मानी जाती हैं।',
          mr: 'मुंबई हे नाव मुंबादेवीवरून आलं आहे, ज्या इथल्या कोळी समाजाच्या कुलदेवता मानल्या जातात.',
        },
        angleEn: "The city's name remembers its first residents, the fishing Koli community.",
        source: wp('Mumbai'),
        verifiedOn: V,
      },
      {
        id: 'mum-07',
        en: 'Mumbai was originally seven islands, joined into one landmass by land reclamation.',
        text: {
          hi: 'मुंबई पहले सात अलग-अलग द्वीप थी, जिन्हें समुद्र में भराव करके जोड़ा गया।',
          mr: 'मुंबई आधी सात वेगवेगळी बेटं होती, समुद्रात भराव टाकून ती जोडली गेली.',
        },
        angleEn: "The city that never has enough space literally built its own land; a 'no wonder' moment.",
        source: wp('Mumbai'),
        verifiedOn: V,
      },
      {
        id: 'mum-08',
        en: 'Haji Ali Dargah stands on an islet off the coast at Worli; the causeway to it can be walked only at low tide.',
        text: {
          hi: 'हाजी अली दरगाह समुद्र में एक छोटे टापू पर है, और वहाँ तक जाने वाला रास्ता सिर्फ़ भाटे के समय खुलता है।',
          mr: 'हाजी अली दर्गा समुद्रातल्या एका छोट्या बेटावर आहे, आणि तिथे जाणारा रस्ता फक्त ओहोटीच्या वेळी खुला होतो.',
        },
        angleEn: 'A visit planned by the sea itself: check the tide before you go.',
        source: wp('Haji Ali Dargah'),
        verifiedOn: V,
      },
    ],
  },
  {
    key: 'pune',
    aliases: ['pune', 'poona', 'pimpri-chinchwad', 'pimpri chinchwad'],
    state: 'Maharashtra',
    lat: 18.52,
    lon: 73.86,
    names: { hi: 'पुणे', mr: 'पुणे', gu: 'પુણે', ta: 'புனே', bn: 'পুনে' },
    alertNames: ['Pune', 'Poona'],
    facts: [
      {
        id: 'pun-01',
        en: 'Shaniwar Wada, the seat of the Peshwas, was completed in 1732.',
        text: {
          hi: 'पुणे का शनिवार वाड़ा 1732 में बनकर तैयार हुआ था, और यह पेशवाओं का ठिकाना था।',
          mr: 'पुण्याचा शनिवारवाडा 1732 मध्ये बांधून पूर्ण झाला, आणि तो पेशव्यांचं निवासस्थान होता.',
        },
        keep: ['1732'],
        angleEn: "The city's most famous address is almost three hundred years old.",
        source: wp('Shaniwar Wada'),
        verifiedOn: V,
      },
      {
        id: 'pun-02',
        en: "Pune is called the 'Oxford of the East' for its many educational institutions.",
        text: {
          hi: "अपने कॉलेजों और शिक्षा संस्थानों की वजह से पुणे को 'पूरब का ऑक्सफ़ोर्ड' कहा जाता है।",
          mr: "इथल्या अनेक शिक्षणसंस्थांमुळे पुण्याला 'पूर्वेचं ऑक्सफर्ड' म्हटलं जातं.",
        },
        angleEn: 'A city full of students and the debates on FC Road that come with them.',
        source: wp('Pune'),
        verifiedOn: V,
      },
      {
        id: 'pun-03',
        en: 'Sinhagad fort near Pune is remembered for Tanaji Malusare and the Battle of Sinhagad in 1670.',
        text: {
          hi: 'पुणे के पास सिंहगढ़ क़िला तानाजी मालुसरे और 1670 की सिंहगढ़ की लड़ाई के लिए याद किया जाता है।',
          mr: 'पुण्याजवळचा सिंहगड किल्ला तानाजी मालुसरे आणि 1670 च्या सिंहगडाच्या लढाईसाठी ओळखला जातो.',
        },
        keep: ['1670'],
        angleEn: 'The weekend trek has a story behind every step; good for a Saturday-morning link.',
        source: wp('Sinhagad'),
        verifiedOn: V,
      },
      {
        id: 'pun-04',
        en: 'Pune grew up around the confluence of the Mula and Mutha rivers.',
        text: {
          hi: 'पुणे मुला और मुठा नदियों के संगम के आसपास बसा है।',
          mr: 'पुणे मुळा आणि मुठा नद्यांच्या संगमाभोवती वसलं आहे.',
        },
        angleEn: 'Two rivers, one city: a calm, geography-of-home fact.',
        source: wp('Pune'),
        verifiedOn: V,
      },
      {
        id: 'pun-05',
        en: 'The Aga Khan Palace in Pune was built by Aga Khan III, it is said to give work to famine-hit villagers; the memorials of Mahatma and Kasturba Gandhi are in the same complex.',
        text: {
          hi: 'कहते हैं पुणे का आगा ख़ान पैलेस अकाल से परेशान गाँववालों को काम देने के लिए बनवाया गया था, और इसी परिसर में गांधीजी और कस्तूरबा की समाधियाँ हैं।',
          mr: 'असं म्हणतात की पुण्यातला आगाखान पॅलेस दुष्काळग्रस्त गावकऱ्यांना काम मिळावं म्हणून बांधला गेला, आणि याच आवारात गांधीजी आणि कस्तुरबांच्या समाध्या आहेत.',
        },
        angleEn: 'A palace built as famine relief, now a quiet, green corner with a big place in history.',
        source: wp('Aga Khan Palace'),
        verifiedOn: V,
      },
      {
        id: 'pun-06',
        en: 'The Film and Television Institute of India (FTII) stands on the old Prabhat Film Company campus in Pune.',
        text: {
          hi: 'पुणे का FTII, यानी फ़िल्म एंड टेलीविज़न इंस्टिट्यूट, पुरानी प्रभात फ़िल्म कंपनी के परिसर में है।',
          mr: 'पुण्यातलं FTII, म्हणजे फिल्म अँड टेलिव्हिजन इन्स्टिट्यूट, जुन्या प्रभात फिल्म कंपनीच्या आवारात आहे.',
        },
        keep: ['FTII'],
        angleEn: 'Many film stars learned their craft in this city; a movie-lover angle.',
        source: wp('Film and Television Institute of India'),
        verifiedOn: V,
      },
      {
        id: 'pun-07',
        en: 'The Sawai Gandharva Bhimsen Mahotsav, a festival of Indian classical music, is held in Pune every December.',
        text: {
          hi: 'पुणे में हर दिसंबर सवाई गंधर्व भीमसेन महोत्सव होता है, जो शास्त्रीय संगीत का बड़ा उत्सव है।',
          mr: 'पुण्यात दर डिसेंबरमध्ये सवाई गंधर्व भीमसेन महोत्सव होतो, शास्त्रीय संगीताचा मोठा उत्सव.',
        },
        angleEn: 'December nights in Pune have a soundtrack; a music lover’s calendar note.',
        source: wp('Sawai Gandharva Bhimsen Festival'),
        verifiedOn: V,
      },
      {
        id: 'pun-08',
        en: 'Lal Mahal in Pune is where Shivaji Maharaj spent part of his childhood.',
        text: {
          hi: 'पुणे का लाल महल वह जगह है जहाँ छत्रपति शिवाजी महाराज ने बचपन के कुछ साल बिताए।',
          mr: 'पुण्यातला लाल महाल म्हणजे जिथे छत्रपती शिवाजी महाराजांनी बालपणीची काही वर्षं घालवली.',
        },
        angleEn: 'A childhood home in the middle of the old city; history at walking distance.',
        source: wp('Lal Mahal'),
        verifiedOn: V,
      },
    ],
  },
  {
    key: 'delhi',
    aliases: ['delhi', 'new delhi'],
    state: 'Delhi',
    lat: 28.61,
    lon: 77.21,
    names: { hi: 'दिल्ली', mr: 'दिल्ली', gu: 'દિલ્હી', ta: 'டெல்லி', bn: 'দিল্লি' },
    alertNames: ['Delhi', 'New Delhi'],
    facts: [
      {
        id: 'del-01',
        en: 'The Qutub Minar is 72.5 metres tall and is a UNESCO World Heritage Site.',
        text: { hi: 'क़ुतुब मीनार 72.5 मीटर ऊँची है, और यह UNESCO की विश्व धरोहर है।' },
        keep: ['72.5', 'UNESCO'],
        angleEn: 'A tower built centuries before cranes; the RJ can marvel at how.',
        source: wp('Qutb Minar'),
        verifiedOn: V,
      },
      {
        id: 'del-02',
        en: 'The Red Fort was built by Shah Jahan and completed in 1648.',
        text: { hi: 'लाल क़िला शाहजहाँ ने बनवाया था, और यह 1648 में पूरा हुआ।' },
        keep: ['1648'],
        angleEn: 'The fort on every Independence Day broadcast is nearly four centuries old.',
        source: wp('Red Fort'),
        verifiedOn: V,
      },
      {
        id: 'del-03',
        en: 'India Gate is a war memorial designed by Edwin Lutyens.',
        text: { hi: 'इंडिया गेट एक युद्ध स्मारक है, जिसका डिज़ाइन एडविन लुटियंस ने बनाया था।' },
        angleEn: "The city's favourite evening ice-cream spot is a memorial to soldiers; a warm, respectful note.",
        source: wp('India Gate'),
        verifiedOn: V,
      },
      {
        id: 'del-04',
        en: "Chandni Chowk, 'Moonlight Square', was built in 1650 under Shah Jahan and designed by his daughter Jahanara; its canals were made to reflect moonlight.",
        text: { hi: 'चाँदनी चौक 1650 में शाहजहाँ के समय बना, इसका नक्शा उनकी बेटी जहाँआरा ने बनाया था, और इसकी नहरें चाँदनी को चमकाने के लिए बनाई गई थीं।' },
        keep: ['1650'],
        angleEn: "Delhi's busiest market was planned by a princess; good for a food-and-shopping link.",
        source: wp('Chandni Chowk'),
        verifiedOn: V,
      },
      {
        id: 'del-05',
        en: "Humayun's Tomb was the first garden-tomb on the Indian subcontinent and is a UNESCO World Heritage Site.",
        text: { hi: 'हुमायूँ का मक़बरा भारतीय उपमहाद्वीप का पहला बाग़ वाला मक़बरा था, और आज UNESCO की विश्व धरोहर है।' },
        keep: ['UNESCO'],
        angleEn: 'A quiet garden in a loud city; a weekend-morning suggestion.',
        source: wp("Humayun's Tomb"),
        verifiedOn: V,
      },
      {
        id: 'del-06',
        en: "The Lotus Temple is shaped like a lotus, with 27 free-standing marble 'petals'.",
        text: { hi: 'दिल्ली का लोटस टेंपल कमल के आकार का है, जिसमें संगमरमर की 27 पंखुड़ियाँ हैं।' },
        keep: ['27'],
        angleEn: 'A building you can count petals on; a light, curious fact.',
        source: wp('Lotus Temple'),
        verifiedOn: V,
      },
      {
        id: 'del-07',
        en: 'The Delhi Metro began running on 24 December 2002.',
        text: { hi: 'दिल्ली मेट्रो 24 दिसंबर 2002 को पहली बार चली थी।' },
        keep: ['24', '2002'],
        angleEn: "Life before the Metro is hard to imagine now; commuters will relate.",
        source: wp('Delhi Metro'),
        verifiedOn: V,
      },
      {
        id: 'del-08',
        en: 'Jantar Mantar in Delhi, an astronomical observatory, was built by Maharaja Jai Singh II of Jaipur in 1724.',
        text: { hi: 'दिल्ली का जंतर मंतर जयपुर के महाराजा जय सिंह द्वितीय ने 1724 में बनवाया था, तारों और ग्रहों को मापने के लिए।' },
        keep: ['1724'],
        angleEn: 'Science in stone, long before planetariums; a curious-kid angle.',
        source: wp('Jantar Mantar, New Delhi'),
        verifiedOn: V,
      },
    ],
  },
  {
    key: 'bengaluru',
    aliases: ['bengaluru', 'bangalore'],
    state: 'Karnataka',
    lat: 12.97,
    lon: 77.59,
    names: { hi: 'बेंगलुरु', mr: 'बंगळुरू', gu: 'બેંગલુરુ', ta: 'பெங்களூரு', bn: 'বেঙ্গালুরু' },
    alertNames: ['Bengaluru', 'Bangalore'],
    facts: [
      {
        id: 'blr-01',
        en: 'Lalbagh was commissioned by Hyder Ali in 1760 and completed by Tipu Sultan.',
        text: { hi: 'लालबाग की शुरुआत 1760 में हैदर अली ने करवाई थी, और इसे टीपू सुल्तान ने पूरा करवाया।' },
        keep: ['1760'],
        angleEn: "The city's green lung is older than most cities' oldest buildings.",
        source: wp('Lal Bagh'),
        verifiedOn: V,
      },
      {
        id: 'blr-02',
        en: "Lalbagh's Glass House holds flower shows around Republic Day and Independence Day.",
        text: { hi: 'लालबाग के ग्लास हाउस में गणतंत्र दिवस और स्वतंत्रता दिवस के आसपास फूलों की प्रदर्शनी लगती है।' },
        angleEn: 'A family outing to put in the calendar.',
        source: wp('Lal Bagh'),
        verifiedOn: V,
      },
      {
        id: 'blr-03',
        en: 'Bengaluru was founded in 1537 by Kempe Gowda I.',
        text: { hi: 'बेंगलुरु की नींव 1537 में केम्पे गौड़ा प्रथम ने रखी थी।' },
        keep: ['1537'],
        angleEn: 'The tech city is nearly five hundred years old; old roots under new glass.',
        source: wp('Bangalore'),
        verifiedOn: V,
      },
      {
        id: 'blr-04',
        en: 'Cubbon Park was set up in 1870 and later named after Sir Mark Cubbon.',
        text: { hi: 'कब्बन पार्क 1870 में बना था, और बाद में इसका नाम सर मार्क कब्बन के नाम पर रखा गया।' },
        keep: ['1870'],
        angleEn: 'The morning-walk park has a name with a story.',
        source: wp('Cubbon Park'),
        verifiedOn: V,
      },
      {
        id: 'blr-05',
        en: "Bengaluru is called the 'Garden City of India'.",
        text: { hi: "अपने बाग़-बगीचों की वजह से बेंगलुरु को 'गार्डन सिटी' कहा जाता है।" },
        angleEn: 'Between the traffic jokes, a reminder of what the city is proud of.',
        source: wp('Bangalore'),
        verifiedOn: V,
      },
      {
        id: 'blr-06',
        en: "Kadalekai Parishe, a groundnut fair, is held every year in Basavanagudi near the Bull Temple.",
        text: { hi: "बेंगलुरु के बसवनगुडी में हर साल बुल टेंपल के पास 'कडलेकाई परिषे', यानी मूँगफली का मेला लगता है।" },
        angleEn: 'A whole fair for peanuts: an easy smile and a snack craving.',
        source: wp('Kadalekai Parishe'),
        verifiedOn: V,
      },
      {
        id: 'blr-07',
        en: "Bangalore Palace's design was partly inspired by Windsor Castle in England.",
        text: { hi: 'बेंगलुरु पैलेस का डिज़ाइन कुछ हद तक इंग्लैंड के विंडसर कैसल से प्रेरित है।' },
        angleEn: "A bit of England in the middle of the city; the RJ can play with 'royal' traffic.",
        source: wp('Bangalore Palace'),
        verifiedOn: V,
      },
    ],
  },
  {
    key: 'chennai',
    aliases: ['chennai', 'madras'],
    state: 'Tamil Nadu',
    lat: 13.08,
    lon: 80.27,
    names: { hi: 'चेन्नई', mr: 'चेन्नई', gu: 'ચેન્નાઈ', ta: 'சென்னை', bn: 'চেন্নাই' },
    alertNames: ['Chennai', 'Madras'],
    facts: [
      {
        id: 'chn-01',
        en: 'Marina Beach is the longest natural urban beach in India.',
        text: {
          ta: 'மெரினா கடற்கரை இந்தியாவின் மிக நீளமான இயற்கை நகர்ப்புறக் கடற்கரை.',
          hi: 'मरीना बीच भारत का सबसे लंबा प्राकृतिक शहरी समुद्र तट है।',
        },
        angleEn: "Chennai's evening walk is a national record holder.",
        source: wp('Marina Beach'),
        verifiedOn: V,
      },
      {
        id: 'chn-02',
        en: 'Fort St. George, founded in 1639, was the first English fortress in India.',
        text: {
          ta: '1639-ல் நிறுவப்பட்ட புனித ஜார்ஜ் கோட்டை, இந்தியாவில் ஆங்கிலேயர்களின் முதல் கோட்டை.',
          hi: '1639 में बसाया गया फ़ोर्ट सेंट जॉर्ज भारत में अंग्रेज़ों का पहला क़िला था।',
        },
        keep: ['1639'],
        angleEn: 'The city grew around this fort; Chennai is where a lot of modern Indian history began.',
        source: wp('Fort St. George, India'),
        verifiedOn: V,
      },
      {
        id: 'chn-03',
        en: 'The Chennai municipal corporation, set up on 29 September 1688, is the oldest municipal body in India.',
        text: {
          ta: '1688 செப்டம்பர் 29 அன்று தொடங்கப்பட்ட சென்னை மாநகராட்சி, இந்தியாவின் மிகப் பழமையான நகராட்சி அமைப்பு.',
          hi: '29 सितंबर 1688 को बना चेन्नई नगर निगम भारत का सबसे पुराना नगर निकाय है।',
        },
        keep: ['29', '1688'],
        angleEn: 'The oldest civic body in the country: something to remember next time a pothole gets fixed.',
        source: wp('Greater Chennai Corporation'),
        verifiedOn: V,
      },
      {
        id: 'chn-04',
        en: "Chennai's Music Season fills the city's sabhas with Carnatic concerts every December and January.",
        text: {
          ta: 'ஒவ்வொரு டிசம்பர், ஜனவரியிலும் சென்னை சபாக்களில் கர்நாடக இசைக் கச்சேரிகளுடன் இசை விழா நடக்கிறது.',
          hi: "हर दिसंबर-जनवरी चेन्नई की सभाओं में कर्नाटक संगीत के कार्यक्रमों वाला 'म्यूज़िक सीज़न' चलता है।",
        },
        angleEn: 'December in Chennai means concerts and canteen food; a season to look forward to.',
        source: wp('Madras Music Season'),
        verifiedOn: V,
      },
      {
        id: 'chn-05',
        en: "Madras Day is marked every year on 22 August, remembering the city's founding in 1639.",
        text: {
          ta: '1639-ல் நகரம் தோன்றியதை நினைவுகூர, ஒவ்வொரு ஆகஸ்ட் 22 அன்றும் மெட்ராஸ் தினம் கொண்டாடப்படுகிறது.',
          hi: "1639 में शहर की शुरुआत की याद में हर साल 22 अगस्त को 'मद्रास डे' मनाया जाता है।",
        },
        keep: ['22', '1639'],
        angleEn: 'The city has its own birthday; a warm, belonging kind of fact.',
        source: wp('Madras Day'),
        verifiedOn: V,
      },
      {
        id: 'chn-06',
        en: 'San Thome Basilica in Chennai is built over the tomb of St. Thomas the Apostle.',
        text: {
          ta: 'சென்னை சாந்தோம் பேராலயம், புனித தோமையாரின் கல்லறை மீது கட்டப்பட்டுள்ளது.',
          hi: 'चेन्नई का सैंथोम बैसिलिका संत थॉमस की समाधि के ऊपर बना है।',
        },
        angleEn: 'One of only a handful of churches in the world built over an apostle’s tomb, right by the beach.',
        source: wp('San Thome Basilica'),
        verifiedOn: V,
      },
      {
        id: 'chn-07',
        en: 'Guindy National Park is one of the few national parks in India situated inside a metropolitan area.',
        text: {
          ta: 'கிண்டி தேசியப் பூங்கா, நகரத்துக்குள்ளேயே இருக்கும் வெகு சில தேசியப் பூங்காக்களில் ஒன்று.',
          hi: 'गिंडी नेशनल पार्क उन गिने-चुने नेशनल पार्कों में से है जो शहर के अंदर ही हैं।',
        },
        angleEn: 'Deer and blackbuck a short ride from the office: a city with a wild side.',
        source: wp('Guindy National Park'),
        verifiedOn: V,
      },
      {
        id: 'chn-08',
        en: 'Madras was officially renamed Chennai in 1996.',
        text: {
          ta: 'மெட்ராஸ் என்ற பெயர் 1996-ல் அதிகாரப்பூர்வமாக சென்னை என மாற்றப்பட்டது.',
          hi: 'मद्रास का नाम 1996 में आधिकारिक तौर पर बदलकर चेन्नई रखा गया।',
        },
        keep: ['1996'],
        angleEn: "Plenty of people still say 'Madras' with love; both names belong to the city.",
        source: wp('Chennai'),
        verifiedOn: V,
      },
    ],
  },
  {
    key: 'kolkata',
    aliases: ['kolkata', 'calcutta', 'howrah'],
    state: 'West Bengal',
    lat: 22.57,
    lon: 88.36,
    names: { hi: 'कोलकाता', mr: 'कोलकाता', gu: 'કોલકાતા', ta: 'கொல்கத்தா', bn: 'কলকাতা' },
    alertNames: ['Kolkata', 'Calcutta', 'Howrah'],
    facts: [
      {
        id: 'kol-01',
        en: 'Howrah Bridge opened in 1943 and was built without nuts and bolts, by riveting.',
        text: {
          bn: 'হাওড়া ব্রিজ চালু হয়েছিল 1943 সালে, আর এটা তৈরি হয়েছিল কোনো নাট-বল্টু ছাড়াই, শুধু রিভেট দিয়ে।',
          hi: 'हावड़ा ब्रिज 1943 में खुला था, और यह बिना नट-बोल्ट के, सिर्फ़ रिवेट से बना है।',
        },
        keep: ['1943'],
        angleEn: 'The bridge everyone crosses holds together without a single nut or bolt.',
        source: wp('Howrah Bridge'),
        verifiedOn: V,
      },
      {
        id: 'kol-02',
        en: "The Kolkata Metro, India's first metro, began service on 24 October 1984.",
        text: {
          bn: 'কলকাতা মেট্রো, ভারতের প্রথম মেট্রো, চালু হয়েছিল 24 অক্টোবর 1984-তে।',
          hi: 'कोलकाता मेट्रो, भारत की पहली मेट्रो, 24 अक्टूबर 1984 को शुरू हुई थी।',
        },
        keep: ['24', '1984'],
        angleEn: 'Kolkata had a metro before any other Indian city; commuters can feel proud.',
        source: wp('Kolkata Metro'),
        verifiedOn: V,
      },
      {
        id: 'kol-03',
        en: 'The Victoria Memorial was built between 1906 and 1921 of white Makrana marble.',
        text: {
          bn: 'ভিক্টোরিয়া মেমোরিয়াল তৈরি হয়েছিল 1906 থেকে 1921-এর মধ্যে, মকরানার সাদা মার্বেল দিয়ে।',
          hi: 'विक्टोरिया मेमोरियल 1906 से 1921 के बीच मकराना के सफ़ेद संगमरमर से बना था।',
        },
        keep: ['1906', '1921'],
        angleEn: "Fifteen years to build the city's favourite photo backdrop.",
        source: wp('Victoria Memorial, Kolkata'),
        verifiedOn: V,
      },
      {
        id: 'kol-04',
        en: "Durga Puja in Kolkata was added to UNESCO's list of Intangible Cultural Heritage in 2021.",
        text: {
          bn: '2021 সালে কলকাতার দুর্গাপুজো UNESCO-র অধরা সাংস্কৃতিক ঐতিহ্যের তালিকায় জায়গা পেয়েছে।',
          hi: '2021 में कोलकाता की दुर्गा पूजा UNESCO की अमूर्त सांस्कृतिक विरासत की सूची में शामिल हुई।',
        },
        keep: ['2021', 'UNESCO'],
        angleEn: "The city's biggest celebration is recognised by the whole world; pandal-hopping with pride.",
        source: wp('Durga Puja in Kolkata'),
        verifiedOn: V,
      },
      {
        id: 'kol-05',
        en: "College Street is known as Boi Para, the 'colony of books', for its rows of second-hand bookstalls.",
        text: {
          bn: "কলেজ স্ট্রিটকে লোকে বলে 'বইপাড়া', পুরোনো বইয়ের দোকানে ভরা রাস্তা।",
          hi: "कॉलेज स्ट्रीट को लोग 'बोई पाड़ा' यानी किताबों का मोहल्ला कहते हैं, पुरानी किताबों की दुकानों की वजह से।",
        },
        angleEn: 'A whole neighbourhood of books; ask which book a listener last bought there.',
        source: wp('College Street (Kolkata)'),
        verifiedOn: V,
      },
      {
        id: 'kol-06',
        en: "Eden Gardens was established in 1864 and is one of India's oldest cricket grounds.",
        text: {
          bn: 'ইডেন গার্ডেন্স তৈরি হয়েছিল 1864 সালে, ভারতের সবচেয়ে পুরোনো ক্রিকেট মাঠগুলোর একটা।',
          hi: 'ईडन गार्डन्स 1864 में बना था, और यह देश के सबसे पुराने क्रिकेट मैदानों में से है।',
        },
        keep: ['1864'],
        angleEn: 'Cricket fans have been cheering here for over a century and a half.',
        source: wp('Eden Gardens'),
        verifiedOn: V,
      },
      {
        id: 'kol-07',
        en: 'Trams first ran in Calcutta in 1873, pulled by horses.',
        text: {
          bn: 'কলকাতায় ট্রাম প্রথম চলেছিল 1873 সালে, তখন ট্রাম টানত ঘোড়া।',
          hi: 'कोलकाता में ट्राम पहली बार 1873 में चली थी, तब उन्हें घोड़े खींचते थे।',
        },
        keep: ['1873'],
        angleEn: 'Before electricity, horsepower meant actual horses; a nostalgic smile.',
        source: wp('Trams in Kolkata'),
        verifiedOn: V,
      },
      {
        id: 'kol-08',
        en: "West Bengal received a GI tag for 'Banglar Rosogolla' in 2017.",
        text: {
          bn: "2017 সালে 'বাংলার রসগোল্লা' জিআই ট্যাগ পেয়েছে।",
          hi: "2017 में 'बांग्लार रसगोल्ला' को GI टैग मिला।",
        },
        keep: ['2017'],
        angleEn: 'The sweet has official papers now; a light, mouth-watering fact.',
        source: wp('Rasgulla'),
        verifiedOn: V,
      },
    ],
  },
];

const BY_ALIAS = new Map(CITIES.flatMap((c) => c.aliases.map((a) => [a, c] as const)));

/** The curated city for a Cloudflare or listener city name, if Tarang has one. */
export function cityInfo(city?: string): CityInfo | undefined {
  const key = city?.trim().toLowerCase();
  return key ? BY_ALIAS.get(key) : undefined;
}
