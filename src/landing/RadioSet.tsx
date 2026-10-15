import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { STATIONS } from '../../shared/stations';
import { TAGLINE_EN } from './data';
import { WaveMark } from './icons';
import type { Vars } from './ui';
import type { VoicePlayer } from './useVoicePlayer';
import VuMeter from './VuMeter';

const F_MIN = 86.5;
const F_MAX = 109.5;
const pos = (f: number) => ((f - F_MIN) / (F_MAX - F_MIN)) * 100;
const TICKS = Array.from({ length: 41 }, (_, i) => 88 + i * 0.5);
const NUMBERS = Array.from({ length: 11 }, (_, i) => 88 + i * 2);

/** Power-on: the needle hunts to the top of the band, back through the middle, and settles on the first station. Runs once. */
const SWEEP = [...new Set([STATIONS.length - 1, Math.floor(STATIONS.length / 2), 0])];
const WARM_MS = 650;
const STEP_MS = 1450;

export const HERO_SAMPLE_PREFIX = 'hero-';

interface RadioSetProps {
  /** Station shown on the dial once the power-on sweep is done. */
  dial: number;
  onDial: (index: number) => void;
  /** A preset key was pressed: play that station's ID (and point the dial at it) */
  onPlay: (index: number) => void;
  player: VoicePlayer;
  /** Called with the station index the dial is presenting (sweep or hover), or -1 when at rest. */
  onPresent?: (index: number) => void;
}

/**
 * The hero object: a graphite radio with an amber backlit dial, VU meter, speaker grille,
 * tuning knob and mechanical preset keys. Preset keys play that station's ID; the knob only turns the dial.
 */
export default function RadioSet({ dial, onDial, onPlay, player, onPresent }: RadioSetProps) {
  const reduce = useReducedMotion() ?? false;
  const [step, setStep] = useState(reduce ? SWEEP.length : -1);
  const [hover, setHover] = useState<number | null>(null);
  const sweeping = step < SWEEP.length;

  useEffect(() => {
    if (!sweeping) return;
    const t = setTimeout(() => setStep((s) => s + 1), step < 0 ? WARM_MS : STEP_MS);
    return () => clearTimeout(t);
  }, [step, sweeping]);

  const { id, phase } = player.state;
  const heroSample = id?.startsWith(HERO_SAMPLE_PREFIX) ?? false;
  const sampleIndex = heroSample ? STATIONS.findIndex((s) => `${HERO_SAMPLE_PREFIX}${s.id}` === id) : -1;

  let shown = hover ?? (sweeping ? (step < 0 ? -1 : SWEEP[step]) : dial);
  if (sampleIndex >= 0) shown = sampleIndex;
  const station = shown >= 0 ? STATIONS[shown] : null;
  const presenting = sweeping || hover !== null ? shown : -1;

  useEffect(() => {
    onPresent?.(presenting);
  }, [presenting, onPresent]);
  const x = pos(station ? Number(station.frequency) : 88);
  const live = phase === 'playing';
  const lamp = live && heroSample ? 'live' : station && !sweeping ? 'standby' : 'off';

  const lastId = station ? `${HERO_SAMPLE_PREFIX}${station.id}` : '';
  const ttfa = player.state.ttfa[lastId];
  let status = station ? (TAGLINE_EN[station.id] ?? station.tagline) : 'Warming up';
  if (heroSample && phase === 'loading') status = 'Calling Bulbul v4 Flash…';
  else if (heroSample && phase === 'playing') status = `On air: ${station?.cast.station_id.speaker ?? ''}`;
  else if (heroSample && phase === 'error') status = player.state.error ?? 'No signal. Try again.';
  else if (ttfa !== undefined && !sweeping) status = `First audio in ${ttfa} ms`;

  const turn = () => {
    setStep(SWEEP.length);
    setHover(null);
    onDial((dial + 1) % STATIONS.length);
  };

  const style: Vars = {
    '--lp-tuned': station?.accent ?? '#f2b25c',
    '--lp-x': `${x}%`,
    '--lp-knob': `${((x - 50) * 2.4).toFixed(1)}deg`,
  };

  return (
    <div className="lp-radio" style={style} data-warm={step >= 0} data-live={live}>
      <div className="lp-radio-strip">
        <span className="lp-onair" data-state={lamp} aria-hidden="true">
          <span className="lp-onair-bulb" />
          On air
        </span>
        <span className="lp-plate-name" aria-hidden="true">
          <WaveMark size={14} />
          Tarang <span>Bulbul v4 Flash</span>
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
            return (
              <line
                key={f}
                x1={pos(f) * 10}
                x2={pos(f) * 10}
                y1={even ? 0 : whole ? 34 : 58}
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
            data-on={station?.id === s.id}
            style={{ left: `${pos(Number(s.frequency))}%`, '--st': s.accent } as Vars}
          >
            {s.languageName}
          </span>
        ))}
        <span className="lp-glass-unit">MHz</span>
        <div className="lp-needle-run">
          <span className="lp-needle" />
        </div>
        <div className="lp-glass-sheen" />
      </div>

      <div className="lp-radio-mid">
        <VuMeter active={live} analyser={player.analyser} />
        <div className="lp-readout" aria-hidden="true">
          <span className="lp-readout-freq">
            {station ? station.frequency : '88.0'}
            <small>MHz</small>
          </span>
          <span className="lp-readout-name" lang={station?.language}>
            {station ? station.nativeName : 'Tarang FM'}
          </span>
          <span className="lp-readout-status" data-kind={ttfa !== undefined && !live ? 'ttfa' : undefined}>
            {status}
          </span>
        </div>
        <div className="lp-grille" aria-hidden="true" />
        <button type="button" className="lp-knob" onClick={turn} aria-label="Turn the dial to the next station">
          <span className="lp-knob-cap" />
        </button>
      </div>

      <div className="lp-presets" role="group" aria-label="Hear a station">
        {STATIONS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className="lp-preset"
            data-active={shown === i}
            style={{ '--st': s.accent } as Vars}
            aria-label={`${live && sampleIndex === i ? 'Stop' : 'Play'} the ${s.languageName} ${s.frequency} station ID`}
            aria-pressed={live && sampleIndex === i}
            onClick={() => onPlay(i)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(i)}
            onPointerLeave={(e) => e.pointerType === 'mouse' && setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          >
            <span className="lp-preset-lamp" />
            <span className="lp-preset-name">{s.languageName}</span>
            <span className="lp-preset-freq">{s.frequency}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
