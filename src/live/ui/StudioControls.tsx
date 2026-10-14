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
  enabled: boolean;
  state: LiveState;
  listeners: number;
  /** Local epoch ms when the station switches itself off */
  offAt?: number;
}

interface StudioControlsProps {
  /** The owner's admin key, sent as a bearer token */
  adminKey: string;
  onForget: () => void;
}

/** Owner-only switch for every station: on/off, who is listening, the auto-off countdown. */
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

  const onCount = STATIONS.filter((s) => rows[s.id]?.enabled).length;

  // The auto-off countdown runs in seconds while a station is on and the panel is open
  const [now, setNow] = useState(() => Date.now());
  const counting = open && onCount > 0;
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
          <span className="ctl-summary" data-on={onCount > 0}>
            {onCount ? `${onCount} of ${STATIONS.length} on` : 'All off'}
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
            const action: Action = row?.enabled ? 'stop' : 'start';
            const pending = busy[station.id];
            const error = errors[station.id];
            const errorId = `studio-error-${station.id}`;
            return (
              <li
                key={station.id}
                className="ctl-tile"
                data-on={row?.enabled ?? false}
                style={{ '--station': station.accent } as CSSProperties}
              >
                <div className="ctl-info">
                  <span className="ctl-name">
                    {station.languageName}
                    <span className="ctl-freq">{station.frequency}</span>
                  </span>
                  <span className="ctl-meta">
                    <span className="ctl-pill" data-on={row?.enabled ?? false}>
                      {row ? stateLabel(row) : unreachable[station.id] ? 'No reading' : 'Checking'}
                    </span>
                    {row ? (
                      <span className="tabular-nums">
                        {row.listeners} listening
                      </span>
                    ) : null}
                    {row?.enabled && row.offAt !== undefined ? (
                      <span className="ctl-countdown tabular-nums">
                        {row.offAt > now ? `auto-off in ${formatAutoOff(row.offAt - now)}` : 'switching off…'}
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

function fromSnapshot(snapshot: LiveSnapshot, offsetMs: number): StationRow {
  return {
    enabled: snapshot.enabled === true,
    state: snapshot.state,
    listeners: Array.isArray(snapshot.listeners) ? snapshot.listeners.length : 0,
    offAt: snapshot.enabled && Number.isFinite(snapshot.enabledUntil) ? (snapshot.enabledUntil as number) - offsetMs : undefined,
  };
}

function fromControl(res: LiveControlResponse, offsetMs: number): StationRow {
  return {
    enabled: res.enabled === true,
    state: res.state,
    listeners: Number.isFinite(res.listeners) ? res.listeners : 0,
    offAt: res.enabled && Number.isFinite(res.enabledUntil) ? (res.enabledUntil as number) - offsetMs : undefined,
  };
}

function stateLabel(row: StationRow): string {
  if (!row.enabled) return 'Off';
  if (row.state === 'on_air') return 'On air';
  if (row.state === 'warming_up') return 'Warming up';
  return 'On, no listeners';
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
