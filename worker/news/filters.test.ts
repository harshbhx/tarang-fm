import { describe, expect, it } from 'vitest';
import { isGrim, hiOrMr, prefilter, scriptShare, softenClickbait } from './filters';
import { canonicalUrl, clampDate, decode, parseFeed, stripSeoPrefix, unwrapBing } from './parse';

/** The old production pattern, kept here only to prove the new one fixes its false positives. */
const OLD_GRIM =
  /murder|rape|suicide|dead body|beheaded|lynch|\bstab(bed|bing|s)?\b|sexual|molest|चाकू|यौन|छेड़छाड़|दुष्कर्म|मौत के घाट|विनयभंग|लैंगिक|भोसक|கத்திக்குத்து|ছুরি|যৌন|છરી|જાતીય|हत्या|हत्याकांड|मर्डर|बलात्कार|रेप|आत्महत्या|लाश|शव|कत्ल|கொலை|தற்கொலை|பாலியல்|பிறப்புறுப்பு|சடலம்|খুন|হত্যা|ধর্ষণ|আত্মহত্যা|মৃতদেহ|खून|હત્યા|ખૂન|બળાત્કાર|આત્મહત્યા|લાશ|મૃતદેહ/i;

// Real titles of the kinds the research found the old pattern dropping by mistake (89 of 529 hits)
const FALSE_POSITIVES = [
  'পুজোর আগে কলকাতার নতুন মেট্রো রুট দেখুন', // দেখুন "see" contained খুন
  'বাড়িতে টাকা রাখুন এই নিয়মে, বলছে ব্যাংক', // রাখুন "keep"
  'गुम हुए बच्चे की तलाश में जुटी पुलिस की टीम', // तलाश contained लाश
  'जलाशय में पानी का स्तर बढ़ा, किसानों को राहत', // जलाशय
  'केशव प्रसाद मौर्य ने किया नए अस्पताल का उद्घाटन', // केशव contained शव
  'देशविरोधी पोस्ट पर कार्रवाई की मांग', // देशविरोधी
  'प्लास्टिक पिशवी बंदीची अंमलबजावणी सुरू', // पिशवी (Marathi)
  'विराट कोहलीने चाहत्यांना दिले खास गिफ्ट', // चाहत्यांना contained हत्या
  'નવરાત્રિમાં ગરબાનો સમય બદલાશે, પોલીસની જાહેરાત', // બદલાશે contained લાશ
  'RBI ने रेपो रेट में कोई बदलाव नहीं किया', // रेपो contained रेप
];

const TRUE_HITS = [
  'Man arrested for murder of shopkeeper in Surat',
  'दिल्ली में युवक की हत्या, दो आरोपी गिरफ्तार',
  'छात्रा ने की आत्महत्या, परिवार ने लगाए आरोप',
  'नाबालिग से बलात्कार के आरोपी को उम्रकैद',
  'नदी किनारे मिली लाश, पुलिस जांच में जुटी',
  'नाले में मिला शव, इलाके में सनसनी',
  'বাড়িতে ঢুকে খুন, গ্রেফতার প্রতিবেশী',
  'ধর্ষণের অভিযোগে গ্রেফতার যুবক',
  'સુરતમાં યુવકની હત્યા, પોલીસ તપાસ શરૂ',
  'તળાવમાંથી લાશ મળી, ઓળખ બાકી',
  'சென்னையில் இளைஞர் கொலை: 3 பேர் கைது',
  // seen live on 2026-10-15: inflected and euphemistic forms
  'મોટાભાઈએ નાનાભાઈનું ગળું દબાવી લાશના હાથ-પગ બાંધી તળાવમાં ફેંકી',
  'हिन्दू मंदिर में नरसंहार की साजिश नाकाम',
  'হিন্দু মন্দিরে গণহত্যার ছক! গ্রেফতার যুবক',
  'कर्ज से परेशान किसान ने की खुदकुशी',
  'नगरसेविकेच्या मुलीनं घरातच उचललं टोकाचं पाऊल',
  'மாணவி தற்கொலை: போலீஸ் விசாரணை',
];

describe('isGrim (word-start guard)', () => {
  it('no longer drops the old false positives', () => {
    for (const t of FALSE_POSITIVES) {
      expect(OLD_GRIM.test(t), t).toBe(true);
      expect(isGrim(t), t).toBe(false);
    }
  });
  it('keeps every real hit', () => {
    for (const t of TRUE_HITS) expect(isGrim(t), t).toBe(true);
  });
  it('still matches Tamil compounds and English inflections', () => {
    expect(isGrim('வெட்டிக்கொலை செய்யப்பட்ட நபர்')).toBe(true);
    expect(isGrim('Two men stabbed outside a bar')).toBe(true);
    expect(isGrim('Sensex closes at a record high')).toBe(false);
  });
});

