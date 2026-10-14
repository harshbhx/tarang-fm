import { m, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useRef } from 'react';
import { STATIONS } from '../../shared/stations';
import type { Station, StationId } from '../../shared/types';
import { stationIdVoice, TAGLINE_EN, VOICE_GROUPS } from './data';
import { PlayGlyph, SectionHead, SpeakerId, TuneButton, type Vars } from './ui';
import type { VoicePlayer } from './useVoicePlayer';

const F_MIN = 86.5;
const F_MAX = 109.5;
const pos = (f: number) => ((f - F_MIN) / (F_MAX - F_MIN)) * 100;
const SCALE = Array.from({ length: 11 }, (_, i) => 88 + i * 2);
const STACK_ID = 'stack-';

interface CardProps {
  station: Station;
  index: number;
  last: boolean;
  player: VoicePlayer;
  onTuneIn: (id: StationId) => void;
}

/**
 * One station as a card that pins near the top and is covered by the next as you scroll, shrinking and
 * dimming a little underneath it (the idea of Scroll Stack from React Bits). Only transform and opacity
 * move, so the stack costs the compositor and nothing else.
 */
function StationCard({ station, index, last, player, onTuneIn }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  // 0 while this card is pinned and uncovered, 1 once the next card has fully taken its place
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const covered = last || reduce ? null : scrollYProgress;
  const scale = useTransform(covered ?? scrollYProgress, [0, 1], covered ? [1, 0.94] : [1, 1]);
  const dim = useTransform(covered ?? scrollYProgress, [0, 1], covered ? [0, 0.55] : [0, 0]);

  const voices = VOICE_GROUPS.find((g) => g.station.id === station.id)?.voices.length ?? 0;
  const idVoice = stationIdVoice(station.id);
  const sampleId = `${STACK_ID}${station.id}`;
  const phase = player.state.id === sampleId ? (player.state.phase ?? 'idle') : 'idle';
  const busy = phase === 'loading' || phase === 'playing';
  const rj = station.cast.rj;

  return (
    <div ref={ref} className="lp-scard-slot" style={{ '--i': String(index), '--st': station.accent } as Vars}>
      <m.article className="lp-scard" style={{ scale }} aria-labelledby={`scard-${station.id}`}>
        <div className="lp-scard-head">
          <p className="lp-scard-freq">
            {station.frequency}
            <small>MHz</small>
          </p>
          <p className="lp-scard-lang">
            <span className="lp-scard-lamp" aria-hidden="true" />
            {station.languageName}
          </p>
        </div>
        <h3 id={`scard-${station.id}`} className="lp-scard-name" lang={station.language}>
          {station.nativeName}
        </h3>
        <p className="lp-scard-tag">
          <span lang={station.language}>{station.tagline}</span>
          {TAGLINE_EN[station.id] && <span className="lp-scard-tag-en">{TAGLINE_EN[station.id]}</span>}
        </p>
        <div className="lp-scard-scale" aria-hidden="true">
          {SCALE.map((n) => (
            <span key={n} className="lp-scard-tick" style={{ left: `${pos(n)}%` }}>
              {n}
            </span>
          ))}
          <span className="lp-scard-needle" style={{ left: `${pos(Number(station.frequency))}%` }} />
        </div>
        <dl className="lp-scard-facts">
          <div>
            <dt>Voices</dt>
            <dd>{voices}</dd>
          </div>
          <div>
            <dt>RJ</dt>
            <dd>
              {rj.label} <SpeakerId id={rj.speaker} />
            </dd>
          </div>
          <div>
            <dt>Station ID</dt>
            <dd>
              <SpeakerId id={idVoice.speaker} />
            </dd>
          </div>
        </dl>
        <div className="lp-scard-actions">
          <TuneButton onClick={() => onTuneIn(station.id)} label={`Tune in to ${station.languageName}`} />
          <button
            type="button"
            className="lp-ghost lp-ghost--sample"
            data-phase={phase}
            onClick={() =>
              player.toggle({ id: sampleId, station: station.id, speaker: idVoice.speaker, text: idVoice.line.text, pace: idVoice.pace, temperature: idVoice.temperature })
            }
            aria-label={busy ? `Stop the ${station.languageName} station ID` : `Hear the ${station.languageName} station ID`}
          >
            <PlayGlyph phase={phase} size={16} />
            {busy ? 'Stop' : phase === 'error' ? 'Try again' : 'Hear the station ID'}
          </button>
        </div>
        <m.span className="lp-scard-dim" style={{ opacity: dim }} aria-hidden="true" />
      </m.article>
    </div>
  );
}

export default function StationStack({ player, onTuneIn }: { player: VoicePlayer; onTuneIn: (id: StationId) => void }) {
  return (
    <section className="lp-section lp-stack-sec" aria-labelledby="stack-title">
      <div className="lp-wrap">
        <SectionHead id="stack-title" title="Five stations, one dial">
          Each station has its own RJ, newsreader, ad voices and story cast, and runs the same show in its own language. Scroll the stack,
          hear each one announce itself, tune in to the one that sounds like home.
        </SectionHead>
      </div>
      <div className="lp-wrap lp-stack" style={{ '--n': String(STATIONS.length) } as Vars}>
        {STATIONS.map((s, i) => (
          <StationCard key={s.id} station={s} index={i} last={i === STATIONS.length - 1} player={player} onTuneIn={onTuneIn} />
        ))}
      </div>
    </section>
  );
}
