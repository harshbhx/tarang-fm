import { AnimatePresence, m, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { getStation } from '../../shared/stations';
import ClickSpark from '../components/bits/ClickSpark';
import { BorderBeam } from '../components/bits/MagicUi';
import Magnet from '../components/bits/Magnet';
import { onAppLink } from '../live/ui/navigate';
import { SectionHead, SPARK_COLORS, SpeakerId, type Vars } from './ui';

const EASE = [0.22, 1, 0.36, 1] as const;
const JOIN_AFTER_MS = 1100;
const hindi = getStation('hi');

/** The welcome a new listener hears, the moment they join. */
const WELCOME = {
  name: 'Priya',
  text: 'स्वागत है प्रिया! महफ़िल जम रही है, अब हम 2 लोग साथ हैं।',
  en: 'Welcome, Priya! The party is warming up, now there are 2 of us together.',
};

const POINTS = [
  { title: 'Type your name', body: 'The RJ welcomes you on air within seconds, in the station’s own language.' },
  { title: 'Same line, same moment', body: 'One live show per station. Everyone tuned in hears every line together, on any phone.' },
  { title: 'Starts when you join', body: 'The show goes on air the moment you join, and signs off after 6 minutes or when everyone leaves.' },
];

/**
 * Listen together (beta): one shared live show per station. A sample studio plays out once in view:
 * a second listener joins and the RJ welcomes her on air. The one CTA opens /live in the same tab.
 */
export default function ListenTogether() {
  const stageRef = useRef<HTMLDivElement>(null);
  const seen = useInView(stageRef, { once: true, amount: 0.55 });
  const reduce = useReducedMotion() ?? false;
  const [arrived, setArrived] = useState(false);
  useEffect(() => {
    if (!seen || reduce) return;
    const t = setTimeout(() => setArrived(true), JOIN_AFTER_MS);
    return () => clearTimeout(t);
  }, [seen, reduce]);
  const joined = reduce ? seen : arrived;
  const rj = hindi.cast.rj;
  const rjName = rj.label.split(' · ')[0];

  return (
    <section className="lp-section lp-together" aria-labelledby="together-title">
      <div className="lp-wrap lp-together-grid" style={{ '--st': hindi.accent } as Vars}>
        <div className="lp-together-copy">
          <SectionHead id="together-title" kicker="7:24 PM · Listen together · Beta" title="Listen together.">
            One live show per station, shared by everyone tuned in. Bring the family, the hostel room, the group chat.
          </SectionHead>

          <ol className="lp-together-points">
            {POINTS.map((p, i) => (
              <li key={p.title}>
                <span className="lp-together-num" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="lp-together-point">{p.title}</span>
                  <span className="lp-together-body">{p.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="lp-together-go">
            <Magnet>
              <ClickSpark sparkColor={SPARK_COLORS} sparkCount={10} sparkRadius={34} sparkSize={9} duration={520} glow={0.6} className="lp-spark" style={{ width: 'auto', height: 'auto' }}>
                <a className="lp-cta" href="/live" onClick={onAppLink}>
                  <span className="lp-cta-lamp" aria-hidden="true" />
                  Listen together
                </a>
              </ClickSpark>
            </Magnet>
            <p className="lp-together-trust">Beta. Free, no login. Pick a station, type your name, join.</p>
          </div>
        </div>

        <div ref={stageRef} className="lp-stage lp-together-stage" data-live={joined}>
          {joined && <BorderBeam size={120} duration={9} colorFrom="#ffd38a" colorTo="#ff6b2c" />}
          <div className="lp-stage-top">
            <span className="lp-onair" data-state="live" aria-hidden="true">
              <span className="lp-onair-bulb" />
              On air
            </span>
            <p className="lp-together-station">
              <span lang="hi">{hindi.nativeName}</span> · {hindi.frequency}
            </p>
          </div>

          <div className="lp-together-room">
            <ul className="lp-together-people" aria-label={joined ? 'Listening now: Aarav and Priya' : 'Listening now: Aarav'}>
              <li className="lp-together-face" aria-hidden="true">
                A
              </li>
              <AnimatePresence initial={false}>
                {joined && (
                  <m.li
                    key="priya"
                    className="lp-together-face lp-together-face--new"
                    aria-hidden="true"
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.4, ease: EASE }}
                  >
                    P
                  </m.li>
                )}
              </AnimatePresence>
            </ul>
            <p className="lp-together-count">
              <strong>{joined ? 2 : 1}</strong> listening together
            </p>
            <AnimatePresence initial={false}>
              {joined && (
                <m.p
                  key="joined"
                  className="lp-together-joined"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  Priya joined
                </m.p>
              )}
            </AnimatePresence>
          </div>

          <div className="lp-together-line" data-on={joined}>
            <p className="lp-stage-who">
              <span className="lp-stage-avatar" aria-hidden="true">
                {rjName.charAt(0)}
              </span>
              <span className="lp-stage-name">RJ {rjName}</span>
              <SpeakerId id={rj.speaker} />
            </p>
            <AnimatePresence mode="wait" initial={false}>
              {joined ? (
                <m.div
                  key="welcome"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.35, ease: EASE }}
                >
                  <p className="lp-native" lang="hi">
                    {WELCOME.text}
                  </p>
                  <p className="lp-english">{WELCOME.en}</p>
                </m.div>
              ) : (
                <m.p key="wait" className="lp-together-wait" exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  Waiting for the next listener…
                </m.p>
              )}
            </AnimatePresence>
          </div>

          <div className="lp-together-clock">
            <span className="lp-together-bar" aria-hidden="true">
              <span data-run={seen} />
            </span>
            <p>
              <span>Live since the first listener joined</span>
              <span>Signs off after 6:00</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
