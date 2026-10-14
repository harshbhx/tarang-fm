/** Listener context: Cloudflare geolocation plus news headlines. See docs/TECH-SPEC.md §10. */
import { SourceSchema } from '../shared/schemas';
import type { ContextResponse, Source, Station } from '../shared/types';

const NEWS_TTL_S = 30 * 60;
const NEWS_LIMIT = 4;

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
    if (seen.has(title) || isGrim(title)) continue;

    const parsed = SourceSchema.safeParse({ title: title.slice(0, 300), url, source: source?.slice(0, 120) || undefined });
    if (!parsed.success) continue;
    seen.add(title);
    out.push(parsed.data);
    if (out.length >= limit) break;
  }
  return out;
}

async function fetchFeed(station: Station): Promise<Source[]> {
  const res = await fetch(station.newsFeedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TarangFM/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`news feed ${res.status}`);
  return parseRss(await res.text());
}

/** Top headlines for a station, cached for 30 minutes. Never throws. */
export async function getHeadlines(station: Station, origin: string, waitUntil?: (p: Promise<unknown>) => void): Promise<Source[]> {
  const hit = memory.get(station.id);
  if (hit && Date.now() - hit.at < NEWS_TTL_S * 1000) return hit.headlines;

  const cacheKey = new Request(`${origin}/__cache/news/${station.id}`);
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined;
  try {
    const cached = await cache?.match(cacheKey);
    if (cached) {
      const headlines = (await cached.json()) as Source[];
      memory.set(station.id, { at: Date.now(), headlines });
      return headlines;
    }
  } catch (err) {
    console.error(`[context] cache read failed: ${String(err)}`);
  }

  try {
    const headlines = await fetchFeed(station);
    if (headlines.length) {
      memory.set(station.id, { at: Date.now(), headlines });
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
    console.error(`[context] ${station.id} headlines failed: ${String(err)}`);
    return hit?.headlines ?? [];
  }
}

export async function getContext(
  request: Request,
  station: Station,
  waitUntil?: (p: Promise<unknown>) => void,
): Promise<ContextResponse> {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const headlines = await getHeadlines(station, new URL(request.url).origin, waitUntil).catch(() => []);
  return {
    city: cf?.city || undefined,
    region: cf?.region || undefined,
    country: cf?.country || undefined,
    timezone: cf?.timezone || undefined,
    headlines,
  };
}
