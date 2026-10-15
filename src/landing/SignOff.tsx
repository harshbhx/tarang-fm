import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import StarBorder from '../components/bits/StarBorder';
import { TuneButton, type Vars } from './ui';

/** The sign-off: the station's own words, one button, the five stations, and what it runs on. */
export default function SignOff({ onTuneIn }: { onTuneIn: (id: StationId) => void }) {
  return (
    <section className="lp-section lp-final" aria-labelledby="final-title">
      <div className="lp-wrap lp-final-inner">
        <h2 id="final-title" className="lp-h2 lp-final-title">
          Dil se suniye.
        </h2>
        <p className="lp-sub">Listen with your heart. Pick a station and the show starts right away.</p>
        <StarBorder radius={14} duration={7}>
          <TuneButton onClick={() => onTuneIn('hi')} />
        </StarBorder>
        <div className="lp-pills" role="group" aria-label="Or tune in to a station">
          {STATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="lp-pill"
              style={{ '--st': s.accent } as Vars}
              aria-label={`Tune in to ${s.languageName} ${s.frequency}`}
              onClick={() => onTuneIn(s.id)}
            >
              <span className="lp-pill-lamp" aria-hidden="true" />
              {s.languageName}
              <span className="lp-pill-freq">{s.frequency}</span>
            </button>
          ))}
        </div>
        <p className="lp-models">
          Bulbul v4 Flash speaks · Saaras v4 hears · Sarvam-105B writes
        </p>
      </div>
    </section>
  );
}
