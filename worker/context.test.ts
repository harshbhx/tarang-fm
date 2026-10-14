import { describe, expect, it } from 'vitest';
import { isGrim, parseRss } from './context';

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
