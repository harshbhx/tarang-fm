import { useRef } from 'react';
import { useReducedMotion } from 'motion/react';
import { useAnalyserLevel } from './useAnalyser';

const SWING = 50; // degrees either side of centre
const MARKS = [-20, -10, -7, -5, -3, -1, 0, 1, 2, 3];
const vuToT = (vu: number) => (vu + 20) / 23; // -20..+3 VU → 0..1
const angle = (t: number) => -SWING + t * SWING * 2;

function polar(deg: number, r: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: 60 + r * Math.cos(rad), y: 66 + r * Math.sin(rad) };
}

/**
 * Analog VU meter on backlit glass. The needle follows the live audio with meter-like
 * ballistics (fast rise, slow fall) and rests on the left stop when nothing plays.
 */
export default function VuMeter({ active, analyser }: { active: boolean; analyser: () => AnalyserNode | null }) {
  const needle = useRef<SVGGElement>(null);
  const peak = useRef<HTMLSpanElement>(null);
  const state = useRef({ value: 0, peakHold: 0 });
  const reduce = useReducedMotion() ?? false;

  useAnalyserLevel(active, analyser, (level) => {
    const s = state.current;
    s.value = level > s.value ? s.value + (level - s.value) * 0.45 : s.value + (level - s.value) * 0.08;
    const shown = reduce ? (level > 0.05 ? 0.62 : 0) : s.value;
    needle.current?.setAttribute('transform', `rotate(${angle(shown).toFixed(2)} 60 66)`);
    if (level > 0.86) s.peakHold = 18;
    else if (s.peakHold > 0) s.peakHold -= 1;
    peak.current?.toggleAttribute('data-on', s.peakHold > 0);
  });

  const arc = (from: number, to: number, r: number) => {
    const a = polar(angle(vuToT(from)), r);
    const b = polar(angle(vuToT(to)), r);
    return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
  };

  return (
    <div className="lp-vu" data-active={active} aria-hidden="true">
      <svg viewBox="0 0 120 74" className="lp-vu-face">
        <path d={arc(-20, 0, 44)} className="lp-vu-arc" />
        <path d={arc(0, 3, 44)} className="lp-vu-arc lp-vu-arc--hot" />
        {MARKS.map((vu) => {
          const deg = angle(vuToT(vu));
          const a = polar(deg, 44);
          const b = polar(deg, vu === 0 || vu === -20 || vu === 3 ? 36 : 39);
          return (
            <line
              key={vu}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={vu > 0 ? 'lp-vu-tick lp-vu-tick--hot' : 'lp-vu-tick'}
            />
          );
        })}
        {[-20, -10, -5, 0, 3].map((vu) => {
          const p = polar(angle(vuToT(vu)), 52);
          return (
            <text key={vu} x={p.x} y={p.y + 2} className={vu > 0 ? 'lp-vu-num lp-vu-num--hot' : 'lp-vu-num'}>
              {vu > 0 ? `+${vu}` : vu}
            </text>
          );
        })}
        <text x="60" y="52" className="lp-vu-label">
          VU
        </text>
        <g ref={needle} transform={`rotate(${-SWING} 60 66)`} className="lp-vu-needle">
          <line x1="60" y1="66" x2="60" y2="16" />
        </g>
        <circle cx="60" cy="66" r="5" className="lp-vu-hub" />
      </svg>
      <span ref={peak} className="lp-vu-peak" />
    </div>
  );
}
