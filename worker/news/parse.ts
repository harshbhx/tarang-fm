/** Feed parsing: RSS 2.0, Atom and RDF, with Bing link unwrapping, date clamping and SEO-prefix stripping. */
import type { RawItem } from './types';

/** Never send application/rss+xml: Live Hindustan answers it with an empty 200. A UA is required by some hosts. */
export const FEED_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; TarangFM/1.0)', Accept: '*/*' } as const;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;

function entity(match: string, e: string): string {
  if (e[0] === '#') {
    const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : match;
  }
  return ENTITIES[e.toLowerCase()] ?? match;
}

/** CDATA, entities (some feeds double-encode), tags and whitespace. */
export function decode(text = ''): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(ENTITY, entity)
    .replace(/<[^>]+>/g, ' ')
    .replace(ENTITY, entity)
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : undefined;
}

/** RFC 822 / ISO dates, with "IST" understood. NaN when unparseable. */
export function parseDate(s: string | undefined): number {
  if (!s) return NaN;
  const t = s.trim().replace(/\bIST\b/, '+0530');
  let d = Date.parse(t);
  if (Number.isNaN(d)) d = Date.parse(t.replace(/^[A-Za-z]+,\s*/, ''));
  return d;
}

/** Bing News links go through a click tracker; keep the publisher's URL. */
export function unwrapBing(link: string | undefined): string | undefined {
  if (!link || !link.includes('bing.com/news/apiclick')) return link;
  try {
    return new URL(link).searchParams.get('url') ?? link;
  } catch {
    return link;
  }
}

/** "Railway Bonus :रेल्वे…" / "IND vs WI 4th T20: …": TTS would read the SEO keyword aloud. */
export function stripSeoPrefix(title: string): string {
  const m = /^([A-Za-z0-9 .,&'’\-|/]{2,45})\s*[:|]\s*(.+)$/.exec(title);
  if (m && m[2].length >= 25 && !/[ऀ-෿]/.test(m[1])) return m[2].trim();
  return title;
}

const DESCR_MAX = 300;

/** Every item in a feed body (RSS, RDF or Atom). Titles and descriptions are decoded; descriptions cut to 300 chars. */
export function parseFeed(body: string): RawItem[] {
  const head = body.slice(0, 3000);
  const atom = /<feed[\s>]/i.test(head) && !/<rss[\s>]/i.test(head);
  const re = atom ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi : /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  const out: RawItem[] = [];
  for (const [, b] of body.matchAll(re)) {
    const link = unwrapBing(tag(b, 'link') || /<link[^>]*href=["']([^"']+)/i.exec(b)?.[1] || tag(b, 'guid'));
    const title = tag(b, 'title') ?? '';
    if (!title || !link || !/^https?:\/\//i.test(link)) continue;
    let descr = tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content:encoded') ?? '';
    // Some feeds repeat the title as the description
    if (descr === title) descr = '';
    out.push({
      title,
      descr: descr.length > DESCR_MAX ? `${descr.slice(0, DESCR_MAX).replace(/\s+\S*$/u, '')}…` : descr,
      url: link,
      publishedAt: parseDate(tag(b, 'pubDate') ?? tag(b, 'dc:date') ?? tag(b, 'published') ?? tag(b, 'updated')),
      sourceName: tag(b, 'News:Source') ?? undefined,
    });
  }
  return out;
}

/** min(pubDate, now); the fetch time when the feed has no date (Amar Ujala runs about 8 h ahead). */
export function clampDate(publishedAt: number, now: number): number {
  return Number.isFinite(publishedAt) ? Math.min(publishedAt, now) : now;
}

/** Strips tracking parameters so the same article from two feeds gets one id. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref$|fbclid|gclid|ito$|src$)/i.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return `${u.host.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