describe('prefilter', () => {
  it('drops wrong-script, other-language, evergreen, clickbait, stock tips and live blogs', () => {
    expect(prefilter('IND vs WI 4th T20 highlights video', '', 'hi').reason).toBe('script');
    expect(prefilter('पुणे के मंदिर में भक्तों की भीड़, प्रशासन ने किए इंतजाम', '', 'mr').reason).toBe('otherLanguage');
    expect(prefilter('पुण्यातील मंदिरात भाविकांची गर्दी, प्रशासनाची तयारी आहे', '', 'hi').reason).toBe('otherLanguage');
    expect(prefilter('আসামৰ বানপানীত ক্ষতিগ্ৰস্ত হাজাৰ মানুহ', '', 'bn').reason).toBe('assamese');
    expect(prefilter('आज का राशिफल: मेष राशि वालों के लिए शुभ दिन', '', 'hi').reason).toBe('evergreen');
    expect(prefilter('इस शेयर ने दिया 40% का रिटर्न, एक्सपर्ट ने दिया नया target', '', 'hi').reason).toBe('stockTip');
    expect(prefilter('LIVE: संसद सत्र के पहले दिन का हर अपडेट यहां', '', 'hi').reason).toBe('liveBlog');
    expect(prefilter('होश उड़ा देगी ये तस्वीर, देखकर रह जाएंगे दंग', '', 'hi').reason).toBe('clickbait');
  });
  it('cuts a teaser tail instead of dropping a real story', () => {
    expect(softenClickbait('सरकार ने बढ़ाई पीएम किसान योजना की किस्त की तारीख, जानें क्यों')).toBe('सरकार ने बढ़ाई पीएम किसान योजना की किस्त की तारीख');
    expect(prefilter('सरकार ने बढ़ाई पीएम किसान योजना की किस्त की तारीख, जानें क्यों', '', 'hi').ok).toBe(true);
  });
  it('keeps a truncated title only with a usable description, and flags death, questions and quotes', () => {
    expect(prefilter('वडोदरा में नए फ्लाईओवर का काम शुरू, नगर निगम ने…', '', 'hi').reason).toBe('truncated');
    expect(prefilter('वडोदरा में नए फ्लाईओवर का काम शुरू, नगर निगम ने…', 'नगर निगम ने कहा कि अलकापुरी फ्लाईओवर का काम छह महीने में पूरा होगा।', 'hi').ok).toBe(true);
    const crash = prefilter('हाईवे पर सड़क हादसा, तीन लोग घायल हुए', '', 'hi');
    expect(crash.ok && crash.death).toBe(true);
    expect(prefilter('क्या इस बार समय पर आएगा मानसून?', '', 'hi').question).toBe(true);
    expect(prefilter('राहुल गांधी बोले, सरकार किसानों की नहीं सुनती है', '', 'hi').opinion).toBe(true);
  });
  it('keeps the story but blanks a grim description', () => {
    const r = prefilter('गांव में पुलिस चौकी खोलने की मांग तेज हुई', 'पिछले महीने हुई हत्या के बाद ग्रामीणों ने मांग की', 'hi');
    expect(r.ok).toBe(true);
    expect(r.descr).toBe('');
  });
});

describe('language helpers', () => {
  it('tells Hindi from Marathi', () => {
    expect(hiOrMr('मुंबई में बारिश से लोकल ट्रेनें लेट हुईं')).toBe('hi');
    expect(hiOrMr('मुंबईत पावसामुळे लोकल गाड्या उशिरा धावत आहेत')).toBe('mr');
  });
  it('measures script share', () => {
    expect(scriptShare('વડોદરામાં ગરબા', 'gujr')).toBe(1);
    expect(scriptShare('Toyota Fortuner वडोदरा', 'deva')).toBeLessThan(0.6);
  });
});

describe('parse', () => {
  it('parses RSS with CDATA, double-encoded entities, Bing links and News:Source', () => {
    const xml = `<rss><channel>
      <item><title><![CDATA[वडोदरा में मेट्रो &amp;amp; बस]]></title><link>https://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2fwww.divyabhaskar.co.in%2flocal%2fa.html</link>
      <description>&lt;p&gt;नगर निगम ने नई बसें चलाईं&lt;/p&gt;</description><pubDate>Wed, 15 Oct 2026 09:30:00 GMT</pubDate><News:Source>Divya Bhaskar</News:Source></item>
      <item><title>No link</title></item>
    </channel></rss>`;
    const items = parseFeed(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('वडोदरा में मेट्रो & बस');
    expect(items[0].url).toBe('https://www.divyabhaskar.co.in/local/a.html');
    expect(items[0].descr).toBe('नगर निगम ने नई बसें चलाईं');
    expect(items[0].sourceName).toBe('Divya Bhaskar');
    expect(items[0].publishedAt).toBe(Date.parse('2026-10-15T09:30:00Z'));
  });
  it('parses Atom and RDF', () => {
    const atom = '<feed><entry><title>World news title here</title><link href="https://x.org/a"/><updated>2026-10-15T01:00:00Z</updated><summary>s</summary></entry></feed>';
    expect(parseFeed(atom)[0]).toMatchObject({ title: 'World news title here', url: 'https://x.org/a' });
    const rdf = '<rdf:RDF><item rdf:about="x"><title>বিশ্বের খবর</title><link>https://dw.com/b</link><dc:date>2026-10-15T02:00:00Z</dc:date></item></rdf:RDF>';
    expect(parseFeed(rdf)[0].publishedAt).toBe(Date.parse('2026-10-15T02:00:00Z'));
  });
  it('clamps future dates, strips SEO prefixes, unwraps links and canonicalizes URLs', () => {
    expect(clampDate(Date.parse('2026-10-15T20:00:00Z'), Date.parse('2026-10-15T12:00:00Z'))).toBe(Date.parse('2026-10-15T12:00:00Z'));
    expect(clampDate(NaN, 5)).toBe(5);
    expect(stripSeoPrefix('Railway Bonus : रेल्वे कर्मचाऱ्यांना दिवाळीपूर्वी बोनस जाहीर झाला')).toBe('रेल्वे कर्मचाऱ्यांना दिवाळीपूर्वी बोनस जाहीर झाला');
    expect(stripSeoPrefix('IPL: short')).toBe('IPL: short');
    expect(unwrapBing('https://example.com/a')).toBe('https://example.com/a');
    expect(canonicalUrl('https://www.bhaskar.com/a/b/?utm_source=rss#x')).toBe(canonicalUrl('https://bhaskar.com/a/b'));
    expect(decode('&lt;b&gt;x&lt;/b&gt; &#2309;')).toBe('x अ');
  });
});
