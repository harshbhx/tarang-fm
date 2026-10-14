import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useInView, useReducedMotion } from 'motion/react';
import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import { TAGLINE_EN } from './data';
import { WaveMark } from './icons';

const F_MIN = 86.5;
const F_MAX = 109.5;
const NEEDLE_MS = 1300;
const DWELL_MS = 2600;
const FIRST_SWEEP_MS = 900;

const pos = (f: number) => ((f - F_MIN) / (F_MAX - F_MIN)) * 100;
const TICKS = Array.from({ length: 41 }, (_, i) => 88 + i * 0.5);
const NUMBERS = Array.from({ length: 11 }, (_, i) => 88 + i * 2);

type Vars = CSSProperties & Record<`--${string}`, string>;

export default function RadioDial({ onTuneIn }: { onTuneIn: (id: StationId) => void }) {
  const reduce = useReducedMotion() ?? false;
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, { amount: 0.35 });
  const [pageVisible, setPageVisible] = useState(true);
  const [target, setTarget] = useState(reduce ? 0 : -1);
  const [hover, setHover] = useState<number | null>(null);
  const [locked, setLocked] = useState(reduce);
  const shown = hover ?? target;

  useEffect(() => {
    const onChange = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  useEffect(() => {
    if (target !== -1) return;
    const t = setTimeout(() => setTarget(0), reduce ? 0 : FIRST_SWEEP_MS);
    return () => clearTimeout(t);
  }, [target, reduce]);

  useEffect(() => {
    if (shown < 0) return;
    if (reduce) {
      setLocked(true);
      return;
    }
    setLocked(false);
    const t = setTimeout(() => setLocked(true), NEEDLE_MS);
    return () => clearTimeout(t);
  }, [shown, reduce]);

  useEffect(() => {
    if (reduce || !locked || hover !== null || !inView || !pageVisible) return;
    const t = setTimeout(() => setTarget((i) => (i + 1) % STATIONS.length), DWELL_MS);
    return () => clearTimeout(t);
  }, [reduce, locked, hover, inView, pageVisible]);

  const station = shown >= 0 ? STATIONS[shown] : null;
  const freq = station ? Number(station.frequency) : 88;
  const x = pos(freq);
  const onAir = locked && station !== null;

  const release = (i: number) => {
    setHover(null);
    setTarget(i);
  };

  const rootStyle: Vars = {
    '--lp-tuned': station?.accent ?? '#f0b45e',
    '--lp-x': `${x}%`,
    '--lp-knob': `${(x - 50) * 2.6}deg`,
  };

  return (
    <div ref={rootRef} className="lp-radio" style={rootStyle} data-locked={onAir}>
      <div className="lp-radio-top">
        <span className="lp-onair" data-on={onAir} aria-hidden="true">
          ON AIR
        </span>
        <span className="lp-maker">
          <WaveMark size={14} />
          Powered by Sarvam Bulbul v4 Flash
        </span>
      </div>

      <div className="lp-glass" aria-hidden="true">
        <div className="lp-glass-light" />
        {NUMBERS.map((n) => (
          <span key={n} className="lp-num" data-major={n % 4 === 0} style={{ left: `${pos(n)}%` }}>
            {n}
          </span>
        ))}
        <svg className="lp-ticks" viewBox="0 0 1000 100" preserveAspectRatio="none">
          {TICKS.map((f) => {
            const even = f % 2 === 0;
            const whole = Number.isInteger(f);
            const y1 = even ? 0 : whole ? 28 : 52;
            return (
              <line
                key={f}
                x1={pos(f) * 10}
                x2={pos(f) * 10}
                y1={y1}
                y2={100}
                strokeWidth={even ? 1.6 : 1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        {STATIONS.map((s) => (
          <span
            key={s.id}
            className="lp-mark"
            data-on={onAir && station?.id === s.id}
            lang={s.language}
            style={{ left: `${pos(Number(s.frequency))}%`, '--st': s.accent } as Vars}
          >
            {s.nativeName.split(' ')[1] ?? s.nativeName}
          </span>
        ))}
        <span className="lp-glass-unit lp-glass-unit--l">FM</span>
        <span className="lp-glass-unit lp-glass-unit--r">MHz</span>
        <div className="lp-needle-track">
          <span className="lp-needle-glow" />
          <span className="lp-needle" />
        </div>
        <div className="lp-glass-sheen" />
      </div>

      <div className="lp-readout" aria-hidden="true">
        <span className="lp-readout-freq">
          {station ? station.frequency : '88.0'}
          <small>MHz</small>
        </span>
        <span className="lp-readout-text">
          <span className="lp-readout-name" lang={station?.language}>
            {station ? station.nativeName : 'Warming up'}
          </span>
          <span className="lp-readout-tag">{station ? TAGLINE_EN[station.id] : 'Finding a station'}</span>
        </span>
      </div>

      <div className="lp-grille" aria-hidden="true" />

      <div className="lp-controls">
        <div className="lp-presets" role="group" aria-label="Tune in to a station">
          {STATIONS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className="lp-preset"
              data-active={shown === i}
              style={{ '--st': s.accent } as Vars}
              aria-label={`Tune in to ${s.languageName} ${s.frequency}`}
              onClick={() => onTuneIn(s.id)}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && release(i)}
              onFocus={() => setHover(i)}
              onBlur={() => release(i)}
            >
              <span className="lp-preset-lamp" />
              <span className="lp-preset-name">{s.languageName}</span>
              <span className="lp-preset-freq">{s.frequency}</span>
            </button>
          ))}
        </div>
        <span className="lp-knob" aria-hidden="true">
          <span className="lp-knob-cap" />
        </span>
      </div>
    </div>
  );
}
