import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import type { AudioEngine } from '../audio';
import type { StationId } from '../../shared/types';
import './fonts';
import { STATIONS } from '../../shared/stations';
import { onAppLink } from '../live/ui/navigate';
import { GITHUB_URL } from './data';
import DialBand from './DialBand';
import Evening from './Evening';
import Hero from './Hero';
import { GitHubIcon, WaveMark } from './icons';
import SignOff from './SignOff';
import Stations from './Stations';
import TalkBack from './TalkBack';
import { useVoicePlayer } from './useVoicePlayer';
import './landing.css';

interface LandingProps {
  onTuneIn: (station: StationId) => void;
  /** Optional: reuse the radio's engine instead of creating a second AudioContext. */
  engine?: AudioEngine;
}

/** The dial band under the hero: every station in its own script, like the printed scale of a radio. */
const STATION_BAND = STATIONS.map((s) => `${s.nativeName.replace(/^\S+\s/, '')} ${s.frequency}`).join('  ✦  ') + '  ✦  ';

/**
 * One evening on the radio, in five screens: the radio, the show, talking back, the five stations, the
 * sign-off. One idea per screen, one visual, one interaction at most.
 */
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
            <DialBand text={STATION_BAND} label={`Five stations: ${STATIONS.map((s) => `${s.languageName} ${s.frequency}`).join(', ')}`} speed={0.45} scrollBoost={0.06} />
            <Evening player={player} />
            <TalkBack player={player} />
            <Stations player={player} onTuneIn={tune} />
            <SignOff onTuneIn={tune} />
          </main>

          <footer className="lp-foot">
            <div className="lp-wrap lp-foot-inner">
              <p className="lp-foot-lead">
                <WaveMark size={18} />
                Tarang FM, built by Harsh Bhanushali for the Sarvam Bulbul Build Challenge.
              </p>
              <nav className="lp-foot-links" aria-label="More">
                <a className="lp-ghost lp-ghost--sm" href="/live" onClick={onAppLink}>
                  Listen together · beta
                </a>
                <a className="lp-ghost lp-ghost--sm" href={GITHUB_URL} target="_blank" rel="noreferrer">
                  <GitHubIcon size={18} />
                  Source on GitHub
                </a>
              </nav>
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
