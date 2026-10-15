import type { CSSProperties } from 'react';
import { STATIONS } from '../../shared/stations';
import SpotlightCard from '../components/bits/SpotlightCard';
import { MODELS, VOICE_COUNT } from './data';
import { CountUp } from './CountUp';
import { SectionHead, SpeakerId } from './ui';

const STYLES = ['news_breaking', 'ads', 'stories_dramatic', 'suspense', 'kids', 'reels', 'narration', 'conversational'];

/** One stat on the Bulbul plate; kept separate so a count-up can replace the static value. */
export function Stat({ value, prefix, unit, label }: { value: number; prefix?: string; unit?: string; label: string }) {
  return (
    <div className="lp-stat">
      <dt>{label}</dt>
      <dd>
        <CountUp value={value} prefix={prefix} />
        {unit && <small>{unit}</small>}
      </dd>
    </div>
  );
}

export default function BuiltOnSarvam() {
  return (
    <section className="lp-section lp-sarvam" aria-labelledby="sarvam-title">
      <div className="lp-wrap">
        <SectionHead id="sarvam-title" kicker="Under the hood" title="Built on Sarvam.">
          Four Sarvam models run the station live. Nothing you hear is pre-recorded.
        </SectionHead>

        <SpotlightCard
          className="lp-rack"
          spotlightColor="#f2b25c"
          intensity={0.16}
          spotlightSize={420}
          borderGlow={0.7}
          proximity={120}
          style={{ '--spotlight-card-surface': 'transparent', '--spotlight-card-shadow': 'none', '--spotlight-card-border': 'transparent' } as CSSProperties}
        >
          <span className="lp-screw" aria-hidden="true" />
          <span className="lp-screw" aria-hidden="true" />
          <span className="lp-screw" aria-hidden="true" />
          <span className="lp-screw" aria-hidden="true" />

          <article className="lp-rack-lead">
            <div className="lp-rack-title">
              <h3 className="lp-h3 lp-h3--lg">Bulbul v4 Flash</h3>
              <SpeakerId id="bulbul:v4-flash" />
            </div>
            <p className="lp-rack-job">Every voice on every station, streamed as raw 24 kHz audio into your browser.</p>
            <dl className="lp-stats">
              <Stat value={VOICE_COUNT} label="Personas on air" />
              <Stat value={STATIONS.length} label="Languages" />
              <Stat value={300} prefix="~" unit="ms" label="First audio" />
              <Stat value={2} prefix="~" unit="s" label="Call-in reply" />
            </dl>
            <p className="lp-rack-styles">
              <span>Cast by style</span>
              {STYLES.map((s) => (
                <code key={s}>{s}</code>
              ))}
            </p>
          </article>

          <ul className="lp-rack-rows">
            {MODELS.map((mdl) => (
              <li key={mdl.id}>
                <h3 className="lp-h3">{mdl.name}</h3>
                <p>{mdl.job}</p>
                <SpeakerId id={mdl.id} />
              </li>
            ))}
          </ul>
        </SpotlightCard>
      </div>
    </section>
  );
}
