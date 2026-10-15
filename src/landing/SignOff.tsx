import { useState } from 'react';
import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import BlurText from '../components/bits/BlurText';
import { BorderBeam } from '../components/bits/MagicUi';
import Magnet from '../components/bits/Magnet';
import StarBorder from '../components/bits/StarBorder';
import { TuneButton, type Vars } from './ui';

/** The printed scale of the dial, 88 to 108 MHz. */
const F_MIN = 87;
const F_MAX = 109;
const at = (f: number) => `${(((f - F_MIN) / (F_MAX - F_MIN)) * 100).toFixed(2)}%`;
const SCALE = [88, 92, 96, 100, 104, 108];
const MINOR = Array.from({ length: 41 }, (_, i) => 88 + i * 0.5);

/** "तरंग हिंदी" → "हिंदी": the station's own name for its language. */
const native = (name: string) => name.replace(/^\S+\s/, '');

/**
 * The sign-off, as the front of a radio: a backlit dial whose needle glides to the station you point at,
 * five preset keys, and one big button that tunes in to whatever the needle is on.
 */
export default function SignOff({ onTuneIn }: { onTuneIn: (id: StationId) => void }) {
  const [sel, setSel] = useState(0);
  const station = STATIONS[sel];

  return (
    <section className="lp-section lp-final" aria-labelledby="final-title">
      <div className="lp-wrap">
        <div className="lp-console" style={{ '--st': station.accent, '--needle': at(Number(station.frequency)) } as Vars}>
          <BorderBeam size={140} duration={9} colorFrom="#ffd38a" colorTo="#ff6b2c" />
          <span className="lp-console-lamp" aria-hidden="true" />

          <div className="lp-console-head">
            <p className="lp-kicker">7:30 PM · Sign-off</p>
            <BlurText as="h2" id="final-title" className="lp-h2 lp-final-title" text="Dil se suniye." delay={110} />
            <p className="lp-console-sub">Listen with your heart. Point at a station, and the show starts the moment you tune in.</p>
          </div>

          <div className="lp-cdial" aria-hidden="true">
            <div className="lp-cdial-glass">
              {MINOR.map((f) => (
                <span key={f} className="lp-cdial-tick" data-major={f % 4 === 0} style={{ left: at(f) }} />
              ))}
              {SCALE.map((f) => (
                <span key={f} className="lp-cdial-num" style={{ left: at(f) }}>
                  {f}
                </span>
              ))}
              {STATIONS.map((s, i) => (
                <span key={s.id} className="lp-cdial-mark" data-on={i === sel} style={{ left: at(Number(s.frequency)), '--st': s.accent } as Vars} />
              ))}
              <span className="lp-cdial-needle" />
            </div>
            <p className="lp-cdial-readout">
              <span className="lp-cdial-native" lang={station.language}>
                {native(station.nativeName)}
              </span>
              <span className="lp-cdial-freq">
                {station.frequency}
                <small>MHz</small>
              </span>
            </p>
          </div>

          <div className="lp-ckeys" role="group" aria-label="Pick a station">
            {STATIONS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="lp-ckey"
                data-on={i === sel}
                style={{ '--st': s.accent } as Vars}
                aria-label={`Tune in to ${s.languageName} ${s.frequency}`}
                onPointerEnter={(e) => e.pointerType === 'mouse' && setSel(i)}
                onFocus={() => setSel(i)}
                onClick={() => onTuneIn(s.id)}
              >
                <span className="lp-ckey-lamp" aria-hidden="true" />
                <span className="lp-ckey-native" lang={s.language}>
                  {native(s.nativeName)}
                </span>
                <span className="lp-ckey-meta">
                  {s.languageName} · {s.frequency}
                </span>
              </button>
            ))}
          </div>

          <div className="lp-console-go">
            <Magnet reach={110} strength={0.28} limit={12}>
              <StarBorder radius={16} duration={6}>
                <TuneButton onClick={() => onTuneIn(station.id)} label={`Tune in to ${station.languageName} ${station.frequency}`} />
              </StarBorder>
            </Magnet>
            <p className="lp-console-trust">No install, no login. Hosts, news and stories are written live.</p>
          </div>

          <p className="lp-models">Bulbul v4 Flash speaks · Saaras v4 hears · Sarvam-105B writes</p>
        </div>
      </div>
    </section>
  );
}
