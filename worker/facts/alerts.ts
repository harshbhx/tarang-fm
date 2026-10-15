/**
 * Official alerts from NDMA SACHET, India's Common Alerting Protocol feed (IMD nowcasts and warnings, SDMA and CWC
 * alerts; public domain, no key). An alert reaches a listener only when its text names the listener's city or
 * district as a whole word, no other state is named without theirs, and it is still inside its validity window.
 */
import type { Fact, FactLang } from './types';
import { HOUR_MS, MINUTE_MS, TtlCache, cached, fetchWithTimeout } from './util';

export interface Alert {
  title: string;
  /** e.g. 'IMD Chennai', 'Punjab SDMA' */
  issuer: string;
  /** Epoch ms */
  issuedAt: number;
  /** Epoch ms: issuedAt plus the window the alert names ("next 3 hours"), or 6 hours when it names none */
  expiresAt: number;
}

/** States whose own SACHET feed exists (multi-word states 404, so they use the national feed). */
const STATE_FEEDS: Record<string, string> = {
  Gujarat: 'gujarat',
  Maharashtra: 'maharashtra',
  Delhi: 'delhi',
  Karnataka: 'karnataka',
  Kerala: 'kerala',
  Rajasthan: 'rajasthan',
  Punjab: 'punjab',
};

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh',
  'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh', 'Andaman and Nicobar',
];

/** cf.region spellings to the state names used here ('National Capital Territory of Delhi' → 'Delhi'). */
export function normalizeState(region?: string): string | undefined {
  const r = region?.trim();
  if (!r) return undefined;
  if (/delhi/i.test(r)) return 'Delhi';
  if (/orissa/i.test(r)) return 'Odisha';
  return STATES.find((s) => s.toLowerCase() === r.toLowerCase()) ?? r;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (s: string) => new RegExp(`(^|[^A-Za-z])${escapeRe(s)}([^A-Za-z]|$)`, 'i');

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (xml: string, name: string) => {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decode(m[1]) : undefined;
};

/** RSS dates are RFC 822, sometimes with "IST" or no zone at all (both mean IST). */
function parseDate(text: string | undefined): number {
  if (!text) return NaN;
  const t = text.replace(/\bIST\b/, '+0530');
  const direct = Date.parse(/[+-]\d{4}|GMT|UTC|Z$/.test(t) ? t : `${t} +0530`);
  return Number.isFinite(direct) ? direct : Date.parse(t);
}

/** The validity the alert text names: "next 3 hours", "next 24 hours", "next 2 days"; 6 hours when it names none. */
export function validityMs(title: string): number {
  const h = /next\s+(\d{1,3})\s*(?:hours?|hrs?)/i.exec(title);
  if (h) return Math.min(Number(h[1]), 48) * HOUR_MS;
  const d = /next\s+(\d)\s*days?/i.exec(title);
  if (d) return Math.min(Number(d[1]) * 24, 48) * HOUR_MS;
  return 6 * HOUR_MS;
}

export function parseSachet(xml: string): Alert[] {
  const out: Alert[] = [];
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = tag(item, 'title');
    const issuedAt = parseDate(tag(item, 'pubDate'));
    if (!title || !Number.isFinite(issuedAt)) continue;
    const author = tag(item, 'author') ?? '';
    const issuer = (/\(([^)]+)\)/.exec(author)?.[1] ?? author).trim() || 'NDMA SACHET';
    out.push({ title: title.slice(0, 600), issuer: issuer.slice(0, 80), issuedAt, expiresAt: issuedAt + validityMs(title) });
  }
  return out;
}

export interface AlertPlace {
  /** English names an alert may use for the listener's city or district */
  names: string[];
  /** Normalised state, when known */
  state?: string;
}

/** True when the alert is about this place: names it as a word, and names no other state without the listener's. */
export function alertMatches(alert: Alert, place: AlertPlace): boolean {
  const text = alert.title;
  if (!place.names.some((n) => n.length >= 3 && wordRe(n).test(text))) return false;
  const statesNamed = STATES.filter((s) => wordRe(s).test(`${text} ${alert.issuer}`));
  if (!statesNamed.length) return true;
  return !!place.state && statesNamed.includes(place.state);
}

const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Fresh, matching alerts, newest first, at most two. An issuer re-sends the same warning as updates ("Moderate rain…",
 * then "Light to moderate rain…"), so only the newest alert per issuer is kept.
 */
export function alertsFor(alerts: Alert[], place: AlertPlace, now: number): Alert[] {
  const seen = new Set<string>();
  return alerts
    .filter((a) => a.issuedAt <= now + 10 * MINUTE_MS && a.expiresAt > now && alertMatches(a, place))
    .sort((a, b) => b.issuedAt - a.issuedAt)
    .filter((a) => {
      const keys = [`t:${norm(a.title)}`, `i:${a.issuer.toLowerCase()}`];
      if (keys.some((k) => seen.has(k))) return false;
      keys.forEach((k) => seen.add(k));
      return true;
    })
    .slice(0, 2);
}

const feedCache = new TtlCache<Alert[]>(10 * MINUTE_MS, 20 * MINUTE_MS, 50);

export function feedSlug(state?: string): string {
  return (state && STATE_FEEDS[state]) ?? 'india';
}

/** Parsed SACHET items for the state's feed (or the national one), cached 10 minutes. Never throws. */
export async function getAlerts(state: string | undefined, now: number): Promise<Alert[] | undefined> {
  const slug = feedSlug(state);
  return cached(
    feedCache,
    slug,
    now,
    async () => {
      const res = await fetchWithTimeout(`https://sachet.ndma.gov.in/cap_public_website/rss/rss_${slug}.xml`, 'application/rss+xml, application/xml, text/xml');
      return parseSachet(await res.text());
    },
    'alerts',
  );
}

export function clearAlertCache(): void {
  feedCache.clear();
}

/** FNV-1a, for short stable ids. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const IMD_CREDIT: Record<FactLang, string> = {
  hi: 'मौसम विभाग के मुताबिक',
  mr: 'हवामान विभागाच्या माहितीनुसार',
  ta: 'வானிலை ஆய்வு மையத்தின் தகவல்படி',
  bn: 'আবহাওয়া দপ্তরের তথ্য অনুযায়ী',
  gu: 'હવામાન વિભાગના જણાવ્યા મુજબ',
};

export function alertFact(alert: Alert, cityNative?: Partial<Record<FactLang, string>>): Fact {
  const numbers = [...new Set(alert.title.match(/\d+(?:\.\d+)?/g) ?? [])];
  const imd = /\bIMD\b|meteorolog/i.test(alert.issuer);
  const native = cityNative ? Object.fromEntries(Object.entries(cityNative).map(([k, v]) => [k, [v]])) : undefined;
  return {
    id: `alert:${hash(norm(alert.title))}`,
    type: 'alert',
    priority: 100,
    claimEn: `${alert.issuer} alert: ${alert.title}`,
    keptTokens: [],
    ...(native ? { keptNative: native as Partial<Record<FactLang, string[]>> } : {}),
    ...(numbers.length ? { allowedTokens: numbers } : {}),
    hedge: `Official alert: credit the issuer (${alert.issuer})${imd ? ' as the weather department' : ''}, keep a calm tone, add one safety line, and add no place, time or number that is not in the alert.`,
    ...(imd ? { hedgeNative: IMD_CREDIT } : {}),
    angleEn: 'An official warning for your area: one calm, practical line (stay indoors, keep away from trees and poles, check before travelling).',
    expiresAt: alert.expiresAt,
    source: `${alert.issuer} via NDMA SACHET`,
  };
}
