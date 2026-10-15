/**
 * Near-duplicate stories: a lexical pre-pass, then bge-m3 embeddings. Thresholds calibrated on 32,131 pairs of real
 * Gujarati items (2026-10-15): unrelated pairs sit at cosine 0.34 (p90 0.43), same-story pairs from different outlets
 * at 0.79-0.97, so 0.80 is one story and 0.70 one topic.
 */

/** Cosine at or above which two items are the same story (one cluster). */
export const SAME_STORY = 0.8;
/** Cosine at or above which two stories share a topic (aired at most once per bulletin, 60 min cooldown). */
export const SAME_TOPIC = 0.7;
/** Lexical similarity at or above which two titles are always the same story. */
export const LEXICAL_MERGE = 0.45;
/** Lexical similarity that, with a cosine of at least 0.72, also makes one story. */
export const LEXICAL_SUPPORT = 0.36;
const SUPPORTED_STORY = 0.72;

const STOP = new Set(
  'के की का में से ने को और पर है हैं था थे थी एक यह ये वह इस उस लिए भी तो ही जा गया गई किया कहा बोले आहे आणि या ही हे च्या मध्ये ला ने तर व नाही आज அவர் இந்த ஒரு மற்றும் என்று இது அந்த உள்ள மீது பற்றி এই এবং থেকে করে হয় না এক ও যে কে র ছে આ અને છે ના ની નો માં થી પર એ the a an of to in on for and is are was with by at from as'.split(
    ' ',
  ),
);

export function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/['"‘’“”`!?,.:;()[\]{}|—–\-।॥…]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Sorted unique content tokens: the exact-repeat key. */
export function titleKey(title: string): string {
  return [...new Set(tokens(title))].sort().join(' ');
}

export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** max(Jaccard, 0.85 × containment) over content tokens. */
export function similarity(a: string, b: string): number {
  return tokenSimilarity(new Set(tokens(a)), new Set(tokens(b)));
}

export function tokenSimilarity(A: Set<string>, B: Set<string>): number {
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return Math.max(inter / (A.size + B.size - inter), (inter / Math.min(A.size, B.size)) * 0.85);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export type Relation = 'story' | 'topic' | 'none';

export function relation(score: number): Relation {
  return score >= SAME_STORY ? 'story' : score >= SAME_TOPIC ? 'topic' : 'none';
}

export interface DedupeInput {
  id: string;
  title: string;
  /** Embedding, when available */
  vector?: ArrayLike<number>;
}

export interface Neighbour {
  /** The existing item's cluster and topic */
  clusterId: string;
  topicId: string;
  score: number;
  /** Its title, when the index stored one (lexical support) */
  title?: string;
}

/** Cosine adjusted by lexical overlap: a strong word match is the same story whatever the embedding says. */
export function combined(cos: number, lex: number): number {
  if (lex >= LEXICAL_MERGE) return Math.max(cos, SAME_STORY);
  if (lex >= LEXICAL_SUPPORT && cos >= SUPPORTED_STORY) return Math.max(cos, SAME_STORY);
  return cos;
}

export interface Assignment {
  clusterId: string;
  topicId: string;
}

/**
 * Greedy single pass over new items (best first): an item joins the first earlier new item, or the best existing
 * neighbour, that is the same story; failing that it takes the topic of the first one on the same topic; otherwise
 * it starts its own cluster and topic. Existing neighbours come from Vectorize (earlier refreshes).
 */
export function assignClusters(items: DedupeInput[], existing: Map<string, Neighbour[]> = new Map()): Map<string, Assignment> {
  const out = new Map<string, Assignment>();
  const placed: (DedupeInput & { toks: Set<string> })[] = [];
  for (const item of items) {
    const it = { ...item, toks: new Set(tokens(item.title)) };
    let story: Assignment | undefined;
    let topic: string | undefined;
    let bestStory = 0;
    let bestTopic = 0;
    for (const n of existing.get(it.id) ?? []) {
      const score = n.title ? combined(n.score, tokenSimilarity(new Set(tokens(n.title)), it.toks)) : n.score;
      const rel = relation(score);
      if (rel === 'story' && score > bestStory) {
        bestStory = score;
        story = { clusterId: n.clusterId, topicId: n.topicId };
      } else if (rel !== 'none' && score > bestTopic) {
        bestTopic = score;
        topic = n.topicId;
      }
    }
    for (const p of placed) {
      if (story && bestStory >= 0.95) break;
      const lex = tokenSimilarity(p.toks, it.toks);
      const cos = it.vector && p.vector ? cosine(it.vector, p.vector) : 0;
      const score = combined(cos, lex);
      const rel = relation(score);
      const a = out.get(p.id)!;
      if (rel === 'story' && score > bestStory) {
        bestStory = score;
        story = a;
      } else if (rel === 'topic' && score > bestTopic) {
        bestTopic = score;
        topic = a.topicId;
      }
    }
    out.set(it.id, story ?? { clusterId: it.id, topicId: topic ?? it.id });
    placed.push(it);
  }
  return out;
}
