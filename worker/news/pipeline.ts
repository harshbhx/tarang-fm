/** Refresh pipeline steps: fetch → normalize + prefilter → store; tag; embed + dedupe; expire + bookkeeping. */
import { embed, tagBatch, type Tag, type TagInput } from './ai';
import { cityKeyOf, publisherFromBing, spokenPublisher } from './catalog';
import { assignClusters, fnv1a, LEXICAL_SUPPORT, titleKey, tokens, tokenSimilarity, type Neighbour } from './dedupe';
import { prefilter } from './filters';
import { canonicalUrl, clampDate, FEED_HEADERS, parseFeed, stripSeoPrefix } from './parse';
import {
  applyClusters,
  applyTags,
  countPending,
  embeddedTitles,
  existingIds,
  expire,
  insertItems,
  saveFeedResults,
  untagged,
  unembedded,
  type FeedResult,
  type PendingRow,
  type TagUpdate,
} from './store';
import type { Bucket, FeedSource, NewsStation, PoolItem } from './types';

const HOUR = 3_600_000;
/** Items live 24 h; city items 36 h and light kickers 48 h (thin supply). */
export const EXPIRY_H: Partial<Record<Bucket | 'light', number>> & { default: number } = { default: 24, city: 36, light: 48 };

export interface NewsEnv {
  NEWS_DB: D1Database;
  NEWS_INDEX?: VectorizeIndex;
  AI?: Ai;
}

/** Stable 64-bit id for an article in a station's pool. */
export function itemId(pool: NewsStation, url: string, title: string): string {
  const key = canonicalUrl(url);
  return `${pool}:${fnv1a(key)}${fnv1a(`${key}#${title.slice(0, 40)}`)}`;
}

export function expiryFor(bucket: Bucket, light: boolean, fetchedAt: number, publishedAt: number): number {
  const hours = light ? (EXPIRY_H.light ?? 48) : (EXPIRY_H[bucket] ?? EXPIRY_H.default);
  return Math.min(publishedAt, fetchedAt) + hours * HOUR;
}

/** One feed's items, normalized and filtered, as pool rows (not yet stored). */
export function normalizeFeed(pool: NewsStation, feed: FeedSource, body: string, now: number): { items: PoolItem[]; parsed: number } {
  const raw = parseFeed(body);
  const items: PoolItem[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const publishedAt = clampDate(r.publishedAt, now);
    const expiresAt = expiryFor(feed.bucket, false, now, publishedAt);
    if (expiresAt <= now) continue;
    const gate = prefilter(stripSeoPrefix(r.title), r.descr, feed.lang);
    if (!gate.ok) continue;
    const id = itemId(pool, r.url, gate.title);
    if (seen.has(id)) continue;
    seen.add(id);
    const publisherKey = feed.publisher === 'bing' ? (publisherFromBing(r.sourceName) ?? 'bing') : feed.publisher;
    items.push({
      id,
      pool,
      lang: feed.lang,
      bucket: feed.bucket,
      state: feed.state,
      city: feed.city,
      title: gate.title,
      descr: gate.descr,
      url: r.url,
      publisherKey,
      publisherSpoken: spokenPublisher(publisherKey, pool, feed.lang),
      feedId: feed.id,
      publishedAt,
      fetchedAt: now,
      expiresAt,
      titleKey: titleKey(gate.title),
      clusterId: id,
      topicId: id,
      light: false,
      death: gate.death,
      question: gate.question,
      opinion: gate.opinion,
    });
  }
  return { items, parsed: raw.length };
}

