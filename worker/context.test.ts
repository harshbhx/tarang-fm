import { describe, expect, it } from 'vitest';
import { STATION_BY_ID } from '../shared/stations';
import { describeWeather, isGrim, localFeedUrl, localFeeds, localNewsCity, mixHeadlines, nationalFeeds, parseRss, unwrapLink } from './context';

const item = (title: string, n: number) =>
  `<item><title>${title} - Daily News</title><link>https://news.example.com/${n}</link><source url="https://x">Daily News</source></item>`;

describe('parseRss', () => {
  it('skips grim stories in every station language and keeps the rest', () => {
    const xml = `<rss><channel>${[
      'नीले ड्रम हत्याकांड में आज फैसला',
      'रेलवे कर्मचारियों को दिवाली बोनस',
      'சென்னையில் கொலை வழக்கு',
      'কলকাতায় নতুন মেট্রো লাইন',
      'Court hears murder appeal',
      'Monsoon reaches Kerala early',
    ]
      .map(item)
      .join('')}</channel></rss>`;
    expect(parseRss(xml, 10).map((s) => s.title)).toEqual([
      'रेलवे कर्मचारियों को दिवाली बोनस',
      'কলকাতায় নতুন মেট্রো লাইন',
      'Monsoon reaches Kerala early',
    ]);
  });

  it('does not flag everyday headlines', () => {
    expect(isGrim('Sensex closes at record high')).toBe(false);
    expect(isGrim('দুর্গা পুজোর প্রস্তুতি শুরু')).toBe(false);
  });
});

const src = (title: string) => ({ title, url: `https://news.example.com/${encodeURIComponent(title)}` });

describe('mixHeadlines', () => {
  it('puts up to two local stories first, marks them, dedupes and caps at four', () => {
    const mixed = mixHeadlines([src('L1'), src('L2'), src('L3')], [src('N1'), src('L1'), src('N2'), src('N3')]);
    expect(mixed.map((h) => [h.title, Boolean(h.local)])).toEqual([
      ['L1', true],
      ['L2', true],
      ['N1', false],
      ['N2', false],
    ]);
  });

  it('falls back to national headlines when there is no local feed', () => {
    expect(mixHeadlines([], [src('N1'), src('N2')]).map((h) => h.title)).toEqual(['N1', 'N2']);
  });
});

describe('local context helpers', () => {
  it('builds a city search feed in the station language', () => {
    expect(localFeedUrl(STATION_BY_ID.ta!, 'Chennai')).toBe('https://news.google.com/rss/search?q=Chennai&hl=ta&gl=IN&ceid=IN:ta');
  });

  it('describes WMO weather codes', () => {
    expect(describeWeather(0)).toBe('clear sky');
    expect(describeWeather(63)).toBe('rain');
    expect(describeWeather(999)).toBe('mild weather');
  });
});

describe('fallback feeds', () => {
  it('reads Bing News items: publisher URL and News:Source', () => {
    const xml =
      '<rss><channel><item><title>वडोदरा में नया फ्लाईओवर खुला</title>' +
      '<link>http://www.bing.com/news/apiclick.aspx?ref=FexRss&amp;url=https%3a%2f%2fwww.example.in%2fstory%2f1&amp;c=1</link>' +
      '<News:Source>Gujarat Samachar</News:Source></item></channel></rss>';
    expect(parseRss(xml)).toEqual([
      { title: 'वडोदरा में नया फ्लाईओवर खुला', url: 'https://www.example.in/story/1', source: 'Gujarat Samachar' },
    ]);
    expect(unwrapLink('https://bbc.com/x')).toBe('https://bbc.com/x');
  });

  it('tries BBC before Google for national news and Bing before Google for city news', () => {
    const hi = STATION_BY_ID.hi!;
    expect(nationalFeeds(hi).map((f) => f.url)).toEqual(['https://feeds.bbci.co.uk/hindi/rss.xml', hi.newsFeedUrl]);
    expect(localFeeds(hi, 'Vadodara')[0].url).toBe('https://www.bing.com/news/search?q=Vadodara&format=rss&setlang=hi-IN&cc=IN');
  });
});

describe('localNewsCity', () => {
  it('searches city news only for listeners in India', () => {
    expect(localNewsCity('Vadodara', 'IN')).toBe('Vadodara');
    expect(localNewsCity(' Pune ', 'in')).toBe('Pune');
    expect(localNewsCity('Columbus', 'US')).toBeUndefined();
    expect(localNewsCity('London', 'GB')).toBeUndefined();
  });

  it('keeps the city when the country is unknown, and ignores a blank city', () => {
    expect(localNewsCity('Jammu', undefined)).toBe('Jammu');
    expect(localNewsCity('  ', 'IN')).toBeUndefined();
    expect(localNewsCity(undefined, 'IN')).toBeUndefined();
  });
});
