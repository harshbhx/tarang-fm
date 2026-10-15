/** The request-path newsroom: a bulletin's slate from the D1 pool, on-demand local pools, top-ups and the cron check. */
import type { Source, Station } from '../../shared/types';
import { cadence, pickBulletin, slateSources } from './bulletin';
import { cityKeyOf, HOME_STATE, localFeeds, newsStationOf, stateCodeOf } from './catalog';
import { fetchAndStore } from './pipeline';
import { localDecision, POLICY, requestDecision, stationDecision, topupDecision, type RefreshState } from './policy';
import { claimRefresh, finishRefreshRow, loadStories, markAired, refreshRows, unairedCounts, type RefreshRow } from './store';
import type { BulletinMode, NewsStation } from './types';
import type { NewsRefreshParams } from './workflow';

/** The request path waits this long for a first-time city or state fetch, then reads whatever arrived. */
const LOCAL_BUDGET_MS = 3000;
/** Fewer stories than this in the pool: the caller uses the live headline fallback instead. */
const MIN_STORIES = 4;

export interface BulletinRequest {
  station: Station;
  mode?: BulletinMode;
  /** The listener's city as the edge or client names it ("Vadodara") */
  city?: string;
  /** cf.regionCode ("GJ") and/or a region name ("Gujarat") */
  regionCode?: string;
  regionName?: string;
  /** Story ids this session already heard */
  airedNews?: string[];
  now?: number;
  waitUntil?: (p: Promise<unknown>) => void;
}

function toState(row: RefreshRow | undefined): RefreshState | undefined {
  return row
    ? { refreshedAt: row.refreshed_at, unairedAtRefresh: row.unaired_at_refresh, airedSince: row.aired_since, servedSince: row.served_since, lastTopupAt: row.last_topup_at }
    : undefined;
}

