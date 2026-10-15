/** D1 access for the newsroom pool: items, clusters, aired stories, refresh bookkeeping and feed health. */
import type { Bucket, NewsLang, NewsStation, PoolItem, Story } from './types';

const CHUNK = 40;

function chunks<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const b = (v: boolean) => (v ? 1 : 0);

/** Ids from `ids` that are already in the pool. */
export async function existingIds(db: D1Database, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunks(ids, 90)) {
    const { results } = await db
      .prepare(`SELECT id FROM news_item WHERE id IN (${part.map(() => '?').join(',')})`)
      .bind(...part)
      .all<{ id: string }>();
    for (const r of results) found.add(r.id);
  }
  return found;
}

export async function insertItems(db: D1Database, items: (PoolItem & { mixed?: boolean })[]): Promise<number> {
  let inserted = 0;
  for (const part of chunks(items)) {
    const res = await db.batch(
      part.map((it) =>
        db
          .prepare(
            `INSERT OR IGNORE INTO news_item (id, pool, lang, bucket, state, city, title, descr, url, publisher_key, publisher_spoken, feed_id, mixed,
              published_at, fetched_at, expires_at, title_key, cluster_id, topic_id, light, death, question, opinion)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            it.id, it.pool, it.lang, it.bucket, it.state ?? null, it.city ?? null, it.title, it.descr, it.url, it.publisherKey,
            it.publisherSpoken ?? null, it.feedId, b(Boolean(it.mixed)), it.publishedAt, it.fetchedAt, it.expiresAt, it.titleKey,
            it.clusterId, it.topicId, b(it.light), b(it.death), b(it.question), b(it.opinion),
          ),
      ),
    );
    inserted += res.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
  }
  return inserted;
}

export interface PendingRow {
  id: string;
  lang: NewsLang;
  bucket: Bucket;
  title: string;
  descr: string;
  mixed: number;
  fetched_at: number;
  published_at: number;
  state: string | null;
  city: string | null;
  cluster_id: string;
  topic_id: string;
}

const PENDING_COLS = 'id, lang, bucket, title, descr, mixed, fetched_at, published_at, state, city, cluster_id, topic_id';

export async function untagged(db: D1Database, pool: NewsStation, limit: number, now: number): Promise<PendingRow[]> {
  const { results } = await db
    .prepare(`SELECT ${PENDING_COLS} FROM news_item WHERE pool = ? AND tagged = 0 AND expires_at > ? ORDER BY published_at DESC LIMIT ?`)
    .bind(pool, now, limit)
    .all<PendingRow>();
  return results;
}

export async function unembedded(db: D1Database, pool: NewsStation, limit: number, now: number): Promise<PendingRow[]> {
  const { results } = await db
    .prepare(`SELECT ${PENDING_COLS} FROM news_item WHERE pool = ? AND embedded = 0 AND expires_at > ? ORDER BY published_at DESC LIMIT ?`)
    .bind(pool, now, limit)
    .all<PendingRow>();
  return results;
}

export async function countPending(db: D1Database, pool: NewsStation, column: 'tagged' | 'embedded', now: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM news_item WHERE pool = ? AND ${column} = 0 AND expires_at > ?`)
    .bind(pool, now)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Titles and stories of items already embedded (the lexical cross-check for new items). */
export async function embeddedTitles(db: D1Database, pool: NewsStation, now: number): Promise<{ title: string; cluster_id: string; topic_id: string }[]> {
  const { results } = await db
    .prepare('SELECT title, cluster_id, topic_id FROM news_item WHERE pool = ? AND embedded = 1 AND expires_at > ? ORDER BY published_at DESC LIMIT 1500')
    .bind(pool, now)
    .all<{ title: string; cluster_id: string; topic_id: string }>();
  return results;
}

export interface TagUpdate {
  id: string;
  drop: boolean;
  bucket: Bucket;
  state?: string;
  city?: string;
  light: boolean;
  death: boolean;
  opinion: boolean;
  expiresAt: number;
}

export async function applyTags(db: D1Database, updates: TagUpdate[]): Promise<void> {
  for (const part of chunks(updates)) {
    await db.batch(
      part.map((u) =>
        u.drop
          ? db.prepare('DELETE FROM news_item WHERE id = ?').bind(u.id)
          : db
              .prepare(
                'UPDATE news_item SET tagged = 1, bucket = ?, state = COALESCE(state, ?), city = COALESCE(city, ?), light = ?, death = ?, opinion = MAX(opinion, ?), expires_at = ? WHERE id = ?',
              )
              .bind(u.bucket, u.state ?? null, u.city ?? null, b(u.light), b(u.death), b(u.opinion), u.expiresAt, u.id),
      ),
    );
  }
}

export async function applyClusters(db: D1Database, rows: { id: string; clusterId: string; topicId: string }[]): Promise<void> {
  for (const part of chunks(rows)) {
    await db.batch(part.map((r) => db.prepare('UPDATE news_item SET embedded = 1, cluster_id = ?, topic_id = ? WHERE id = ?').bind(r.clusterId, r.topicId, r.id)));
  }
}

interface ItemRow {
  id: string;
  lang: NewsLang;
  bucket: Bucket;
  state: string | null;
  city: string | null;
  title: string;
  descr: string;
  url: string;
  publisher_key: string | null;
  publisher_spoken: string | null;
  published_at: number;
  cluster_id: string;
  topic_id: string;
  light: number;
  death: number;
  question: number;
  opinion: number;
  aired_at: number | null;
}

/** Unexpired stories for a station (one representative per cluster), with what the station already aired. */
export async function loadStories(db: D1Database, pool: NewsStation, now: number, place: { state?: string; city?: string } = {}): Promise<Story[]> {
  const { results } = await db
    .prepare(
      `SELECT i.id, i.lang, i.bucket, i.state, i.city, i.title, i.descr, i.url, i.publisher_key, i.publisher_spoken, i.published_at,
              i.cluster_id, i.topic_id, i.light, i.death, i.question, i.opinion, a.aired_at
         FROM news_item i LEFT JOIN news_aired a ON a.station = i.pool AND a.cluster_id = i.cluster_id
        WHERE i.pool = ? AND i.expires_at > ?
          AND (i.bucket NOT IN ('city', 'state') OR i.city = ? OR i.state = ?)`,
    )
    .bind(pool, now, place.city ?? '', place.state ?? '')
    .all<ItemRow>();
  const topics = await db
    .prepare('SELECT topic_id, MAX(aired_at) AS at FROM news_aired WHERE station = ? AND aired_at > ? GROUP BY topic_id')
    .bind(pool, now - 6 * 3_600_000)
    .all<{ topic_id: string; at: number }>();
  const topicAired = new Map(topics.results.map((t) => [t.topic_id, t.at]));
  return groupStories(results, pool, topicAired);
}

/** One story per cluster: the station-language item with a description first, then the freshest. */
export function groupStories(rows: ItemRow[], pool: NewsStation, topicAired: Map<string, number> = new Map()): Story[] {
  const byCluster = new Map<string, ItemRow[]>();
  for (const r of rows) {
    const list = byCluster.get(r.cluster_id);
    if (list) list.push(r);
    else byCluster.set(r.cluster_id, [r]);
  }
  const rank = (r: ItemRow) => (r.lang === pool ? 2 : 0) + (r.descr.length > 40 ? 1 : 0) + (r.publisher_spoken ? 0.5 : 0) + r.published_at / 1e15;
  const stories: Story[] = [];
  for (const [clusterId, list] of byCluster) {
    const rep = list.reduce((best, r) => (rank(r) > rank(best) ? r : best));
    const publishers = new Set(list.map((r) => r.publisher_key ?? r.id));
    stories.push({
      clusterId,
      topicId: rep.topic_id,
      itemId: rep.id,
      lang: rep.lang,
      bucket: list.find((r) => r.bucket === 'city')?.bucket ?? rep.bucket,
      state: rep.state ?? list.find((r) => r.state)?.state ?? undefined,
      city: rep.city ?? list.find((r) => r.city)?.city ?? undefined,
      title: rep.title,
      descr: rep.descr,
      url: rep.url,
      publisherSpoken: rep.publisher_spoken ?? undefined,
      publishedAt: Math.max(...list.map((r) => r.published_at)),
      sources: publishers.size,
      light: list.some((r) => r.light === 1),
      death: list.some((r) => r.death === 1),
      question: rep.question === 1,
      opinion: rep.opinion === 1,
      stationAiredAt: list.find((r) => r.aired_at !== null)?.aired_at ?? undefined,
      topicAiredAt: topicAired.get(rep.topic_id),
    });
  }
  return stories;
}

/** Records a bulletin's stories as aired on the station, and that someone listened. */
export async function markAired(
  db: D1Database,
  station: NewsStation,
  stories: { clusterId: string; topicId: string }[],
  bulletinId: string,
  now: number,
  scopes: string[],
): Promise<void> {
  const stmts = stories.map((s) =>
    db
      .prepare('INSERT OR REPLACE INTO news_aired (station, cluster_id, topic_id, aired_at, bulletin_id) VALUES (?, ?, ?, ?, ?)')
      .bind(station, s.clusterId, s.topicId, now, bulletinId),
  );
  for (const scope of scopes) {
    stmts.push(
      db
        .prepare('UPDATE news_refresh SET aired_since = aired_since + ?, served_since = served_since + 1, last_served_at = ? WHERE scope = ?')
        .bind(stories.length, now, scope),
    );
  }
  if (stmts.length) await db.batch(stmts);
}

export interface RefreshRow {
  scope: string;
  refreshed_at: number;
  unaired_at_refresh: number;
  aired_since: number;
  served_since: number;
  last_served_at: number | null;
  last_topup_at: number | null;
  running_since: number | null;
}

export async function refreshRows(db: D1Database, scopes?: string[]): Promise<Map<string, RefreshRow>> {
  const { results } = scopes?.length
    ? await db.prepare(`SELECT * FROM news_refresh WHERE scope IN (${scopes.map(() => '?').join(',')})`).bind(...scopes).all<RefreshRow>()
    : await db.prepare('SELECT * FROM news_refresh').all<RefreshRow>();
  return new Map(results.map((r) => [r.scope, r]));
}

/** Marks a scope as being refreshed now (so concurrent listeners don't start a second fetch). */
export async function claimRefresh(db: D1Database, scope: string, now: number, staleBefore: number): Promise<boolean> {
  const res = await db
    .prepare(
      `INSERT INTO news_refresh (scope, refreshed_at, running_since) VALUES (?, 0, ?)
       ON CONFLICT(scope) DO UPDATE SET running_since = excluded.running_since
       WHERE news_refresh.running_since IS NULL OR news_refresh.running_since < ?`,
    )
    .bind(scope, now, staleBefore)
    .run();
  return (res.meta.changes ?? 0) > 0;
}

export async function finishRefreshRow(db: D1Database, scope: string, now: number, unaired: number, topup: boolean): Promise<void> {
  if (topup) {
    // A top-up keeps the refresh clock; the pool it measures consumption against grows by what was added
    await db
      .prepare(
        `INSERT INTO news_refresh (scope, refreshed_at, unaired_at_refresh, last_topup_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(scope) DO UPDATE SET last_topup_at = excluded.last_topup_at, running_since = NULL,
           unaired_at_refresh = excluded.unaired_at_refresh + news_refresh.aired_since`,
      )
      .bind(scope, now, unaired, now)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO news_refresh (scope, refreshed_at, unaired_at_refresh) VALUES (?, ?, ?)
       ON CONFLICT(scope) DO UPDATE SET refreshed_at = excluded.refreshed_at, unaired_at_refresh = excluded.unaired_at_refresh,
         aired_since = 0, served_since = 0, running_since = NULL`,
    )
    .bind(scope, now, unaired)
    .run();
}

/** Unaired story counts per bucket for a station (and the listener's state/city). */
export async function unairedCounts(db: D1Database, pool: NewsStation, now: number, place: { state?: string; city?: string } = {}): Promise<Record<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT CASE WHEN i.city = ? THEN 'city' WHEN i.state = ? AND i.bucket IN ('state', 'city') THEN 'state' ELSE i.bucket END AS bucket,
              COUNT(DISTINCT i.cluster_id) AS n
         FROM news_item i LEFT JOIN news_aired a ON a.station = i.pool AND a.cluster_id = i.cluster_id
        WHERE i.pool = ? AND i.expires_at > ? AND a.cluster_id IS NULL
        GROUP BY 1`,
    )
    .bind(place.city ?? '', place.state ?? '', pool, now)
    .all<{ bucket: string; n: number }>();
  const counts: Record<string, number> = { total: 0 };
  for (const r of results) {
    counts[r.bucket] = r.n;
    counts.total += r.n;
  }
  return counts;
}

/** Deletes expired items (and aired rows older than two days). Returns the expired ids (for the vector index). */
export async function expire(db: D1Database, pool: NewsStation, now: number): Promise<string[]> {
  const { results } = await db.prepare('SELECT id FROM news_item WHERE pool = ? AND expires_at <= ? LIMIT 1000').bind(pool, now).all<{ id: string }>();
  await db.batch([
    db.prepare('DELETE FROM news_item WHERE pool = ? AND expires_at <= ?').bind(pool, now),
    db.prepare('DELETE FROM news_aired WHERE station = ? AND aired_at < ?').bind(pool, now - 48 * 3_600_000),
  ]);
  return results.map((r) => r.id);
}

export interface FeedResult {
  feedId: string;
  url: string;
  ok: boolean;
  status?: number;
  items: number;
  kept: number;
  ms: number;
  error?: string;
}

export async function saveFeedResults(db: D1Database, pool: NewsStation, results: FeedResult[], now: number): Promise<void> {
  for (const part of chunks(results)) {
    await db.batch(
      part.map((r) =>
        db
          .prepare(
            `INSERT INTO news_feed (feed_id, pool, url, ok, status, items, kept, ms, error, checked_at, last_ok_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(feed_id) DO UPDATE SET pool = excluded.pool, url = excluded.url, ok = excluded.ok, status = excluded.status, items = excluded.items,
               kept = excluded.kept, ms = excluded.ms, error = excluded.error, checked_at = excluded.checked_at,
               last_ok_at = COALESCE(excluded.last_ok_at, news_feed.last_ok_at)`,
          )
          .bind(r.feedId, pool, r.url, b(r.ok), r.status ?? null, r.items, r.kept, r.ms, r.error?.slice(0, 200) ?? null, now, r.ok ? now : null),
      ),
    );
  }
}
