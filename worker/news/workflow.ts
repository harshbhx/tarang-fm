/** The newsroom refresh as a durable Workflow: fetch → tag → embed + dedupe → expire and record. */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from 'cloudflare:workers';
import { coreFeeds, localFeeds, type RefreshKind } from './catalog';
import { dedupePending, expirePool, fetchAndStore, tagPending, type NewsEnv } from './pipeline';
import { finishRefreshRow, unairedCounts } from './store';
import type { NewsStation } from './types';

export interface NewsRefreshParams {
  station: NewsStation;
  /** refresh: core feeds; topup: tier 1 + 3 and Bing; local: a listener's state and city; process: tag and dedupe only */
  kind: RefreshKind | 'process';
  state?: string;
  city?: string;
}

const FEEDS_PER_STEP = 6;
const FETCH_STEP = { retries: { limit: 2, delay: '5 seconds', backoff: 'constant' }, timeout: '2 minutes' } as const;
const AI_STEP = { retries: { limit: 2, delay: '10 seconds', backoff: 'exponential' }, timeout: '5 minutes' } as const;

/** The refresh_row scopes a run updates. */
export function scopesFor(p: NewsRefreshParams): string[] {
  if (p.kind === 'local') return [p.state ? `state:${p.station}:${p.state}` : '', p.city ? `city:${p.station}:${p.city}` : ''].filter(Boolean);
  if (p.kind === 'process') return [];
  return [`station:${p.station}`];
}

export class NewsRefresh extends WorkflowEntrypoint<Env, NewsRefreshParams> {
  async run(event: WorkflowEvent<NewsRefreshParams>, step: WorkflowStep) {
    const p = event.payload;
    const env = this.env as unknown as NewsEnv;
    const startedAt = Date.now();
    const report: Record<string, unknown> = { station: p.station, kind: p.kind };

    if (p.kind !== 'process') {
      const feeds = p.kind === 'local' ? localFeeds(p.station, p.state, p.city) : coreFeeds(p.station, p.kind);
      const fetched = [];
      for (let i = 0; i < feeds.length; i += FEEDS_PER_STEP) {
        const chunk = feeds.slice(i, i + FEEDS_PER_STEP);
        fetched.push(await step.do(`fetch ${i / FEEDS_PER_STEP + 1}: ${chunk.map((f) => f.id).join(', ')}`.slice(0, 250), FETCH_STEP, () => fetchAndStore(env, p.station, chunk, startedAt)));
      }
      report.fetch = {
        feeds: fetched.reduce((n, f) => n + f.feeds, 0),
        ok: fetched.reduce((n, f) => n + f.ok, 0),
        inserted: fetched.reduce((n, f) => n + f.inserted, 0),
        failed: fetched.flatMap((f) => f.failed),
      };
    }

    for (let i = 0; i < 12; i++) {
      const r = await step.do(`tag ${i + 1}`, AI_STEP, () => tagPending(env, p.station, Date.now(), 100));
      if (!r.remaining || !r.tagged) break;
    }
    for (let i = 0; i < 10; i++) {
      const r = await step.do(`dedupe ${i + 1}`, AI_STEP, () => dedupePending(env, p.station, Date.now(), 400));
      if (!r.remaining || !r.embedded) break;
    }

    report.store = await step.do('store', async () => {
      const now = Date.now();
      const expired = await expirePool(env, p.station, now);
      const counts = await unairedCounts(env.NEWS_DB, p.station, now, { state: p.state, city: p.city });
      for (const scope of scopesFor(p)) {
        const unaired = scope.startsWith('city:') ? (counts.city ?? 0) : scope.startsWith('state:') ? (counts.state ?? 0) : counts.total;
        await finishRefreshRow(env.NEWS_DB, scope, now, unaired, p.kind === 'topup');
      }
      return { expired, counts };
    });
    return report;
  }
}
