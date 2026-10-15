import { useState } from 'react';
import { m } from 'motion/react';
import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import Magnet from '../components/bits/Magnet';
import ProximityText from '../components/bits/ProximityText';
import Tilt from '../components/bits/Tilt';
import { onAppLink } from '../live/ui/navigate';
import { stationIdVoice } from './data';
import RadioSet, { HERO_SAMPLE_PREFIX } from './RadioSet';
import { TextSwap } from './TextSwap';
import { TuneButton } from './ui';
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
        <ProximityText text="AI radio, in" radius={120} from={{ wght: 650, wdth: 86 }} to={{ wght: 800, wdth: 110 }} />{' '}
        <TextSwap className="lp-swap" text={`${language ?? 'your language'}.`} />
      </span>
    </h1>
  );
}

/** One idea, one object: the radio. Presets play a station's ID; the single button tunes in to the one on the dial. */
export default function Hero({ onTuneIn, player }: { onTuneIn: (id: StationId) => void; player: VoicePlayer }) {
  const [dial, setDial] = useState(0);
  const [presented, setPresented] = useState(-1);
  const station = STATIONS[dial];
  const sampleId = `${HERO_SAMPLE_PREFIX}${station.id}`;
  const phase = player.state.id === sampleId ? (player.state.phase ?? 'idle') : 'idle';

  const play = (index: number) => {
    setDial(index);
    const s = STATIONS[index];
    const v = stationIdVoice(s.id);
    player.toggle({ id: `${HERO_SAMPLE_PREFIX}${s.id}`, station: s.id, speaker: v.speaker, text: v.line.text, pace: v.pace, temperature: v.temperature });
  };

  return (
    <section className="lp-wrap lp-hero" aria-labelledby="hero-title">
      <div className="lp-hero-copy">
        <m.div {...rise(0)}>
          <HeroHeadline language={presented >= 0 ? STATIONS[presented].languageName : null} />
        </m.div>
        <m.p className="lp-lede" {...rise(0.08)}>
          A live show in five Indian languages, written and voiced the moment you tune in. Call in, and the RJ answers.
        </m.p>
        <m.div className="lp-hero-actions" {...rise(0.16)}>
          <Magnet>
            <TuneButton onClick={() => onTuneIn(station.id)} />
          </Magnet>
        </m.div>
        <m.p className="lp-trust" {...rise(0.22)}>
          No install, no login. Starts on {station.languageName} {station.frequency}. Press a preset to hear a station.
        </m.p>
        <m.a className="lp-hero-live" href="/live" onClick={onAppLink} {...rise(0.28)}>
          <span className="lp-hero-live-dot" aria-hidden="true" />
          <span className="lp-hero-live-name">Listen together</span>
          <span className="lp-beta">Beta</span>
          <span className="lp-hero-live-sub">one live show, everyone in sync</span>
          <span className="lp-hero-live-arrow" aria-hidden="true">
            →
          </span>
        </m.a>
      </div>
      <m.div className="lp-hero-visual" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.1, ease: EASE }}>
        <Tilt max={3.5}>
          <RadioSet dial={dial} onDial={setDial} onPlay={play} player={player} onPresent={setPresented} />
        </Tilt>
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
