import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { AudioEngine } from '../audio';
import type { StationId } from '../../shared/types';
import './fonts';
import BuiltOnSarvam from './BuiltOnSarvam';
import CallIn from './CallIn';
import { GITHUB_URL } from './data';
import FinalCta from './FinalCta';
import Hero from './Hero';
import { GitHubIcon, WaveMark } from './icons';
import Rundown from './Rundown';
import { useVoicePlayer } from './useVoicePlayer';
import VoiceTuner from './VoiceTuner';
import './landing.css';

interface LandingProps {
  onTuneIn: (station: StationId) => void;
  /** Optional: reuse the radio's engine instead of creating a second AudioContext. */
  engine?: AudioEngine;
}

export default function Landing({ onTuneIn, engine }: LandingProps) {
  const player = useVoicePlayer(engine);

  // Stop any sample and hand over to the radio inside the same click, so audio can start.
  const tune = (id: StationId) => {
    player.stop();
    onTuneIn(id);
  };

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <div className="lp">
          <div className="lp-room" aria-hidden="true" />
          <header className="lp-wrap lp-top">
            <a className="lp-brand" href="#top" aria-label="Tarang FM, back to top">
              <WaveMark size={22} />
              <span className="lp-brand-name">Tarang FM</span>
              <span className="lp-brand-native" lang="hi">
                तरंग
              </span>
            </a>
            <a className="lp-ghost lp-ghost--sm" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <GitHubIcon size={18} />
              GitHub
            </a>
          </header>

          <main id="top">
            <Hero onTuneIn={tune} player={player} />
            <VoiceTuner player={player} />
            <Rundown />
            <CallIn player={player} />
            <BuiltOnSarvam />
            <FinalCta onTuneIn={tune} />
          </main>

          <footer className="lp-foot">
            <div className="lp-wrap lp-foot-inner">
              <p className="lp-foot-lead">
                <WaveMark size={18} />
                Tarang FM, built by Harsh Bhanushali for the Sarvam Bulbul Build Challenge.
              </p>
              <a className="lp-ghost lp-ghost--sm" href={GITHUB_URL} target="_blank" rel="noreferrer">
                <GitHubIcon size={18} />
                Source on GitHub
              </a>
              <p className="lp-foot-note">
                Hosts and stories are AI-generated. Headlines via BBC, Bing News and Google News. Weather by Open-Meteo.
              </p>
            </div>
          </footer>
        </div>
      </LazyMotion>
    </MotionConfig>
  );
}
