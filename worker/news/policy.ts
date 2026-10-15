/** When the newsroom fetches: only when a pool was consumed, a top-up when it runs low, local pools on demand. Pure. */

const HOUR = 3_600_000;

export const POLICY = {
  /** Never refresh a station sooner than this */
  minAgeMs: 2 * HOUR,
  /** After this, a lightly listened station refreshes at the lower consumed ratio */
  staleAgeMs: 4 * HOUR,
  consumedRatio: 0.5,
  staleConsumedRatio: 0.25,
  /** One low-pool top-up per station per hour */
  topupEveryMs: HOUR,
  low: { national: 4, state: 2, total: 8 },
  /** City and state pools: reused 2-4 h, re-fetched once 60 % aired */
  localMinAgeMs: 2 * HOUR,
  localMaxAgeMs: 4 * HOUR,
  localConsumedRatio: 0.6,
  /** A claimed refresh that never finished is retried after this */
  runningTimeoutMs: 15 * 60_000,
} as const;

export interface RefreshState {
  refreshedAt: number;
  unairedAtRefresh: number;
  airedSince: number;
  servedSince: number;
  lastTopupAt?: number | null;
}

export type Decision = { run: boolean; why: string };

/** The scheduled check for a station pool (cron): refresh only when the pool was consumed. */
export function stationDecision(row: RefreshState | undefined, now: number): Decision {
  if (!row || !row.refreshedAt) return { run: false, why: 'no listener yet' };
  const age = now - row.refreshedAt;
  if (age < POLICY.minAgeMs) return { run: false, why: 'refreshed under 2 h ago' };
  if (row.servedSince <= 0) return { run: false, why: 'nobody listened since the last refresh' };
  const ratio = row.airedSince / Math.max(1, row.unairedAtRefresh);
  if (ratio >= POLICY.consumedRatio) return { run: true, why: `consumed ${Math.round(ratio * 100)}%` };
  if (age >= POLICY.staleAgeMs && ratio >= POLICY.staleConsumedRatio) return { run: true, why: `stale and consumed ${Math.round(ratio * 100)}%` };
  return { run: false, why: `only ${Math.round(ratio * 100)}% aired` };
}

/** After a bulletin: a top-up when the unaired pool runs low (at most once per hour, even inside the 2 h minimum). */
export function topupDecision(counts: Record<string, number>, lastTopupAt: number | null | undefined, now: number, hasState: boolean): Decision {
  if (lastTopupAt && now - lastTopupAt < POLICY.topupEveryMs) return { run: false, why: 'topped up in the last hour' };
  const national = counts.national ?? 0;
  const state = (counts.state ?? 0) + (counts.city ?? 0);
  const total = counts.total ?? 0;
  if (national < POLICY.low.national) return { run: true, why: `national ${national} < ${POLICY.low.national}` };
  if (hasState && state < POLICY.low.state) return { run: true, why: `state ${state} < ${POLICY.low.state}` };
  if (total < POLICY.low.total) return { run: true, why: `total ${total} < ${POLICY.low.total}` };
  return { run: false, why: 'pool is fine' };
}

/**
 * A listener's city or state pool: fetched in the request path the first time (or when over 4 h old), refreshed in
 * the background between 2 and 4 h when most of it aired, otherwise reused.
 */
export function localDecision(row: RefreshState | undefined, now: number): 'fetch-now' | 'refresh' | 'reuse' {
  if (!row || !row.refreshedAt) return 'fetch-now';
  const age = now - row.refreshedAt;
  if (age >= POLICY.localMaxAgeMs) return 'fetch-now';
  const ratio = row.airedSince / Math.max(1, row.unairedAtRefresh);
  if (age >= POLICY.localMinAgeMs && row.servedSince > 0 && ratio >= POLICY.localConsumedRatio) return 'refresh';
  return 'reuse';
}