async function fetchBody(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  const res = await fetch(url, { headers: FEED_HEADERS, redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
  const body = res.ok ? await res.text() : '';
  return { status: res.status, body };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

export interface FetchSummary {
  feeds: number;
  ok: number;
  parsed: number;
  kept: number;
  inserted: number;
  failed: string[];
}

/**
 * Fetches feeds (6 at a time), normalizes and filters them, merges lexical duplicates inside the batch, and stores
 * the new items. Feed health goes to news_feed. Never throws for a single feed.
 */
export async function fetchAndStore(env: NewsEnv, pool: NewsStation, feeds: FeedSource[], now: number, timeoutMs = 9000): Promise<FetchSummary> {
  const results: FeedResult[] = [];
  const all: (PoolItem & { mixed?: boolean })[] = [];
  let parsed = 0;
  await mapLimit(feeds, 6, async (feed) => {
    const t0 = Date.now();
    try {
      const { status, body } = await fetchBody(feed.url, timeoutMs);
      const { items, parsed: n } = status < 400 ? normalizeFeed(pool, feed, body, now) : { items: [], parsed: 0 };
      parsed += n;
      all.push(...items.map((it) => ({ ...it, mixed: Boolean(feed.mixed) || feed.publisher === 'bing' })));
      results.push({ feedId: feed.id, url: feed.url, ok: status < 400 && n > 0, status, items: n, kept: items.length, ms: Date.now() - t0, error: n ? undefined : status < 400 ? 'no items' : `HTTP ${status}` });
    } catch (err) {
      results.push({ feedId: feed.id, url: feed.url, ok: false, items: 0, kept: 0, ms: Date.now() - t0, error: String(err).slice(0, 200) });
    }
  });
  // One row per article: the first feed that carried it wins
  const unique = [...new Map(all.map((it) => [it.id, it])).values()];
  const known = await existingIds(env.NEWS_DB, unique.map((it) => it.id));
  const fresh = unique.filter((it) => !known.has(it.id)).sort((a, b) => b.publishedAt - a.publishedAt);
  // Lexical pre-pass: the same headline from two outlets becomes one story before any embedding
  const clusters = assignClusters(fresh.map((it) => ({ id: it.id, title: it.title })));
  for (const it of fresh) {
    const a = clusters.get(it.id);
    if (a) {
      it.clusterId = a.clusterId;
      it.topicId = a.topicId;
    }
  }
  const inserted = await insertItems(env.NEWS_DB, fresh);
  await saveFeedResults(env.NEWS_DB, pool, results, now).catch((err: unknown) => console.error(`[news] feed health write failed: ${String(err)}`));
  return {
    feeds: feeds.length,
    ok: results.filter((r) => r.ok).length,
    parsed,
    kept: all.length,
    inserted,
    failed: results.filter((r) => !r.ok).map((r) => `${r.feedId} ${r.error ?? ''}`.trim()),
  };
}

/** Tags up to `limit` untagged items in batches of 20. Returns how many were tagged and how many remain. */
export async function tagPending(env: NewsEnv, pool: NewsStation, now: number, limit = 100): Promise<{ tagged: number; dropped: number; remaining: number }> {
  if (!env.AI) return { tagged: 0, dropped: 0, remaining: 0 };
  const rows = await untagged(env.NEWS_DB, pool, limit, now);
  let tagged = 0;
  let dropped = 0;
  const batches: PendingRow[][] = [];
  for (let i = 0; i < rows.length; i += 20) batches.push(rows.slice(i, i + 20));
  // Batches run side by side (each is one model call)
  await mapLimit(batches, 5, async (batch) => {
    const inputs: TagInput[] = batch.map((r, j) => ({ i: j, feedBucket: r.bucket, title: r.title, descr: r.descr }));
    const tags = new Map((await tagBatch(env.AI!, inputs)).map((t) => [t.i, t]));
    const updates: TagUpdate[] = batch.map((r, j) => tagUpdate(r, tags.get(j)));
    await applyTags(env.NEWS_DB, updates);
    tagged += updates.filter((u) => !u.drop).length;
    dropped += updates.filter((u) => u.drop).length;
  });
  return { tagged, dropped, remaining: await countPending(env.NEWS_DB, pool, 'tagged', now) };
}

/** How a tag changes a row. A section feed keeps its bucket; mixed feeds and Bing take the tag's. No tag: unchanged. */
export function tagUpdate(r: PendingRow, tag: Tag | undefined): TagUpdate {
  const fixed = ['city', 'state'].includes(r.bucket) || !r.mixed;
  let bucket: Bucket = r.bucket;
  if (tag?.bucket && !fixed && tag.bucket !== 'city' && tag.bucket !== 'state') bucket = tag.bucket;
  // A "kicker" or "science" section stays; a light tag on any item only marks it as a kicker candidate
  const light = tag ? tag.light && !tag.death : r.bucket === 'kicker';
  const death = Boolean(tag?.death);
  return {
    id: r.id,
    drop: Boolean(tag?.grim || tag?.clickbait),
    bucket,
    state: tag?.state,
    city: cityKeyOf(tag?.city),
    light,
    death,
    opinion: Boolean(tag?.opinion),
    expiresAt: expiryFor(bucket, light, r.fetched_at, r.published_at),
  };
}

/**
 * Embeds new items (bge-m3), finds near neighbours among earlier items (Vectorize, same pool, last 36 h) and among
 * each other, and assigns story clusters and topics. Without Workers AI or Vectorize, the lexical clusters stand.
 */
export async function dedupePending(env: NewsEnv, pool: NewsStation, now: number, limit = 400): Promise<{ embedded: number; merged: number; remaining: number }> {
  const rows = await unembedded(env.NEWS_DB, pool, limit, now);
  if (!rows.length) return { embedded: 0, merged: 0, remaining: 0 };
  if (!env.AI) {
    await applyClusters(env.NEWS_DB, rows.map((r) => ({ id: r.id, clusterId: r.cluster_id, topicId: r.topic_id })));
    return { embedded: 0, merged: 0, remaining: await countPending(env.NEWS_DB, pool, 'embedded', now) };
  }
  const vectors = await embed(env.AI, rows.map((r) => `${r.title}. ${r.descr.slice(0, 160)}`));
  const neighbours = new Map<string, Neighbour[]>();
  const index = env.NEWS_INDEX;
  if (index) {
    await mapLimit(rows.map((r, i) => ({ r, i })), 8, async ({ r, i }) => {
      try {
        const res = await index.query(vectors[i], { topK: 5, returnMetadata: 'all', filter: { pool, ts: { $gte: now - 36 * HOUR } } });
        neighbours.set(
          r.id,
          res.matches
            .filter((m) => m.id !== r.id && m.metadata)
            .map((m) => ({
              clusterId: String(m.metadata!.cluster),
              topicId: String(m.metadata!.topic),
              score: m.score,
              ...(typeof m.metadata!.title === 'string' ? { title: m.metadata!.title } : {}),
            })),
        );
      } catch (err) {
        console.error(`[news] vector query failed: ${String(err)}`);
      }
    });
  }
  // Items embedded in an earlier step or refresh: a strong word match joins their story even before the vector
  // index has caught up with them
  for (const prior of await embeddedTitles(env.NEWS_DB, pool, now)) {
    const toks = new Set(tokens(prior.title));
    for (const r of rows) {
      const lex = tokenSimilarity(toks, new Set(tokens(r.title)));
      if (lex < LEXICAL_SUPPORT) continue;
      const list = neighbours.get(r.id) ?? [];
      const known = list.find((n) => n.clusterId === prior.cluster_id);
      if (known) known.title = prior.title;
      else list.push({ clusterId: prior.cluster_id, topicId: prior.topic_id, score: 0, title: prior.title });
      neighbours.set(r.id, list);
    }
  }
  // Lexical pre-clusters from the fetch step stay together: members follow their representative
  const assigned = assignClusters(rows.map((r, i) => ({ id: r.id, title: r.title, vector: vectors[i] })), neighbours);
  const out = rows.map((r) => {
    const a = assigned.get(r.id)!;
    const rep = r.cluster_id !== r.id ? assigned.get(r.cluster_id) : undefined;
    return { id: r.id, clusterId: rep?.clusterId ?? a.clusterId, topicId: rep?.topicId ?? a.topicId };
  });
  await applyClusters(env.NEWS_DB, out);
  if (index) {
    const vecs = rows.map((r, i) => ({
      id: r.id,
      values: vectors[i],
      metadata: { pool, cluster: out[i].clusterId, topic: out[i].topicId, ts: r.fetched_at, title: r.title.slice(0, 160) },
    }));
    for (let i = 0; i < vecs.length; i += 200) await index.upsert(vecs.slice(i, i + 200));
  }
  return { embedded: rows.length, merged: out.filter((o) => o.clusterId !== o.id).length, remaining: await countPending(env.NEWS_DB, pool, 'embedded', now) };
}

/** Deletes expired items (and their vectors). */
export async function expirePool(env: NewsEnv, pool: NewsStation, now: number): Promise<number> {
  const ids = await expire(env.NEWS_DB, pool, now);
  if (ids.length && env.NEWS_INDEX) {
    for (let i = 0; i < ids.length; i += 500) await env.NEWS_INDEX.deleteByIds(ids.slice(i, i + 500)).catch(() => undefined);
  }
  return ids.length;
}
