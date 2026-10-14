/** Listener context: Cloudflare geolocation plus news headlines. See docs/TECH-SPEC.md §10. */
import { SourceSchema } from '../shared/schemas';
import type { ContextResponse, Source, Station, Weather } from '../shared/types';

const NEWS_TTL_S = 30 * 60;
const NEWS_LIMIT = 4;
const LOCAL_LIMIT = 2;
const WEATHER_TTL_S = 15 * 60;

/** Per-isolate cache; the Cache API is a no-op on workers.dev, so this keeps feeds warm there too. */
const memory = new Map<string, { at: number; headlines: Source[] }>();

/** Grim stories (murder, sexual violence, suicide, bodies) make poor light radio; skip them in every station language. */
const GRIM =
  /murder|rape|suicide|dead body|beheaded|lynch|हत्या|हत्याकांड|मर्डर|बलात्कार|रेप|आत्महत्या|लाश|शव|कत्ल|கொலை|தற்கொலை|பாலியல் வன்|சடலம்|খুন|হত্যা|ধর্ষণ|আত্মহত্যা|মৃতদেহ/i;

export function isGrim(title: string): boolean {
  return GRIM.test(title);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeXml(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === '#') {
        const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(xml: string, name: string): string | undefined {
  const m = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml);
  return m ? decodeXml(m[1]) : undefined;
}

/** Parses Google News RSS items into sources, moving the " - Source" title suffix into `source`. */
export function parseRss(xml: string, limit = NEWS_LIMIT): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    let title = tag(item, 'title');
    const url = tag(item, 'link');
    let source = tag(item, 'source');
    if (!title || !url) continue;

    if (source && title.endsWith(` - ${source}`)) {
      title = title.slice(0, -(source.length + 3)).trim();
    } else {
      const cut = title.lastIndexOf(' - ');
      if (cut > 0 && title.length - cut <= 63) {
        source ??= title.slice(cut + 3).trim();
        title = title.slice(0, cut).trim();
      }
    }
    title = title.replace(/^(?:video|photos?|live|watch)\s*:\s*/i, '');
    if (!title || seen.has(title) || isGrim(title)) continue;

    const parsed = SourceSchema.safeParse({ title: title.slice(0, 300), url, source: source?.slice(0, 120) || undefined });
    if (!parsed.success) continue;
    seen.add(title);
    out.push(parsed.data);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchFeed(url: string): Promise<Source[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarangFM/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`news feed ${res.status}`);
  return parseRss(await res.text(), NEWS_LIMIT * 2);
}

/** Google News search feed for the listener's city, in the station language. */
export function localFeedUrl(station: Station, city: string): string {
  const hl = new URL(station.newsFeedUrl).searchParams.get('hl') ?? 'en';
  return `https://news.google.com/rss/search?q=${encodeURIComponent(city)}&hl=${hl}&gl=IN&ceid=IN:${hl}`;
}

/** One feed, cached for 30 minutes (per isolate, plus the Cache API where it works). Never throws. */
async function cachedFeed(key: string, url: string, origin: string, waitUntil?: (p: Promise<unknown>) => void): Promise<Source[]> {
  const hit = memory.get(key);
  if (hit && Date.now() - hit.at < NEWS_TTL_S * 1000) return hit.headlines;

  const cacheKey = new Request(`${origin}/__cache/news/${encodeURIComponent(key)}`);
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  try {
    const cached = await cache?.match(cacheKey);
    if (cached) {
      const headlines = (await cached.json()) as Source[];
      memory.set(key, { at: Date.now(), headlines });
      return headlines;
    }
  } catch (err) {
    console.error(`[context] cache read failed: ${String(err)}`);
  }

  try {
    const headlines = await fetchFeed(url);
    if (headlines.length) {
      memory.set(key, { at: Date.now(), headlines });
      if (cache) {
        const put = cache
          .put(
            cacheKey,
            new Response(JSON.stringify(headlines), {
              headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${NEWS_TTL_S}` },
            }),
          )
          .catch((err: unknown) => console.error(`[context] cache write failed: ${String(err)}`));
        if (waitUntil) waitUntil(put);
        else await put;
      }
    }
    return headlines;
  } catch (err) {
    console.error(`[context] ${key} headlines failed: ${String(err)}`);
    return hit?.headlines ?? [];
  }
}

/** Up to LOCAL_LIMIT stories from the listener's city, then national headlines, NEWS_LIMIT in total. */
export function mixHeadlines(local: Source[], national: Source[]): Source[] {
  const out: Source[] = [];
  const seen = new Set<string>();
  for (const h of local.filter((x) => !isGrim(x.title)).slice(0, LOCAL_LIMIT)) {
    if (seen.has(h.title)) continue;
    seen.add(h.title);
    out.push({ ...h, local: true });
  }
  for (const h of national) {
    if (out.length >= NEWS_LIMIT) break;
    if (seen.has(h.title) || isGrim(h.title)) continue;
    seen.add(h.title);
    out.push(h);
  }
  return out;
}

/** Headlines for a station: local stories for the listener's city first, then national. Never throws. */
export async function getHeadlines(
  station: Station,
  origin: string,
  waitUntil?: (p: Promise<unknown>) => void,
  city?: string,
): Promise<Source[]> {
  const place = city?.trim();
  const [national, local] = await Promise.all([
    cachedFeed(station.id, station.newsFeedUrl, origin, waitUntil),
    place ? cachedFeed(`${station.id}:${place.toLowerCase()}`, localFeedUrl(station, place), origin, waitUntil) : Promise.resolve([]),
  ]);
  return mixHeadlines(local, national);
}

const WMO: [number[], string][] = [
  [[0], 'clear sky'],
  [[1, 2], 'partly cloudy'],
  [[3], 'overcast'],
  [[45, 48], 'foggy'],
  [[51, 53, 55, 56, 57], 'drizzle'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'rain'],
  [[71, 73, 75, 77, 85, 86], 'snow'],
  [[95, 96, 99], 'thunderstorm'],
];

export function describeWeather(code: number): string {
  return WMO.find(([codes]) => codes.includes(code))?.[1] ?? 'mild weather';
}

const weatherMemory = new Map<string, { at: number; weather: Weather }>();

/** Current weather from Open-Meteo for the listener's coordinates, cached 15 minutes. Never throws. */
export async function getWeather(latitude?: string, longitude?: string): Promise<Weather | undefined> {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;
  const key = `${lat.toFixed(1)},${lon.toFixed(1)}`;
  const hit = weatherMemory.get(key);
  if (hit && Date.now() - hit.at < WEATHER_TTL_S * 1000) return hit.weather;
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&current=temperature_2m,weather_code`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) throw new Error(`weather ${res.status}`);
    const data = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    const temp = data.current?.temperature_2m;
    if (typeof temp !== 'number') return hit?.weather;
    const weather: Weather = { tempC: Math.round(temp), description: describeWeather(data.current?.weather_code ?? -1) };
    weatherMemory.set(key, { at: Date.now(), weather });
    return weather;
  } catch (err) {
    console.error(`[context] weather failed: ${String(err)}`);
    return hit?.weather;
  }
}

export async function getContext(
  request: Request,
  station: Station,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<ContextResponse> {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const city = cf?.city || undefined;
  const [headlines, weather] = await Promise.all([
    getHeadlines(station, new URL(request.url).origin, waitUntil, city).catch(() => []),
    getWeather(cf?.latitude, cf?.longitude),
  ]);
  return {
    city,
    region: cf?.region || undefined,
    country: cf?.country || undefined,
    timezone: cf?.timezone || undefined,
    headlines,
    weather,
  };
}
