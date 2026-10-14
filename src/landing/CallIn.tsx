import HoldToTalk from './HoldToTalk';
import { SectionHead, SpeakerId, STUDIO_LANGUAGES, StudioCall } from './ui';
import type { VoicePlayer } from './useVoicePlayer';

export default function CallIn({ player }: { player: VoicePlayer }) {
  return (
    <section className="lp-section lp-call" aria-labelledby="call-title">
      <div className="lp-wrap">
        <SectionHead id="call-title" title="Call the RJ">
          Hold the button, speak in your language, let go. The RJ answers you on air in about two seconds. Try it here.
        </SectionHead>
        <HoldToTalk player={player} />
        <div className="lp-studio">
          <h3 className="lp-h3">Or call the studio from any phone</h3>
          <p>
            A real phone line. RJ Sunny picks up and chats with you in {STUDIO_LANGUAGES}. Leave a dedication or ask for a story or
            the headlines, and the RJ reads your message on the live show within minutes.
          </p>
          <div className="lp-studio-row">
            <StudioCall variant="button" />
            <SpeakerId id="Sarvam Voice Agents" />
          </div>
        </div>
      </div>
    </section>
  );
}
