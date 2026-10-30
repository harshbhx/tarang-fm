/** The Durable Object that stores the daily budget counters (logic and limits: worker/ledger.ts). One instance serves the whole site. */
import { DurableObject } from 'cloudflare:workers';
import { dayKey, limitsFrom, SpendLedger, type ChargeResult, type Counters, type SpendEnv, type SpendKind } from './ledger';

export class SpendGuard extends DurableObject<Env> {
  private readonly ledger: SpendLedger;
  private lastSweepDay = '';

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    sql.exec('CREATE TABLE IF NOT EXISTS counter (key TEXT PRIMARY KEY, n INTEGER NOT NULL)');
    sql.exec('CREATE TABLE IF NOT EXISTS flag (name TEXT PRIMARY KEY, on_ INTEGER NOT NULL)');
    const counters: Counters = {
      get: (key) => Number(sql.exec('SELECT n FROM counter WHERE key = ?', key).toArray()[0]?.n ?? 0),
      add: (key, n) => {
        sql.exec('INSERT INTO counter (key, n) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET n = n + excluded.n', key, n);
        return counters.get(key);
      },
      sweep: (day) => void sql.exec("DELETE FROM counter WHERE substr(key, 1, 10) <> ?", day),
      getFlag: (name) => Number(sql.exec('SELECT on_ FROM flag WHERE name = ?', name).toArray()[0]?.on_ ?? 0) === 1,
      setFlag: (name, on) => void sql.exec('INSERT INTO flag (name, on_) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET on_ = excluded.on_', name, on ? 1 : 0),
    };
    this.ledger = new SpendLedger(counters, limitsFrom(env as unknown as SpendEnv));
  }

  charge(kind: SpendKind, units: number, ip: string): ChargeResult {
    const now = Date.now();
    const day = dayKey(now);
    if (day !== this.lastSweepDay) {
      this.ledger.sweep(now);
      this.lastSweepDay = day;
    }
    return this.ledger.charge(kind, units, ip, now);
  }

  status() {
    return this.ledger.status();
  }

  setPaused(paused: boolean): void {
    this.ledger.setPaused(paused);
  }
}

/** The single SpendGuard instance. */
export function spendGuard(env: Env): DurableObjectStub<SpendGuard> | undefined {
  return env.SPEND?.get(env.SPEND.idFromName('spend'));
}
