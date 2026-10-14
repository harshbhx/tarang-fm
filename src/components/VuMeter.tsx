interface VuMeterProps {
  /** Which loop channel drives the needle: `--vu-l` or `--vu-r` */
  channel: 'l' | 'r';
  /** Backlight on */
  lit: boolean;
  className?: string;
}

// Scale marks from -20 to +3 VU, as needle fractions 0..1 (0 VU at 0.75).
const MARKS = [
  { at: 0, label: '20' },
  { at: 0.24, label: '10' },
  { at: 0.42, label: '7' },
  { at: 0.56, label: '5' },
  { at: 0.66, label: '3' },
  { at: 0.75, label: '0' },
  { at: 0.87, label: '+2' },
  { at: 1, label: '+3' },
];
const SWEEP = 100; // degrees, -50..+50
const CX = 60;
const CY = 66;
const R = 46;

function polar(fraction: number, radius: number): [number, number] {
  const angle = ((fraction - 0.5) * SWEEP * Math.PI) / 180;
  return [CX + radius * Math.sin(angle), CY - radius * Math.cos(angle)];
}

function arc(from: number, to: number, radius: number): string {
  const [x1, y1] = polar(from, radius);
  const [x2, y2] = polar(to, radius);
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

/**
 * Analogue VU meter: backlit amber face, printed scale with a red zone, and a needle that
 * rotates with the audio loop's channel level (transform only, no React updates).
 */
export default function VuMeter({ channel, lit, className = '' }: VuMeterProps) {
  return (
    <div className={`vu ${className}`} data-lit={lit} data-channel={channel} aria-hidden="true">
      <span className="vu-backlight" />
      <svg className="vu-scale" viewBox="0 0 120 72">
        <path d={arc(0, 0.75, R)} fill="none" stroke="currentColor" strokeWidth="1" />
        <path d={arc(0.75, 1, R)} fill="none" stroke="var(--tfm-vu-red)" strokeWidth="3" />
        {MARKS.map((mark) => {
          const [x1, y1] = polar(mark.at, R);
          const [x2, y2] = polar(mark.at, R + 5);
          const [tx, ty] = polar(mark.at, R + 12);
          const red = mark.at > 0.75;
          return (
            <g key={mark.label}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={red ? 'var(--tfm-vu-red)' : 'currentColor'} strokeWidth="1.2" />
              <text
                x={tx}
                y={ty}
                fill={red ? 'var(--tfm-vu-red)' : 'currentColor'}
                fontSize="7"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {mark.label}
              </text>
            </g>
          );
        })}
        <text x={CX} y={CY - 18} fontSize="9" fontWeight="700" textAnchor="middle" fill="currentColor" className="vu-word">
          VU
        </text>
      </svg>
      <span className="vu-needle" data-pulse={`vu-${channel}`} />
      <span className="vu-pivot" />
      <span className="vu-glare" />
    </div>
  );
}
