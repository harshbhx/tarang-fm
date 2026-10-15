/**
 * Near-duplicate stories: a lexical pre-pass, then bge-m3 embeddings. Thresholds calibrated on 32,131 pairs of real
 * Gujarati items (2026-10-15): unrelated pairs sit at cosine 0.34 (p90 0.43), same-story pairs from different outlets
 * at 0.79-0.97, so 0.80 is one story and 0.70 one topic.
 *
 * Across steps and refreshes, earlier items come from three places, because the vector index answers new vectors
 * only after a lag (seconds to minutes): the index itself, the vectors D1 keeps for the last half hour (exact
 * cosine), and the stored titles (lexical).
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

/** Union-find over cluster or topic ids. A root that already exists in the pool wins over a new one. */
class Merger {
  private parent = new Map<string, string>();
  constructor(private existing: Set<string>) {}
  find(id: string): string {
    let root = id;
    while (this.parent.has(root)) root = this.parent.get(root)!;
    // Path compression
    for (let x = id; x !== root; ) {
      const next = this.parent.get(x)!;
      this.parent.set(x, root);
      x = next;
    }
    return root;
  }
  /** Joins b into a (or a into b when only b is already in the pool). Returns the root. */
  union(a: string, b: string): string {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return ra;
    if (!this.existing.has(ra) && this.existing.has(rb)) [ra, rb] = [rb, ra];
    this.parent.set(rb, ra);
    return ra;
  }
  /** Every id that now points somewhere else, with its root. */
  moved(): Map<string, string> {
    const out = new Map<string, string>();
    for (const id of this.parent.keys()) out.set(id, this.find(id));
    return out;
  }
}

export interface BatchClusters {
  /** Cluster and topic of each new item */
  assigned: Map<string, Assignment>;
  /** Existing clusters (and topics) that turned out to be one story: old id → id it now belongs to */
  mergedClusters: Map<string, string>;
  mergedTopics: Map<string, string>;
}

/**
 * Greedy single pass over new items (best first). An item that is the same story as one or more earlier items or
 * existing stories joins the best of them, and the stories it bridges become one (single-link: if A and C are both
 * the same story as B, A and C are one story, even when A and C alone fall under the threshold). Failing that it
 * takes the topic of the closest one on the same topic; otherwise it starts its own cluster and topic. Existing
 * neighbours come from earlier steps and refreshes (vector index, recent vectors, stored titles).
 */
export function clusterBatch(items: DedupeInput[], existing: Map<string, Neighbour[]> = new Map()): BatchClusters {
  const known = new Set<string>();
  const knownTopics = new Set<string>();
  for (const list of existing.values()) for (const n of list) {
    known.add(n.clusterId);
    knownTopics.add(n.topicId);
  }
  const clusters = new Merger(known);
  const topics = new Merger(knownTopics);
  const raw = new Map<string, Assignment>();
  const placed: (DedupeInput & { toks: Set<string> })[] = [];
  for (const item of items) {
    const it = { ...item, toks: new Set(tokens(item.title)) };
    const stories: { a: Assignment; score: number }[] = [];
    let topic: string | undefined;
    let bestTopic = 0;
    const consider = (a: Assignment, score: number) => {
      const rel = relation(score);
      if (rel === 'story') stories.push({ a, score });
      else if (rel === 'topic' && score > bestTopic) {
        bestTopic = score;
        topic = a.topicId;
      }
    };
    for (const n of existing.get(it.id) ?? []) {
      consider({ clusterId: n.clusterId, topicId: n.topicId }, n.title ? combined(n.score, tokenSimilarity(new Set(tokens(n.title)), it.toks)) : n.score);
    }
    for (const p of placed) {
      const lex = tokenSimilarity(p.toks, it.toks);
      const cos = it.vector && p.vector ? cosine(it.vector, p.vector) : 0;
      consider(raw.get(p.id)!, combined(cos, lex));
    }
    if (stories.length) {
      stories.sort((x, y) => y.score - x.score);
      let cluster = clusters.find(stories[0].a.clusterId);
      let top = topics.find(stories[0].a.topicId);
      for (const { a } of stories.slice(1)) {
        cluster = clusters.union(cluster, a.clusterId);
        top = topics.union(top, a.topicId);
      }
      raw.set(it.id, { clusterId: cluster, topicId: top });
    } else {
      raw.set(it.id, { clusterId: it.id, topicId: topic ? topics.find(topic) : it.id });
    }
    placed.push(it);
  }
  const assigned = new Map<string, Assignment>();
  for (const [id, a] of raw) assigned.set(id, { clusterId: clusters.find(a.clusterId), topicId: topics.find(a.topicId) });
  const pick = (m: Map<string, string>, keep: Set<string>) => new Map([...m].filter(([id, root]) => keep.has(id) && id !== root));
  return { assigned, mergedClusters: pick(clusters.moved(), known), mergedTopics: pick(topics.moved(), knownTopics) };
}

/** The cluster and topic of each new item (see clusterBatch). */
export function assignClusters(items: DedupeInput[], existing: Map<string, Neighbour[]> = new Map()): Map<string, Assignment> {
  return clusterBatch(items, existing).assigned;
}

/** int8 quantized unit vector as base64 (1 KB for bge-m3): enough precision for the 0.70 / 0.80 thresholds. */
export function packVector(v: ArrayLike<number>): string {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  const bytes = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) bytes[i] = Math.max(-127, Math.min(127, Math.round((v[i] / norm) * 127))) & 0xff;
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function unpackVector(b64: string): Int8Array {
  const s = atob(b64);
  const out = new Int8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = (s.charCodeAt(i) << 24) >> 24;
  return out;
}
