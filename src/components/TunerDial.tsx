import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { Station, StationId } from '../../shared/types';
import { DIAL_MAX, DIAL_MIN, dialPct, nativeLanguage } from './format';

export interface TunerDialProps {
  stations: Station[];
  value: StationId;
  /** Omit for a purely decorative dial */
  onChange?: (id: StationId) => void;
  /** Backlight on (tuned in); off dims the glass */
  lit?: boolean;
  /** Needle hunts and static plays while a station locks in */
  tuning?: boolean;
  /** Shorter glass, e.g. while the show is playing */
  compact?: boolean;
  /** Needle and glow colour; defaults to the selected station's accent */
  accent?: string;
  /** Rendered behind the scale, e.g. a visualizer */
  children?: ReactNode;
  className?: string;
}

const TICKS = Array.from({ length: (DIAL_MAX - DIAL_MIN) * 2 + 1 }, (_, i) => {
  const height = i % 4 === 0 ? 20 : i % 2 === 0 ? 13 : 7;
  return { x: dialPct(DIAL_MIN + i / 2) * 10, height };
});

const NUMERALS = Array.from({ length: (DIAL_MAX - DIAL_MIN) / 2 + 1 }, (_, i) => DIAL_MIN + i * 2);

/**
 * Backlit analogue FM dial. The needle springs between stations; drag or tap the glass to tune
 * (it snaps to the nearest station), or use the arrow keys. Exposed as a slider.
 */
export default function TunerDial({
  stations,
  value,
  onChange,
  lit = true,
  tuning = false,
  compact = false,
  accent,
  children,
  className = '',
}: TunerDialProps) {
  const glassRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const [pending, setPending] = useState<StationId | null>(null);
  const interactive = !!onChange;
  const byFreq = [...stations].sort((a, b) => Number(a.frequency) - Number(b.frequency));

  if (pending && pending === value) setPending(null);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(() => setPending(null), 1500);
    return () => window.clearTimeout(timer);
  }, [pending]);

  const selected = stations.find((s) => s.id === value) ?? stations[0];
  const shown = stations.find((s) => s.id === (pending ?? value)) ?? selected;
  const needle = drag ?? dialPct(Number(shown.frequency));

  const pctAt = (clientX: number) => {
    const rect = glassRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return needle;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    return Math.min(dialPct(DIAL_MAX), Math.max(dialPct(DIAL_MIN), pct));
  };

  const nearest = (pct: number) =>
    stations.reduce((best, s) =>
      Math.abs(dialPct(Number(s.frequency)) - pct) < Math.abs(dialPct(Number(best.frequency)) - pct) ? s : best,
    );

  const choose = (id: StationId) => {
    if (!onChange || id === value) return;
    setPending(id);
    onChange(id);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!interactive || (event.pointerType === 'mouse' && event.button !== 0)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; the drag still works while the pointer stays on the dial.
    }
    setDrag(pctAt(event.clientX));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag !== null) setDrag(pctAt(event.clientX));
  };

  const onPointerUp = () => {
    if (drag === null) return;
    const target = nearest(drag);
    setDrag(null);
    choose(target.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = byFreq.findIndex((s) => s.id === (pending ?? value));
    let next = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(byFreq.length - 1, index + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(0, index - 1);
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = byFreq.length - 1;
    if (next < 0) return;
    event.preventDefault();
    choose(byFreq[next].id);
  };

  const sliderProps = interactive
    ? {
        role: 'slider',
        tabIndex: 0,
        'aria-label': 'Station dial',
        'aria-orientation': 'horizontal' as const,
        'aria-valuemin': DIAL_MIN,
        'aria-valuemax': DIAL_MAX,
        'aria-valuenow': Number(shown.frequency),
        'aria-valuetext': `${shown.languageName}, ${shown.frequency} MHz`,
        onKeyDown,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: () => setDrag(null),
      }
    : { 'aria-hidden': true };

  return (
    <div
      {...sliderProps}
      className={`dial ${className}`}
      data-lit={lit}
      data-tuning={tuning && drag === null}
      data-compact={compact}
      data-dragging={drag !== null}
      style={{ '--needle-x': `${needle}%`, '--accent': accent ?? selected.accent } as CSSProperties}
    >
      <div ref={glassRef} className="dial-glass" aria-hidden="true">
        {children}
        <span className="dial-print left-3">FM</span>
        <span className="dial-print right-3">MHz</span>
        {stations.map((station) => (
          <span
            key={station.id}
            className="dial-station"
            data-on={station.id === shown.id}
            style={{ left: `${dialPct(Number(station.frequency))}%` }}
          >
            <span className="dial-station-name">{station.languageName}</span>
            <span lang={station.language} className="dial-station-native">
              {nativeLanguage(station)}
            </span>
          </span>
        ))}
        <svg className="dial-ticks" viewBox="0 0 1000 20" preserveAspectRatio="none">
          <line
            x1={TICKS[0].x}
            x2={TICKS[TICKS.length - 1].x}
            y1="19.5"
            y2="19.5"
            stroke="currentColor"
            strokeWidth="1.2"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
          {TICKS.map((tick) => (
            <line
              key={tick.x}
              x1={tick.x}
              x2={tick.x}
              y1={20 - tick.height}
              y2="20"
              stroke="currentColor"
              strokeWidth={tick.height === 20 ? 1.6 : 1}
              vectorEffect="non-scaling-stroke"
              opacity={tick.height === 7 ? 0.5 : 0.8}
            />
          ))}
        </svg>
        {NUMERALS.map((n) => (
          <span key={n} className="dial-num" style={{ left: `${dialPct(n)}%` }}>
            {n}
          </span>
        ))}
        <span className="dial-static" />
        <span className="needle" />
      </div>
    </div>
  );
}
