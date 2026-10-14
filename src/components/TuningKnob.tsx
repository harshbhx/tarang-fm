import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import type { Station } from '../../shared/types';
import type { DialControl } from './TunerDial';
import { DIAL_MAX, DIAL_MIN } from './format';

interface TuningKnobProps {
  /** Needle position (percent of the glass), shared with the dial */
  pct: number;
  dragging: boolean;
  /** Station the needle points at (for the slider's value) */
  station: Station;
  control: DialControl;
  className?: string;
}

/** Percent of dial travel per pixel of drag */
const DRAG_GAIN = 0.32;
const WHEEL_GAP_MS = 260;

/**
 * Machined rotary tuning knob. Drag (any direction: right/up tunes up), scroll the wheel
 * or use the arrow keys; it shares `--tune` with the needle, so both spring together and
 * snap to the nearest station on release.
 */
export default function TuningKnob({ pct, dragging, station, control, className = '' }: TuningKnobProps) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; pct: number } | null>(null);
  const controlRef = useRef(control);

  useEffect(() => {
    controlRef.current = control;
  });

  // Wheel needs a non-passive listener to keep the page from scrolling while tuning.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const now = performance.now();
      if (now - last < WHEEL_GAP_MS || Math.abs(event.deltaY) + Math.abs(event.deltaX) < 2) return;
      last = now;
      const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? -event.deltaY : event.deltaX;
      controlRef.current.onStep(delta > 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Best effort.
    }
    start.current = { x: event.clientX, y: event.clientY, pct };
    control.onDrag(pct);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const from = start.current;
    if (!from) return;
    const delta = event.clientX - from.x - (event.clientY - from.y);
    control.onDrag(Math.min(96, Math.max(4, from.pct + delta * DRAG_GAIN)));
  };

  const end = () => {
    if (!start.current) return;
    start.current = null;
    control.onRelease();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  return (
    <div className={`knob-well ${className}`}>
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Tuning knob"
        aria-valuemin={DIAL_MIN}
        aria-valuemax={DIAL_MAX}
        aria-valuenow={Number(station.frequency)}
        aria-valuetext={`${station.languageName}, ${station.frequency} MHz`}
        className="knob"
        data-dragging={dragging}
        style={{ '--tune': pct } as CSSProperties}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
        onKeyDown={onKeyDown}
      >
        <span className="knob-skirt" aria-hidden="true" />
        <span className="knob-cap" aria-hidden="true">
          <span className="knob-mark" />
        </span>
      </div>
      <span className="knob-label" aria-hidden="true">
        Tune
      </span>
    </div>
  );
}
