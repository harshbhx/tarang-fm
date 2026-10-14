/**
 * Safety net for the call-in: a caller who talks about not wanting to live always gets a warm,
 * fixed reply with the Tele-MANAS helpline (14416, free, 24×7), whatever the model decided.
 */
import type { StationId } from '../shared/types';

const SELF_HARM = new RegExp(
  [
    // English
    'kill myself',
    'suicid',
    'want to die',
    'end my life',
    "don'?t want to live",
    'hurt myself',
    'no reason to live',
    // Hindi
    'जीने का (मन|दिल) नहीं',
    'जीना नहीं चाह',
    'मरना चाह',
    'मर जाना चाह',
    'आत्महत्या',
    'ख़ुद को ख़त्म',
    'खुद को खत्म',
    'जान दे द',
    'ज़िंदगी ख़त्म',
    'जिंदगी खत्म',
    // Marathi
    'जगायचं नाही',
    'जगावंसं वाटत नाही',
    'मरायचं आहे',
    // Gujarati
    'જીવવું નથી',
    'જીવવાનું મન નથી',
    'આત્મહત્યા',
    'મરી જવું છે',
    // Tamil
    'தற்கொலை',
    'சாக வேண்டும்',
    'வாழ விருப்பம் இல்லை',
    'வாழ பிடிக்கல',
    // Bengali
    'আত্মহত্যা',
    'বাঁচতে ইচ্ছে করে না',
    'মরে যেতে চাই',
  ].join('|'),
  'iu',
);

export function soundsLikeCrisis(transcript: string): boolean {
  return SELF_HARM.test(transcript);
}

/** Fixed, warm on-air reply per station: no jokes, the caller matters, talk to someone, Tele-MANAS 14416. */
const CARE_REPLY: Partial<Record<StationId, string>> = {
  hi: 'आप हमारे लिए बहुत मायने रखते हैं, और आप अकेले नहीं हैं। अभी किसी भरोसेमंद इंसान से बात कीजिए, या Tele-MANAS पर 14416 पर कॉल कीजिए, ये मुफ़्त है और 24 घंटे खुला है।',
  mr: 'तुम्ही आमच्यासाठी खूप महत्त्वाचे आहात, आणि तुम्ही एकटे नाही. आत्ताच विश्वासातल्या कोणाशी तरी बोला, किंवा Tele-MANAS ला 14416 वर कॉल करा, हे मोफत आणि 24 तास सुरू असतं.',
  ta: 'நீங்க எங்களுக்கு ரொம்ப முக்கியம், நீங்க தனியா இல்லை. இப்பவே நம்பிக்கையான ஒருத்தர்கிட்ட பேசுங்க, அல்லது Tele-MANAS 14416 க்கு கால் பண்ணுங்க, இது இலவசம், 24 மணி நேரமும் இருக்கும்.',
  bn: 'আপনি আমাদের কাছে অনেক মূল্যবান, আর আপনি একা নন। এখনই কোনো বিশ্বস্ত মানুষের সঙ্গে কথা বলুন, অথবা Tele-MANAS-এ 14416 নম্বরে ফোন করুন, এটা বিনামূল্যে আর 24 ঘণ্টা খোলা।',
  gu: 'તમે અમારા માટે ખૂબ મહત્ત્વના છો, અને તમે એકલા નથી. અત્યારે જ કોઈ વિશ્વાસુ વ્યક્તિ સાથે વાત કરો, અથવા Tele-MANAS ને 14416 પર કૉલ કરો, આ મફત છે અને 24 કલાક ખુલ્લું છે.',
};

const CARE_REPLY_EN = 'You matter to us, and you are not alone. Please talk to someone you trust right now, or call Tele-MANAS on 14416. It is free and open 24 hours.';

export function careReply(station: StationId): string {
  return CARE_REPLY[station] ?? CARE_REPLY_EN;
}

/** Hand-written subtitle for the care reply (machine translation of it is not reliable enough). */
export function careReplyEn(): string {
  return CARE_REPLY_EN;
}

export const HELPLINE = { name: 'Tele-MANAS', number: '14416' } as const;
