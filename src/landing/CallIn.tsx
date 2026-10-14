import { CALL_EXAMPLE } from './data';
import { BorderBeam } from '../components/bits/MagicUi';
import CallChain from './CallChain';
import { PlayGlyph, SectionHead, SpeakerId, STUDIO_LANGUAGES, StudioCall, type Vars } from './ui';
import type { VoicePlayer } from './useVoicePlayer';

const REPLY_ID = 'call-reply';

export default function CallIn({ player }: { player: VoicePlayer }) {
  const { voice, station, caller, reply } = CALL_EXAMPLE;
  const phase = player.state.id === REPLY_ID ? (player.state.phase ?? 'idle') : 'idle';
  const busy = phase === 'loading' || phase === 'playing';
  const ttfa = player.state.ttfa[REPLY_ID];

  let status = '';
  if (phase === 'loading') status = 'Connecting to Bulbul…';
  else if (phase === 'error') status = player.state.error ?? '';
  else if (ttfa !== undefined) status = `First audio in ${ttfa} ms`;

  return (
    <section className="lp-section lp-call" aria-labelledby="call-title">
      <div className="lp-wrap lp-call-grid">
        <div className="lp-call-side">
          <SectionHead id="call-title" title="Call the RJ">
            Hold the button, speak in your language, let go. The RJ answers you on air in about two seconds.
          </SectionHead>
          <CallChain />
          <div className="lp-studio">
            <h3 className="lp-h3">Or call the studio from any phone</h3>
            <p>
              A real phone line. RJ Sunny picks up and chats with you in {STUDIO_LANGUAGES}. Leave a dedication or
              ask for a story or the headlines, and the RJ reads your message on the live show.
            </p>
            <div className="lp-studio-row">
              <StudioCall variant="button" />
              <SpeakerId id="Sarvam Voice Agents" />
            </div>
          </div>
        </div>

        <div className="lp-exchange" style={{ '--st': station.accent } as Vars}>
          <figure className="lp-bubble">
            <figcaption>Caller, heard by Saaras v4</figcaption>
            <p className="lp-native" lang={station.language}>
              {caller.text}
            </p>
            <p className="lp-english">{caller.en}</p>
          </figure>
          <figure className="lp-bubble lp-bubble--rj">
            <BorderBeam size={110} duration={8} colorFrom="#ffd38a" colorTo="#ff6b2c" />
            <figcaption>
              RJ reply, written by Sarvam-105B <SpeakerId id={voice.speaker} />
            </figcaption>
            <p className="lp-native" lang={station.language}>
              {reply.text}
            </p>
            <p className="lp-english">{reply.en}</p>
            <div className="lp-bubble-actions">
              <button
                type="button"
                className="lp-ghost lp-ghost--sm"
                data-phase={phase}
                onClick={() =>
                  player.toggle({
                    id: REPLY_ID,
                    station: station.id,
                    speaker: voice.speaker,
                    text: reply.text,
                    pace: voice.pace,
                    temperature: voice.temperature,
                  })
                }
              >
                <PlayGlyph phase={phase} size={16} />
                {busy ? 'Stop' : phase === 'error' ? 'Try again' : 'Play the reply'}
              </button>
              <span className="lp-status" data-kind={phase === 'error' ? 'error' : ttfa !== undefined ? 'ttfa' : undefined} aria-live="polite">
                {status}
              </span>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