/** Starts a refresh Workflow (fire and forget). */
export async function startRefresh(env: Env, params: NewsRefreshParams, now = Date.now()): Promise<string | undefined> {
  const id = `${params.kind}-${params.station}-${params.state ?? ''}-${params.city ?? ''}-${now}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  try {
    const instance = await env.NEWS_REFRESH.create({ id, params });
    return instance.id;
  } catch (err) {
    console.error(`[news] could not start ${params.kind} for ${params.station}: ${String(err)}`);
    return undefined;
  }
}

const background = (req: BulletinRequest, p: Promise<unknown>) => {
  const guarded = p.catch((err: unknown) => console.error(`[news] background work failed: ${String(err)}`));
  if (req.waitUntil) req.waitUntil(guarded);
};

/**
 * The slate for one bulletin, as sources for the newsreader (id = story id: echo it back in airedNews). Empty when
 * the station has no newsroom pool yet; the caller then falls back to live headlines. Never throws. Nothing is
 * marked aired here: the caller calls markNewsAired with the segment's newsIds once the bulletin was written.
 */
export async function newsroomHeadlines(env: Env, req: BulletinRequest): Promise<Source[]> {
  const pool = newsStationOf(req.station.id);
  if (!pool || !env.NEWS_DB) return [];
  try {
    return await slateFor(env, pool, req);
  } catch (err) {
    console.error(`[news] newsroom slate failed: ${String(err)}`);
    return [];
  }
}

async function slateFor(env: Env, pool: NewsStation, req: BulletinRequest): Promise<Source[]> {
  const db = env.NEWS_DB;
  const now = req.now ?? Date.now();
  const state = stateCodeOf(req.regionCode, req.regionName) ?? HOME_STATE[pool];
  const city = cityKeyOf(req.city);
  const stationScope = `station:${pool}`;
  const stateScope = state && state !== HOME_STATE[pool] ? `state:${pool}:${state}` : undefined;
  const cityScope = city ? `city:${pool}:${city}` : undefined;
  const rows = await refreshRows(db, [stationScope, stateScope, cityScope].filter((s): s is string => Boolean(s)));
  const staleClaim = now - POLICY.runningTimeoutMs;

  // The first listener of a station starts its pool
  const stationRow = rows.get(stationScope);
  if (!stationRow?.refreshed_at) {
    if (await claimRefresh(db, stationScope, now, staleClaim)) background(req, startRefresh(env, { station: pool, kind: 'refresh' }, now));
  } else {
    // A listener is here: refresh in the background when most of the pool aired, or when it is hours old
    const d = requestDecision(toState(stationRow), now);
    if (d.run && !(stationRow.running_since && stationRow.running_since > staleClaim) && (await claimRefresh(db, stationScope, now, staleClaim))) {
      console.log(`[news] ${pool} refresh on demand: ${d.why}`);
      background(req, startRefresh(env, { station: pool, kind: 'refresh' }, now));
    }
  }

  // The listener's state and city pools: fetched now the first time (3 s budget), refreshed in the background later
  const needState = stateScope ? localDecision(toState(rows.get(stateScope)), now) : 'reuse';
  const needCity = cityScope ? localDecision(toState(rows.get(cityScope)), now) : 'reuse';
  const fetchState = needState === 'fetch-now' && stateScope && (await claimRefresh(db, stateScope, now, staleClaim));
  const fetchCity = needCity === 'fetch-now' && cityScope && (await claimRefresh(db, cityScope, now, staleClaim));
  if (fetchState || fetchCity) {
    const feeds = localFeeds(pool, fetchState ? state : undefined, fetchCity ? city : undefined);
    const work = fetchAndStore(env, pool, feeds, now, LOCAL_BUDGET_MS - 300).then(async () => {
      const counts = await unairedCounts(db, pool, Date.now(), { state, city });
      if (fetchState) await finishRefreshRow(db, stateScope!, Date.now(), counts.state ?? 0, false);
      if (fetchCity) await finishRefreshRow(db, cityScope!, Date.now(), counts.city ?? 0, false);
      // Tagging and embedding happen in the Workflow, off the request path
      await startRefresh(env, { station: pool, kind: 'process' });
    });
    background(req, work);
    await Promise.race([work.catch(() => undefined), new Promise((r) => setTimeout(r, LOCAL_BUDGET_MS))]);
  } else if (needState === 'refresh' || needCity === 'refresh') {
    const scopes = [needState === 'refresh' ? stateScope : undefined, needCity === 'refresh' ? cityScope : undefined].filter((s): s is string => Boolean(s));
    for (const scope of scopes) {
      if (await claimRefresh(db, scope, now, staleClaim)) {
        background(req, startRefresh(env, { station: pool, kind: 'local', state: scope === stateScope ? state : undefined, city: scope === cityScope ? city : undefined }, now));
      }
    }
  }

  const stories = await loadStories(db, pool, now, { state, city });
  if (stories.length < MIN_STORIES) return [];
  const { rotation, kicker } = cadence(now);
  const slate = pickBulletin(stories, { station: pool, mode: req.mode ?? 'full', city, state, sessionAired: new Set(req.airedNews ?? []), now, rotation, kicker });
  if (!slate.length) return [];

  return slateSources(slate);
}

/**
 * Marks the stories a written bulletin read (the segment's newsIds) as aired for the station, counts the serve on
 * the station, state and city pools, and starts one top-up per hour when the pool runs low. Never throws.
 */
export async function markNewsAired(env: Env, req: BulletinRequest, ids: string[] | undefined): Promise<void> {
  const pool = newsStationOf(req.station.id);
  if (!pool || !env.NEWS_DB || !ids?.length) return;
  const db = env.NEWS_DB;
  const now = req.now ?? Date.now();
  try {
    const state = stateCodeOf(req.regionCode, req.regionName) ?? HOME_STATE[pool];
    const city = cityKeyOf(req.city);
    const stationScope = `station:${pool}`;
    const stateScope = state && state !== HOME_STATE[pool] ? `state:${pool}:${state}` : undefined;
    const cityScope = city ? `city:${pool}:${city}` : undefined;
    const unique = [...new Set(ids)].slice(0, 20);
    const { results } = await db
      .prepare(`SELECT DISTINCT cluster_id, topic_id FROM news_item WHERE pool = ? AND cluster_id IN (${unique.map(() => '?').join(',')})`)
      .bind(pool, ...unique)
      .all<{ cluster_id: string; topic_id: string }>();
    const seen = new Set<string>();
    const stories = results.filter((r) => !seen.has(r.cluster_id) && seen.add(r.cluster_id)).map((r) => ({ clusterId: r.cluster_id, topicId: r.topic_id }));
    if (!stories.length) return;
    const scopes = [stationScope, stateScope, cityScope].filter((s): s is string => Boolean(s));
    await markAired(db, pool, stories, crypto.randomUUID(), now, scopes);
    const stationRow = (await refreshRows(db, [stationScope])).get(stationScope);
    const counts = await unairedCounts(db, pool, now, { state, city });
    const decision = topupDecision(counts, stationRow?.last_topup_at, now, Boolean(state));
    const staleClaim = now - POLICY.runningTimeoutMs;
    if (decision.run && !(stationRow?.running_since && stationRow.running_since > staleClaim) && (await claimRefresh(db, stationScope, now, staleClaim))) {
      console.log(`[news] ${pool} top-up: ${decision.why}`);
      await startRefresh(env, { station: pool, kind: 'topup' }, now);
    }
  } catch (err) {
    console.error(`[news] marking aired failed: ${String(err)}`);
  }
}

/** The cron check: refresh each station (and each listener's local pool) only if it was consumed. */
export async function scheduledNews(env: Env, now = Date.now()): Promise<string[]> {
  const rows = await refreshRows(env.NEWS_DB);
  const started: string[] = [];
  for (const [scope, row] of rows) {
    const [kind, station, key] = scope.split(':') as [string, NewsStation, string | undefined];
    if (!newsStationOf(station)) continue;
    if (row.running_since && row.running_since > now - POLICY.runningTimeoutMs) continue;
    let params: NewsRefreshParams | undefined;
    if (kind === 'station') {
      const d = stationDecision(toState(row), now);
      console.log(`[news] cron ${scope}: ${d.why}`);
      if (d.run) params = { station, kind: 'refresh' };
    } else if (localDecision(toState(row), now) !== 'reuse' && row.served_since > 0 && row.last_served_at && now - row.last_served_at < 3 * 3_600_000) {
      params = { station, kind: 'local', ...(kind === 'state' ? { state: key } : { city: key }) };
    }
    if (params && (await claimRefresh(env.NEWS_DB, scope, now, now - POLICY.runningTimeoutMs))) {
      const id = await startRefresh(env, params, now);
      if (id) started.push(id);
    }
  }
  return started;
}
