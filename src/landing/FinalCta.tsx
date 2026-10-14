import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import BlurText from '../components/bits/BlurText';
import { TuneButton, type Vars } from './ui';

export default function FinalCta({ onTuneIn }: { onTuneIn: (id: StationId) => void }) {
  return (
    <section className="lp-section lp-final" aria-labelledby="final-title">
      <div className="lp-wrap lp-final-inner">
        <BlurText as="h2" id="final-title" className="lp-h2 lp-final-title" text="Dil se suniye." delay={120} />
        <p className="lp-sub">Listen with your heart. Pick a station and the show starts right away.</p>
        <TuneButton onClick={() => onTuneIn('hi')} />
        <div className="lp-final-stations" role="group" aria-label="Or tune in to a station">
          {STATIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="lp-station"
              style={{ '--st': s.accent } as Vars}
              aria-label={`Tune in to ${s.languageName} ${s.frequency}`}
              onClick={() => onTuneIn(s.id)}
            >
              <span className="lp-station-lamp" aria-hidden="true" />
              {s.languageName}
              <span className="lp-station-freq">{s.frequency}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
