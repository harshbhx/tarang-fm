/** Template lines used when the model fails. See docs/TECH-SPEC.md §8.5. */
import type { StationId } from '../shared/types';

interface StationFallbacks {
  /** RJ filler lines, one is played in place of a failed segment */
  filler: [string, string, string];
  /** Call-in reply when the caller could not be heard */
  lineNotClear: string;
  /** Call-in reply when the model is unavailable */
  callThanks: string;
}

const FALLBACKS: Partial<Record<StationId, StationFallbacks>> = {
  hi: {
    filler: [
      'आप सुन रहे हैं तरंग FM 91.1… बने रहिए हमारे साथ, अगला धमाका बस आने ही वाला है!',
      'दिल से सुनिए, दिल की बात… तरंग FM पर मस्ती का सिलसिला जारी है!',
      'कहीं मत जाइए, तरंग FM पर अभी बहुत कुछ बाकी है… चाय की प्याली उठाइए और सुनते रहिए!',
    ],
    lineNotClear: 'माफ़ कीजिए, लाइन थोड़ी साफ़ नहीं थी… एक बार फिर कॉल कीजिए, हम यहीं हैं!',
    callThanks: 'कॉल करने के लिए शुक्रिया! आपकी आवाज़ सुनकर दिल खुश हो गया, बने रहिए तरंग FM के साथ!',
  },
  ta: {
    filler: [
      'நீங்கள் கேட்டுக் கொண்டிருப்பது தரங் FM 98.3… எங்களோடு இணைந்திருங்கள், அடுத்த சர்ப்ரைஸ் வந்துகிட்டே இருக்கு!',
      'இதயத்தின் அலைவரிசை, தரங் FM… இன்னும் நிறைய சுவாரசியம் காத்திருக்கு!',
      'எங்கேயும் போயிடாதீங்க, தரங் FM-ல கொண்டாட்டம் தொடருது… ஒரு கப் காபியோட கேட்டுகிட்டே இருங்க!',
    ],
    lineNotClear: 'மன்னிக்கவும், லைன் கொஞ்சம் சரியா கேட்கல… மறுபடியும் கால் பண்ணுங்க, நாங்க இங்கதான் இருக்கோம்!',
    callThanks: 'கால் பண்ணதுக்கு ரொம்ப நன்றி! உங்க குரல் கேட்டதே சந்தோஷம், தரங் FM-ஓட இணைந்திருங்க!',
  },
  bn: {
    filler: [
      'আপনি শুনছেন তরঙ্গ FM 102.7… আমাদের সঙ্গেই থাকুন, পরের চমক এল বলে!',
      'মনের কথা, মনের সুরে… তরঙ্গ FM-এ আড্ডা চলছে, চলবে!',
      'কোথাও যাবেন না, তরঙ্গ FM-এ এখনও অনেক মজা বাকি… এক কাপ চা নিয়ে শুনতে থাকুন!',
    ],
    lineNotClear: 'দুঃখিত, লাইনটা ঠিক পরিষ্কার ছিল না… আবার ফোন করুন, আমরা এখানেই আছি!',
    callThanks: 'ফোন করার জন্য অনেক ধন্যবাদ! আপনার গলা শুনে মনটা ভরে গেল, তরঙ্গ FM-এর সঙ্গে থাকুন!',
  },
  mr: {
    filler: [
      'तुम्ही ऐकत आहात तरंग FM 94.3… आमच्यासोबत राहा, पुढचं सरप्राइज अगदी जवळ आहे!',
      'मनातलं, मनापासून… तरंग FM वर मजा सुरूच आहे!',
      'कुठेही जाऊ नका, तरंग FM वर अजून खूप काही बाकी आहे… चहाचा कप घ्या आणि ऐकत राहा!',
    ],
    lineNotClear: 'माफ करा, लाइन जरा स्पष्ट नव्हती… पुन्हा एकदा कॉल करा, आम्ही इथेच आहोत!',
    callThanks: 'कॉल केल्याबद्दल खूप धन्यवाद! तुमचा आवाज ऐकून छान वाटलं, तरंग FM सोबत राहा!',
  },
  gu: {
    filler: [
      'તમે સાંભળી રહ્યા છો તરંગ FM 106.1… અમારી સાથે રહો, આગળનું સરપ્રાઇઝ બસ આવી જ રહ્યું છે!',
      'દિલથી સાંભળો, દિલની વાત… તરંગ FM પર મજા ચાલુ જ છે!',
      'ક્યાંય જશો નહીં, તરંગ FM પર હજી ઘણું બાકી છે… ચાનો કપ લો અને સાંભળતા રહો!',
    ],
    lineNotClear: 'માફ કરજો, લાઇન થોડી સ્પષ્ટ નહોતી… ફરી એક વાર કૉલ કરો, અમે અહીં જ છીએ!',
    callThanks: 'કૉલ કરવા બદલ ખૂબ આભાર! તમારો અવાજ સાંભળીને મજા આવી ગઈ, તરંગ FM સાથે રહો!',
  },
};

