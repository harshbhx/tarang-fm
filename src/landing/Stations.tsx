import { STATIONS } from '../../shared/stations';
import type { StationId } from '../../shared/types';
import { stationIdVoice, TAGLINE_EN, VOICE_COUNT, VOICE_GROUPS } from './data';
import { PlayGlyph, SectionHead, type Vars } from './ui';
import type { VoicePlayer } from './useVoicePlayer';

const ID_PREFIX = 'station-';

/**
 * Five stations as five lines of type on the one light page of the site, like the printed scale of a dial:
 * the native name, the frequency, the voices, and the station announcing itself in its own voice.
 */
export default function Stations({ player, onTuneIn }: { player: VoicePlayer; onTuneIn: (id: StationId) => void }) {
  return (
    <section className="lp-section lp-light lp-stations-sec" aria-labelledby="stations-title">
      <div className="lp-wrap">
        <SectionHead id="stations-title" kicker="Five stations, one dial" title={`Five languages. ${VOICE_COUNT === 27 ? 'Twenty-seven' : VOICE_COUNT} voices.`}>
          Each station has its own RJ, newsreader, ad voices and story cast. Tap one to hear it introduce itself.
        </SectionHead>
        <ol className="lp-stations">
          {STATIONS.map((s) => {
            const sampleId = `${ID_PREFIX}${s.id}`;
            const phase = player.state.id === sampleId ? (player.state.phase ?? 'idle') : 'idle';
            const busy = phase === 'loading' || phase === 'playing';
            const voices = VOICE_GROUPS.find((g) => g.station.id === s.id)?.voices.length ?? 0;
            const idVoice = stationIdVoice(s.id);
            return (
              <li key={s.id} className="lp-station-row" data-phase={phase} style={{ '--st': s.accent } as Vars}>
                <button
                  type="button"
                  className="lp-station-play"
                  data-phase={phase}
                  onClick={() => player.toggle({ id: sampleId, station: s.id, speaker: idVoice.speaker, text: idVoice.line.text, pace: idVoice.pace, temperature: idVoice.temperature })}
                  aria-label={busy ? `Stop the ${s.languageName} station ID` : `Hear the ${s.languageName} ${s.frequency} station ID`}
                >
                  <PlayGlyph phase={phase} size={18} />
                </button>
                <span className="lp-station-native" lang={s.language}>
                  {s.nativeName}
                </span>
                <span className="lp-station-freq">{s.frequency}</span>
                <span className="lp-station-meta">
                  {s.languageName} · {voices} voices{TAGLINE_EN[s.id] ? ` · ${TAGLINE_EN[s.id]}` : ''}
                </span>
                <button type="button" className="lp-station-tune" onClick={() => onTuneIn(s.id)}>
                  Tune in <span aria-hidden="true">→</span>
                  <span className="lp-sr"> to {s.languageName}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
