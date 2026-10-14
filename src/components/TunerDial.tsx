import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import type { Station, StationId } from '../../shared/types';
import { DIAL_MAX, DIAL_MIN, dialPct, nativeLanguage } from './format';

/** Pointer and keyboard handlers when the dial is a live control (see RadioDevice). */
export interface DialControl {
  /** Needle follows the pointer (percent of the glass width) */
  onDrag: (pct: number) => void;
  /** Pointer released: snap to the nearest station */
  onRelease: () => void;
  /** Keyboard: step one station, or jump to the ends */
  onStep: (to: -1 | 1 | 'first' | 'last') => void;
}

export interface TunerDialProps {
  stations: Station[];
  /** Station shown as selected (lit mark, accent) */
  value: StationId;
  /** Needle position in percent of the glass; defaults to the selected station */
  pct?: number;
  /** Pointer is moving the needle (no spring) */
  dragging?: boolean;
  /** Backlight on (tuned in); off leaves smoky, unlit glass */
  lit?: boolean;
  /** Warm-up flicker, needle hunting and static while a station locks in */
  tuning?: boolean;
  /** full: idle hero; compact: during a show; mini: sticky bar strip */
  size?: 'full' | 'compact' | 'mini';
  /** Omit for a purely decorative dial */
  control?: DialControl;
  /** Rendered behind the scale, e.g. a visualizer */
  children?: ReactNode;
  className?: string;
}

const TICKS = Array.from({ length: (DIAL_MAX - DIAL_MIN) * 2 + 1 }, (_, i) => {
  const height = i % 4 === 0 ? 20 : i % 2 === 0 ? 12 : 7;
  return { x: dialPct(DIAL_MIN + i / 2) * 10, height };
});

const NUMERALS = Array.from({ length: (DIAL_MAX - DIAL_MIN) / 2 + 1 }, (_, i) => DIAL_MIN + i * 2);

/**
 * Backlit analogue FM dial: smoky glass that warms up to amber when tuned in, a printed scale,
 * station marks and the accent needle. The needle rides `--tune` (0..100), a registered property
 * that springs on change, so the knob and needle move as one mechanism.
 */
export default function TunerDial({
  stations,
  value,
  pct,
  dragging = false,
  lit = true,
  tuning = false,
  size = 'full',
  control,
  children,
  className = '',
}: TunerDialProps) {
  const glassRef = useRef<HTMLDivElement>(null);
  const selected = stations.find((s) => s.id === value) ?? stations[0];
  const needle = pct ?? dialPct(Number(selected.frequency));
  const nearestId = stations.reduce((best, s) =>
    Math.abs(dialPct(Number(s.frequency)) - needle) < Math.abs(dialPct(Number(best.frequency)) - needle) ? s : best,
  ).id;
  const markedId = dragging ? nearestId : selected.id;
  const marked = stations.find((s) => s.id === markedId) ?? selected;

  const pctAt = (clientX: number) => {
    const rect = glassRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return needle;
    const p = ((clientX - rect.left) / rect.width) * 100;
    return Math.min(dialPct(DIAL_MAX), Math.max(dialPct(DIAL_MIN), p));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!control || (event.pointerType === 'mouse' && event.button !== 0)) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best effort; the drag still works while the pointer stays on the dial.
    }
    control.onDrag(pctAt(event.clientX));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!control) return;
    const map: Record<string, -1 | 1 | 'first' | 'last'> = {
      ArrowRight: 1,
      ArrowUp: 1,
      ArrowLeft: -1,
      ArrowDown: -1,
      PageUp: 1,
      PageDown: -1,
      Home: 'first',
      End: 'last',
    };
    const to = map[event.key];
    if (to === undefined) return;
    event.preventDefault();
    control.onStep(to);
  };

  const sliderProps = control
    ? {
        role: 'slider',
        tabIndex: 0,
        'aria-label': 'Station dial',
        'aria-orientation': 'horizontal' as const,
        'aria-valuemin': DIAL_MIN,
        'aria-valuemax': DIAL_MAX,
        'aria-valuenow': Number(marked.frequency),
        'aria-valuetext': `${marked.languageName}, ${marked.frequency} MHz`,
        onKeyDown,
        onPointerDown,
        onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
          if (dragging) control.onDrag(pctAt(event.clientX));
        },
        onPointerUp: () => {
          if (dragging) control.onRelease();
        },
        onPointerCancel: () => {
          if (dragging) control.onRelease();
        },
      }
    : { 'aria-hidden': true };

  return (
    <div
      {...sliderProps}
      className={`dial ${className}`}
      data-size={size}
      data-lit={lit}
      data-tuning={tuning && !dragging}
      data-dragging={dragging}
      style={{ '--tune': needle, '--accent': selected.accent } as CSSProperties}
    >
      <div ref={glassRef} className="dial-glass" aria-hidden="true">
        <span className="dial-backlight" />
        {children}
        {size === 'mini' ? null : (
          <>
            <span className="dial-print dial-print-l">FM</span>
            <span className="dial-print dial-print-r">MHz</span>
          </>
        )}
        {stations.map((station) => (
          <span
            key={station.id}
            className="dial-station"
            data-on={station.id === markedId}
            style={{ left: `${dialPct(Number(station.frequency))}%`, '--mark': station.accent } as CSSProperties}
          >
            <span className="dial-station-name">{station.languageName}</span>
            {size === 'full' ? (
              <span lang={station.language} className="dial-station-native">
                {nativeLanguage(station)}
              </span>
            ) : null}
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
              opacity={tick.height === 7 ? 0.5 : 0.85}
            />
          ))}
        </svg>
        {size === 'mini'
          ? null
          : NUMERALS.map((n) => (
              <span key={n} className="dial-num" style={{ left: `${dialPct(n)}%` }}>
                {n}
              </span>
            ))}
        <span className="dial-static" />
        <span className="needle-track">
          <span className="needle-spill" />
          <span className="needle" />
        </span>
        <span className="dial-glare" />
      </div>
    </div>
  );
}
