import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import { lazy, Suspense } from 'react';
import type { AudioEngine } from '../audio';
import type { StationId } from '../../shared/types';
import './fonts';
import { STATIONS } from '../../shared/stations';
import { onAppLink } from '../live/ui/navigate';
import ScrollProgress from '../components/bits/ScrollProgress';
import TextReveal from '../components/bits/TextReveal';
import BuiltOnSarvam from './BuiltOnSarvam';
import { GITHUB_URL, MANIFESTO, MANIFESTO_ACCENT } from './data';
import DialBand from './DialBand';
import Evening from './Evening';
import Hero from './Hero';
import { GitHubIcon, WaveMark } from './icons';
import ListenTogether from './ListenTogether';
import SignOff from './SignOff';
import StationStack from './StationStack';
import TalkBack from './TalkBack';
import { useVoicePlayer } from './useVoicePlayer';
import VoiceTuner from './VoiceTuner';
import './landing.css';

interface LandingProps {
  onTuneIn: (station: StationId) => void;
  /** Optional: reuse the radio's engine instead of creating a second AudioContext. */
  engine?: AudioEngine;
}

/** The hero's WebGL waves are decoration, so they load after the page itself. */
const Threads = lazy(() => import('../components/bits/Threads'));

/** The dial band under the hero: every station in its own script, like the printed scale of a radio. */
const STATION_BAND = STATIONS.map((s) => `${s.nativeName.replace(/^\S+\s/, '')} ${s.frequency}`).join('  ✦  ') + '  ✦  ';

/**
 * One evening on the radio: the radio, tonight's show, the five stations and their voices, talking back,
 * listening together, what runs it, and the sign-off.
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
          <ScrollProgress color="#f2b25c" />
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
            <div className="lp-hero-stage">
              <div className="lp-hero-waves" aria-hidden="true">
                <Suspense fallback={null}>
                  <Threads
                    color="#f2b25c"
                    accentColor="#ff6b2c"
                    lineCount={30}
                    amplitude={1.1}
                    distance={0.32}
                    thickness={0.5}
                    speed={0.32}
                    angle={-8}
                    brightness={0.9}
                    opacity={0.55}
                    fade={0.35}
                    seed={7}
                  />
                </Suspense>
              </div>
              <Hero onTuneIn={tune} player={player} />
            </div>
            <DialBand text={STATION_BAND} label={`Five stations: ${STATIONS.map((s) => `${s.languageName} ${s.frequency}`).join(', ')}`} speed={0.6} scrollBoost={0.12} />
            <Evening player={player} />
            <StationStack player={player} onTuneIn={tune} />
            <VoiceTuner player={player} />
            <TalkBack player={player} />
            <ListenTogether />
            <BuiltOnSarvam />
            <TextReveal className="lp-manifesto" text={MANIFESTO} accent={MANIFESTO_ACCENT} run={1.2}>
              <span className="lp-manifesto-lamp" aria-hidden="true" />
            </TextReveal>
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
