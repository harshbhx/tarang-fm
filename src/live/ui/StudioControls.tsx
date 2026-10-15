import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { LiveControlRequest, LiveControlResponse, LiveSnapshot, LiveState } from '../../../shared/live';
import { STATIONS } from '../../../shared/stations';
import type { StationId } from '../../../shared/types';
import { fetchLiveNow, liveControl, StudioError } from '../studio';
import { formatAutoOff } from './format';

/** How often the panel re-reads every station while it is open */
const POLL_MS = 10_000;
const DESKTOP = '(min-width: 1024px)';
const FAILED = 'Could not reach the studio. Try again.';

type Action = LiveControlRequest['action'];

interface StationRow {
  /** Starts by itself when someone joins; false while stopped (blocked) */
  enabled: boolean;
  state: LiveState;
  listeners: number;
  /** Local epoch ms when the show on air ends (its six-minute limit) */
  offAt?: number;
}

interface StudioControlsProps {
  /** The owner's admin key, sent as a bearer token */
  adminKey: string;
  onForget: () => void;
}

/** Owner-only override for every station: stop (blocks auto-start) or start again, who is listening, the show's countdown. */
export default function StudioControls({ adminKey, onForget }: StudioControlsProps) {
  const [open, setOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia(DESKTOP).matches);
  const [rows, setRows] = useState<Partial<Record<StationId, StationRow>>>({});
  const [unreachable, setUnreachable] = useState<Partial<Record<StationId, boolean>>>({});
  const [busy, setBusy] = useState<Partial<Record<StationId, Action>>>({});
  const [errors, setErrors] = useState<Partial<Record<StationId, string>>>({});
  const [stoppingAll, setStoppingAll] = useState(false);
  const [panelError, setPanelError] = useState<string>();
  /** Server clock minus local clock per station, from its last snapshot */
  const offsets = useRef<Partial<Record<StationId, number>>>({});

  useEffect(() => {
    const abort = new AbortController();
    const poll = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      const results = await Promise.all(STATIONS.map((s) => fetchLiveNow(s.id, abort.signal)));
      if (abort.signal.aborted) return;
      const at = Date.now();
      const next: Partial<Record<StationId, StationRow>> = {};
      const missing: Partial<Record<StationId, boolean>> = {};
      results.forEach((snapshot, i) => {
        const id = STATIONS[i].id;
        if (!snapshot) {
          missing[id] = true;
          return;
        }
        offsets.current[id] = Number.isFinite(snapshot.now) ? snapshot.now - at : 0;
        next[id] = fromSnapshot(snapshot, offsets.current[id] ?? 0);
      });
      setRows((prev) => ({ ...prev, ...next }));
      setUnreachable(missing);
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      abort.abort();
      window.clearInterval(timer);
    };
  }, []);

  /** Starts or stops one station; returns the error text, if any. */
  const run = async (id: StationId, action: Action): Promise<string | undefined> => {
    setBusy((b) => ({ ...b, [id]: action }));
    try {
      const res = await liveControl(id, action, adminKey);
      setRows((r) => ({ ...r, [id]: fromControl(res, offsets.current[id] ?? 0) }));
      setUnreachable((u) => ({ ...u, [id]: false }));
      return undefined;
    } catch (err) {
      return err instanceof StudioError ? err.message : FAILED;
    } finally {
      setBusy((b) => ({ ...b, [id]: undefined }));
    }
  };

  const toggle = async (id: StationId, action: Action) => {
    setErrors((e) => ({ ...e, [id]: undefined }));
    setPanelError(undefined);
    const error = await run(id, action);
    setErrors((e) => ({ ...e, [id]: error }));
  };

  const stopAll = async () => {
    setStoppingAll(true);
    setErrors({});
    setPanelError(undefined);
    const failed = (await Promise.all(STATIONS.map((s) => run(s.id, 'stop')))).filter(Boolean);
    setStoppingAll(false);
    if (failed.length) setPanelError([...new Set(failed)].join(' '));
  };

  const blockedCount = STATIONS.filter((s) => rows[s.id]?.enabled === false).length;
  const liveCount = STATIONS.filter((s) => rows[s.id]?.offAt !== undefined).length;
  const summary = blockedCount ? `${blockedCount} of ${STATIONS.length} blocked` : liveCount ? `${liveCount} on air` : 'All auto';

  // The show countdown runs in seconds while a show is on and the panel is open
  const [now, setNow] = useState(() => Date.now());
  const counting = open && liveCount > 0;
  useEffect(() => {
    if (!counting) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [counting]);

  // Class names use the `ctl-` prefix: `.studio-*` belongs to the studio phone line card in index.css
  return (
    <section className="ctl" aria-labelledby="studio-title" data-open={open}>
      <div className="ctl-head">
        <div className="ctl-heading">
          <h2 id="studio-title" className="ctl-title">
            Studio controls
          </h2>
          <span className="ctl-summary" data-on={liveCount > 0}>
            {summary}
          </span>
        </div>
        <div className="ctl-actions">
          <button
            type="button"
            className="ctl-btn ctl-stop-all"
            data-action="stop"
            aria-busy={stoppingAll || undefined}
            disabled={stoppingAll}
            onClick={() => void stopAll()}
          >
            {stoppingAll ? 'Stopping all…' : 'Stop all'}
          </button>
          <button type="button" className="ctl-forget" onClick={onForget}>
            Forget key
          </button>
          <button
            type="button"
            className="ctl-toggle"
            aria-expanded={open}
            aria-controls="studio-body"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Hide' : 'Show'}
            <ChevronIcon open={open} />
          </button>
        </div>
      </div>
      {panelError ? (
        <p className="ctl-error ctl-panel-error" role="alert">
          {panelError}
        </p>
      ) : null}

      <div id="studio-body" className="ctl-body" hidden={!open}>
        <ul className="ctl-grid">
          {STATIONS.map((station) => {
            const row = rows[station.id];
            // Stop blocks auto-start; Start lifts the block
            const action: Action = row?.enabled === false ? 'start' : 'stop';
            const live = row?.offAt !== undefined;
            const pending = busy[station.id];
            const error = errors[station.id];
            const errorId = `studio-error-${station.id}`;
            return (
              <li
                key={station.id}
                className="ctl-tile"
                data-on={live}
                style={{ '--station': station.accent } as CSSProperties}
              >
                <div className="ctl-info">
                  <span className="ctl-name">
                    {station.languageName}
                    <span className="ctl-freq">{station.frequency}</span>
                  </span>
                  <span className="ctl-meta">
                    <span className="ctl-pill" data-on={live}>
                      {row ? stateLabel(row) : unreachable[station.id] ? 'No reading' : 'Checking'}
                    </span>
                    {row ? (
                      <span className="tabular-nums">
                        {row.listeners} listening
                      </span>
                    ) : null}
                    {row?.offAt !== undefined ? (
                      <span className="ctl-countdown tabular-nums">
                        {row.offAt > now ? `show ends in ${formatAutoOff(row.offAt - now)}` : 'ending…'}
                      </span>
                    ) : null}
                  </span>
                </div>
                <button
                  type="button"
                  className="ctl-btn"
                  data-action={action}
                  aria-busy={pending ? true : undefined}
                  aria-describedby={error ? errorId : undefined}
                  disabled={Boolean(pending) || stoppingAll}
                  onClick={() => void toggle(station.id, action)}
                >
                  {pending ? (pending === 'start' ? 'Starting…' : 'Stopping…') : action === 'start' ? 'Start' : 'Stop'}
                  <span className="sr-only">
                    {' '}
                    {station.languageName} {station.frequency}
                  </span>
                </button>
                {error ? (
                  <p id={errorId} className="ctl-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** A show's end time, only while it is awake. */
function showEnd(state: LiveState, until: unknown, offsetMs: number): number | undefined {
  return state !== 'sleeping' && Number.isFinite(until) ? (until as number) - offsetMs : undefined;
}

function fromSnapshot(snapshot: LiveSnapshot, offsetMs: number): StationRow {
  return {
    enabled: snapshot.enabled !== false,
    state: snapshot.state,
    listeners: Array.isArray(snapshot.listeners) ? snapshot.listeners.length : 0,
    offAt: showEnd(snapshot.state, snapshot.enabledUntil, offsetMs),
  };
}

function fromControl(res: LiveControlResponse, offsetMs: number): StationRow {
  return {
    enabled: res.enabled !== false,
    state: res.state,
    listeners: Number.isFinite(res.listeners) ? res.listeners : 0,
    offAt: showEnd(res.state, res.enabledUntil, offsetMs),
  };
}

/** Blocked (stopped by the studio), on air, warming up, or Auto: asleep and starts when someone joins. */
function stateLabel(row: StationRow): string {
  if (!row.enabled) return 'Blocked';
  if (row.state === 'on_air') return 'On air';
  if (row.state === 'warming_up') return 'Warming up';
  return 'Auto';
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ rotate: open ? '180deg' : '0deg', transition: 'rotate 200ms' }}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
