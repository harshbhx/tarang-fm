import { describe, expect, it } from 'vitest';
import { AD_PARODIES } from '../pools/ads';
import { adShape, brandMentions } from './ad';
import type { CheckLine } from './story';

const card = (id: string) => AD_PARODIES.find((c) => c.id === id)!;
const line = (role: string, text: string, delivery = 'normal'): CheckLine => ({ role, text, delivery });

/** The aired "before" ad, worst bits combined: a direction read aloud, a chanted brand, English, umbrellas and garba. */
const BAD: CheckLine[] = [
  line('ad_customer', 'अरे neighbour, बारिश में भी आज उसके pumps से fresh कचौरी निकली, छाता भी नहीं चाहिए!'),
  line('ad_announcer', 'क्या secret है उसका? जल्दी बताओ मुझे।'),
  line('ad_customer', 'उनके shoes हैं PannaPani. delivery: hushed।', 'hushed'),
  line('ad_announcer', 'please do not eat the plastic shoes ever, okay friends.'),
  line('ad_announcer', 'PannaPani garba special, PannaPani! PannaPani!', 'excited'),
];

const GOOD: CheckLine[] = [
  line('ad_announcer', 'बच्चों की पढ़ाई, बेटी की शादी, अपना retirement, सबकी planning ज़रूरी है।', 'warm'),
  line('ad_customer', 'इसीलिए मैंने अपना पूरा Sunday invest कर दिया, रिश्तेदारों के फ़ोन उठाने में।'),
  line('ad_announcer', 'फ़ोन-फ़ंड प्लान। शर्तें लागू: रिश्तेदारी बाज़ार के जोखिमों के अधीन है, कृपया बातें ध्यान से सुनें।', 'fast'),
];

const october = { month: 10, festive: false };

describe('ad shape', () => {
  it('sends back the aired "before" ad for every reason it failed', () => {
    const { hard } = adShape('hi', BAD, { card: card('teleshopping'), brand: 'PannaPani', ...october });
    const has = (s: string) => hard.some((p) => p.includes(s));
    expect(has('stage direction')).toBe(true);
    expect(has('brand is said')).toBe(true);
    expect(has('full English sentence')).toBe(true);
    expect(has('out of season')).toBe(true);
    expect(has('No festival')).toBe(true);
    expect(has('fine-print')).toBe(true);
  });

  it('passes a clean 3-line disclaimer parody with its fast fine print', () => {
    const result = adShape('hi', GOOD, { card: card('mf_disclaimer'), brand: 'फ़ोन-फ़ंड प्लान', punchline: 'रिश्तेदारी बाज़ार के जोखिमों के अधीन है', ...october });
    expect(result.hard).toEqual([]);
    expect(result.soft).toEqual([]);
  });

  it('needs the fine print when the format calls for it', () => {
    const noTnc = [...GOOD.slice(0, 2), line('ad_announcer', 'फ़ोन-फ़ंड प्लान, अब हर Sunday आपका।')];
    expect(adShape('hi', noTnc, { card: card('mf_disclaimer'), brand: 'फ़ोन-फ़ंड प्लान', ...october }).hard.some((p) => p.includes('fine-print'))).toBe(true);
    expect(adShape('hi', noTnc, { card: card('cooker_whistle'), brand: 'फ़ोन-फ़ंड प्लान', ...october }).hard).toEqual([]);
  });

  it('allows rain in the rains, and a festival when code allows one', () => {
    const rainy = [line('ad_customer', 'बारिश में हर रोज़ भीगे मोज़े, अब और नहीं।', 'sad'), ...GOOD.slice(1)];
    expect(adShape('hi', rainy, { card: card('mf_disclaimer'), brand: 'फ़ोन-फ़ंड प्लान', month: 8, festive: false }).hard).toEqual([]);
    expect(adShape('ta', [line('ad_customer', 'மழை வந்தா ஒரு auto கூட வராது.', 'sad'), line('ad_announcer', 'அதுக்கு தான் Auto-அழைப்பு app, ஒரு click போதும்.'), line('ad_announcer', 'T&C apply: auto வர மழை நிக்கணும்.', 'fast')], { card: card('teleshopping'), brand: 'Auto-அழைப்பு', month: 10, festive: false }).hard.some((p) => p.includes('out of season'))).toBe(false);
    const festive = [line('ad_customer', 'Navratri में गरबा के बाद पैरों का बुरा हाल।', 'sad'), ...GOOD.slice(1)];
    expect(adShape('hi', festive, { card: card('mf_disclaimer'), brand: 'फ़ोन-फ़ंड प्लान', month: 10, festive: true }).hard).toEqual([]);
  });

  it('rejects a line that is only the brand, and too many lines', () => {
    const chant = [...GOOD, line('ad_announcer', 'फ़ोन-फ़ंड!', 'excited')];
    expect(adShape('hi', chant, { card: card('mf_disclaimer'), brand: 'फ़ोन-फ़ंड प्लान', ...october }).hard.some((p) => p.includes('only the brand'))).toBe(true);
    const long = [...GOOD, ...GOOD, GOOD[0]];
    expect(adShape('hi', long, { card: card('mf_disclaimer'), brand: 'फ़ोन-फ़ंड प्लान', ...october }).hard.some((p) => p.startsWith('Too long'))).toBe(true);
  });

  it('counts brand mentions by the first word, inflected or not', () => {
    expect(brandMentions(GOOD, 'फ़ोन-फ़ंड प्लान')).toBe(2);
    expect(brandMentions(BAD, 'PannaPani')).toBe(4);
    expect(brandMentions(GOOD, '')).toBe(0);
  });
});
