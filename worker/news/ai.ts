/** Workers AI for the newsroom: tagging (bucket, state, city, light, death, opinion, clickbait, grim) and embeddings. */
import type { Bucket } from './types';

/** Small, fast multilingual model for batch tagging; the second is the fallback. */
export const TAG_MODELS = ['@cf/google/gemma-4-26b-a4b-it', '@cf/meta/llama-3.1-8b-instruct-fp8'] as const;
export const EMBED_MODEL = '@cf/baai/bge-m3';
export const EMBED_DIMENSIONS = 1024;

const BUCKETS: Bucket[] = ['national', 'world', 'state', 'city', 'sports', 'business', 'entertainment', 'science', 'kicker'];

export interface TagInput {
  i: number;
  feedBucket: Bucket;
  title: string;
  descr: string;
}

export interface Tag {
  i: number;
  bucket?: Bucket;
  state?: string;
  city?: string;
  light: boolean;
  death: boolean;
  opinion: boolean;
  clickbait: boolean;
  grim: boolean;
}

const TAG_SYSTEM = `You tag Indian-language news items for a radio newsroom. Items are in Hindi, Marathi, Tamil, Bengali, Gujarati or English.
For every item return:
- bucket: one of national (Indian national news), world (outside India, including Bangladesh and Pakistan), state (one Indian state's news), city (one city's local news), sports, business, entertainment, science (science, space, technology, health research), kicker (a light, positive human-interest story).
- state: the two-letter Indian state code (GJ, MH, TN, WB, DL, UP, RJ, MP, BR, KA, KL, TG, AP, PB, HR, AS, OR, JH, CT, HP, UT, GA, JK) when the story mainly happens in one state, else "".
- city: the English name of the Indian city where it happens, else "".
- light: true only for an uplifting or curious story fit to end a bulletin on a smile (no deaths, crime, disaster or politics).
- death: true if anyone died or was killed, or it is an accident or disaster.
- opinion: true if the headline is mainly a quote or an accusation by a politician.
- clickbait: true if it teases instead of telling (hides the fact to make you click), or is an advert, horoscope, quiz or gallery.
- grim: true for murder, rape or sexual violence, suicide, or descriptions of bodies.
Answer only with JSON: {"items":[{"i":0,"bucket":"national","state":"","city":"","light":false,"death":false,"opinion":false,"clickbait":false,"grim":false}, ...]} with one entry per item, same i.`;

const TAG_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          i: { type: 'integer' },
          bucket: { type: 'string', enum: BUCKETS },
          state: { type: 'string' },
          city: { type: 'string' },
          light: { type: 'boolean' },
          death: { type: 'boolean' },
          opinion: { type: 'boolean' },
          clickbait: { type: 'boolean' },
          grim: { type: 'boolean' },
        },
        required: ['i', 'bucket', 'state', 'city', 'light', 'death', 'opinion', 'clickbait', 'grim'],
      },
    },
  },
  required: ['items'],
};

export function tagPrompt(items: TagInput[]): string {
  return items.map((it) => `${it.i}. [feed: ${it.feedBucket}] ${it.title}${it.descr ? ` — ${it.descr.slice(0, 160)}` : ''}`).join('\n');
}

/** The model's text from either response shape (Workers AI native or OpenAI-style). */
function responseText(res: unknown): string | object | undefined {
  const r = res as { response?: unknown; choices?: { message?: { content?: unknown } }[] };
  if (r?.response !== undefined) return r.response as string | object;
  const content = r?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : undefined;
}

/** Lenient JSON: the tags array from an object, a JSON string, or a string with prose around the JSON. */
export function parseTags(raw: string | object | undefined): Tag[] {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return [];
    try {
      value = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  const items = (value as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  const out: Tag[] = [];
  for (const x of items as Record<string, unknown>[]) {
    const i = Number(x?.i);
    if (!Number.isInteger(i)) continue;
    const bucket = BUCKETS.includes(x.bucket as Bucket) ? (x.bucket as Bucket) : undefined;
    const state = typeof x.state === 'string' && /^[A-Z]{2}$/.test(x.state.trim().toUpperCase()) ? x.state.trim().toUpperCase() : undefined;
    const city = typeof x.city === 'string' && x.city.trim() && x.city.length < 40 ? x.city.trim() : undefined;
    out.push({ i, bucket, state, city, light: x.light === true, death: x.death === true, opinion: x.opinion === true, clickbait: x.clickbait === true, grim: x.grim === true });
  }
  return out;
}

/** Tags one batch (≈ 20 items). Falls back to the second model; returns [] when both fail (feed buckets stand). */
export async function tagBatch(ai: Ai, items: TagInput[]): Promise<Tag[]> {
  for (const model of TAG_MODELS) {
    try {
      const res = await (ai as unknown as { run: (m: string, i: unknown) => Promise<unknown> }).run(model, {
        messages: [
          { role: 'system', content: TAG_SYSTEM },
          { role: 'user', content: tagPrompt(items) },
        ],
        response_format: { type: 'json_schema', json_schema: TAG_SCHEMA },
        max_tokens: 160 + items.length * 70,
        temperature: 0,
        ...(model.includes('gemma-4') ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      });
      const tags = parseTags(responseText(res));
      if (tags.length >= Math.ceil(items.length / 2)) return tags;
      console.warn(`[news] ${model} returned ${tags.length}/${items.length} tags`);
    } catch (err) {
      console.error(`[news] tagging with ${model} failed: ${String(err)}`);
    }
  }
  return [];
}

/** bge-m3 embeddings (1024 dimensions), up to 100 texts per call. */
export async function embed(ai: Ai, texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 50) {
    const res = (await (ai as unknown as { run: (m: string, i: unknown) => Promise<unknown> }).run(EMBED_MODEL, {
      text: texts.slice(i, i + 50),
    })) as { data?: number[][] };
    if (!res?.data || res.data.length !== Math.min(50, texts.length - i)) throw new Error('embedding batch came back short');
    out.push(...res.data);
  }
  return out;
}