const DEFAULT_FALLBACKS: StationFallbacks = {
  filler: [
    'You are listening to Tarang FM… stay with us, there is a lot more coming up!',
    'Tarang FM, the station that speaks your language… stay tuned!',
    'Do not go anywhere, the fun on Tarang FM is just getting started!',
  ],
  lineNotClear: 'Sorry, the line was not very clear… please call again, we are right here!',
  callThanks: 'Thanks for calling Tarang FM! It was lovely to hear from you, stay tuned!',
};

export function fallbacksFor(station: StationId): StationFallbacks {
  return FALLBACKS[station] ?? DEFAULT_FALLBACKS;
}

export function randomFiller(station: StationId): string {
  const { filler } = fallbacksFor(station);
  return filler[Math.floor(Math.random() * filler.length)];
}

interface StudioCallTemplate {
  /** Lead-in before the caller's message; {caller} and {city} are filled in */
  withCity: string;
  noCity: string;
  /** Said in place of a caller who gave no name */
  someone: string;
}

const STUDIO_CALL: Partial<Record<StationId, StudioCallTemplate>> = {
  hi: {
    withCity: 'और अभी-अभी स्टूडियो लाइन पर {city} से {caller} का कॉल आया, उनका कहना है:',
    noCity: 'और अभी-अभी स्टूडियो लाइन पर {caller} का कॉल आया, उनका कहना है:',
    someone: 'एक श्रोता',
  },
  mr: {
    withCity: 'आणि आत्ताच स्टुडिओ लाइनवर {city} हून {caller} यांचा कॉल आला, ते म्हणतात:',
    noCity: 'आणि आत्ताच स्टुडिओ लाइनवर {caller} यांचा कॉल आला, ते म्हणतात:',
    someone: 'एक श्रोते',
  },
  gu: {
    withCity: 'અને હમણાં જ સ્ટુડિયો લાઇન પર {city}થી {caller}નો કૉલ આવ્યો, એ કહે છે:',
    noCity: 'અને હમણાં જ સ્ટુડિયો લાઇન પર {caller}નો કૉલ આવ્યો, એ કહે છે:',
    someone: 'એક શ્રોતા',
  },
  bn: {
    withCity: 'আর এইমাত্র স্টুডিও লাইনে {city} থেকে {caller} ফোন করেছিলেন, উনি বলছেন:',
    noCity: 'আর এইমাত্র স্টুডিও লাইনে {caller} ফোন করেছিলেন, উনি বলছেন:',
    someone: 'একজন শ্রোতা',
  },
  ta: {
    withCity: 'இப்போ தான் {city}-லிருந்து {caller} ஸ்டுடியோ லைனுக்கு கால் பண்ணாங்க, அவங்க சொல்றது:',
    noCity: 'இப்போ தான் {caller} ஸ்டுடியோ லைனுக்கு கால் பண்ணாங்க, அவங்க சொல்றது:',
    someone: 'ஒரு நேயர்',
  },
};

const DEFAULT_STUDIO_CALL: StudioCallTemplate = {
  withCity: 'We just got a call on the studio line from {caller} in {city}, who says:',
  noCity: 'We just got a call on the studio line from {caller}, who says:',
  someone: 'a listener',
};

/**
 * A fixed on-air line for a studio call the script left out, so a caller is never silently skipped.
 * `caller` and `city` are already in the station's script; the message is read as the caller left it.
 */
export function studioCallLine(station: StationId, caller: string | undefined, city: string | undefined, message: string): string {
  const t = STUDIO_CALL[station] ?? DEFAULT_STUDIO_CALL;
  const lead = (city ? t.withCity : t.noCity).replace('{caller}', caller || t.someone).replace('{city}', city ?? '');
  return `${lead} ${message.trim()}`;
}

/** The word for an unnamed caller in the station language. */
export function someoneFor(station: StationId): string {
  return (STUDIO_CALL[station] ?? DEFAULT_STUDIO_CALL).someone;
}
