import { useState } from 'react';
import { m } from 'motion/react';
import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import { onAppLink } from '../live/ui/navigate';
import { STATION_COUNT_WORD, VOICE_COUNT, stationIdVoice } from './data';
import RadioSet, { HERO_SAMPLE_PREFIX } from './RadioSet';
import { TextSwap } from './TextSwap';
import { PlayGlyph, StudioCall, TuneButton } from './ui';
import type { VoicePlayer } from './useVoicePlayer';

const EASE = [0.22, 1, 0.36, 1] as const;
const rise = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, delay, ease: EASE },
});

/**
 * The last words follow the dial: while the needle sweeps (or a preset is pointed at)
 * they name that station's language, then settle back on "your language".
 */
export function HeroHeadline({ language }: { language: string | null }) {
  return (
    <h1 id="hero-title" className="lp-h1">
      <span className="lp-sr">AI radio, in your language.</span>
      <span aria-hidden="true">
        AI radio, in <TextSwap className="lp-swap" text={`${language ?? 'your language'}.`} />
      </span>
    </h1>
  );
}

export default function Hero({ onTuneIn, player }: { onTuneIn: (id: StationId) => void; player: VoicePlayer }) {
  const [dial, setDial] = useState(0);
  const [presented, setPresented] = useState(-1);
  const station = STATIONS[dial];
  const sampleId = `${HERO_SAMPLE_PREFIX}${station.id}`;
  const phase = player.state.id === sampleId ? (player.state.phase ?? 'idle') : 'idle';
  const busy = phase === 'loading' || phase === 'playing';

  const playSample = () => {
    const v = stationIdVoice(station.id);
    player.toggle({
      id: sampleId,
      station: station.id,
      speaker: v.speaker,
      text: v.line.text,
      pace: v.pace,
      temperature: v.temperature,
    });
  };

  return (
    <section className="lp-wrap lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-copy">
        <m.div {...rise(0)}>
          <HeroHeadline language={presented >= 0 ? STATIONS[presented].languageName : null} />
        </m.div>
        <m.p className="lp-lede" {...rise(0.08)}>
          A live show in {STATION_COUNT_WORD} Indian languages, voiced by {VOICE_COUNT} Sarvam Bulbul v4 Flash personas.
          Call in, and the RJ answers.
        </m.p>
        <m.div className="lp-hero-actions" {...rise(0.16)}>
          <TuneButton onClick={() => onTuneIn('hi')} />
          <button
            type="button"
            className="lp-ghost lp-ghost--sample"
            data-phase={phase}
            onClick={playSample}
            aria-label={busy ? 'Stop sample' : `Hear a sample, ${station.languageName} ${station.frequency}`}
          >
            <PlayGlyph phase={phase} size={16} />
            {busy ? 'Stop sample' : 'Hear a sample'}
          </button>
        </m.div>
        <m.p className="lp-trust" {...rise(0.22)}>
          No install, no login. Starts on Hindi 91.1.
        </m.p>
        <m.a className="lp-ghost lp-ghost--sm mt-3" href="/live" onClick={onAppLink} {...rise(0.25)}>
          Listen together · beta
        </m.a>
        <m.div className="lp-hero-phone" {...rise(0.28)}>
          <StudioCall />
        </m.div>
      </div>
      <m.div
        className="lp-hero-visual"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
      >
        <RadioSet dial={dial} onDial={setDial} onTuneIn={onTuneIn} player={player} onPresent={setPresented} />
      </m.div>
      <p className="lp-sr" aria-live="polite">
        {phase === 'loading'
          ? 'Connecting to Bulbul.'
          : phase === 'playing'
            ? `Playing the ${station.languageName} station ID.`
            : phase === 'error'
              ? player.state.error
              : ''}
      </p>
    </section>
  );
}
