import { useRef, type CSSProperties } from 'react';
import type { Station } from '../../shared/types';
import type { Caption, CallState, RadioStatus } from '../radio/state';
import CaptionText from './CaptionText';
import SpeakerChip from './SpeakerChip';
import { voiceName } from './format';
import { useKeepInView, useReducedMotion } from './hooks';
import { PhoneIcon } from './icons';

interface CallPanelProps {
  status: RadioStatus;
  call?: CallState;
  station: Station;
  listenerName?: string;
  /** Current caption; used for the RJ's live speaker ID when it is the reply */
  caption?: Caption;
  showSubtitles: boolean;
  secondsLeft: number;
}

const SEGMENTS = Array.from({ length: 24 }, (_, i) => i);

/** The phone-in, as a studio phone line: live mic meter, ringing, then "You're on air". */
export default function CallPanel({
  status,
  call,
  station,
  listenerName,
  caption,
  showSubtitles,
  secondsLeft,
}: CallPanelProps) {
  const rj = station.cast.rj;
  const rjName = voiceName(rj.label);
  const replySpeaker = caption?.role === 'rj' && caption.speaker ? caption.speaker : rj.speaker;
  const caller = listenerName?.trim() || 'You';
  const panelRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useKeepInView(panelRef, `${status}:${call?.transcript ?? ''}:${call?.reply ?? ''}:${showSubtitles}`, reduced);

  return (
    <div ref={panelRef} className="line" data-state={status}>
      {status === 'call_recording' ? (
        <div role="status" className="line-block">
          <p className="line-head">
            <span className="line-led" aria-hidden="true" />
            Line open, {rjName} is listening
          </p>
          <p className="display-md mt-2">Speak now</p>
          <div className="mic-meter mt-5" aria-hidden="true">
            {SEGMENTS.map((i) => (
              <span key={i} style={{ '--i': i } as CSSProperties} data-zone={i >= 21 ? 'hot' : i >= 17 ? 'warm' : 'ok'} />
            ))}
          </div>
          <p className="text-fg-3 mt-3 text-sm tabular-nums">
            <span className="text-fg">{secondsLeft} s</span> left. Release to send, or press Esc to cancel.
          </p>
        </div>
      ) : null}

      {status === 'call_thinking' ? (
        <div role="status" className="line-block line-ringing">
          <span className="ring-icon" aria-hidden="true">
            <span className="ring-wave" />
            <span className="ring-wave" />
            <PhoneIcon width={22} height={22} />
          </span>
          <div className="min-w-0">
            <p className="line-head">Connecting you to the studio</p>
            <p className="display-sm mt-1">{rjName} picks up in a moment…</p>
          </div>
        </div>
      ) : null}

      {status === 'call_on_air' ? (
        <p className="you-on-air" role="status">
          <span className="you-on-air-flash" aria-hidden="true" />
          <span className="lamp-dot" aria-hidden="true" />
          {call?.transcript ? `${caller === 'You' ? "You're" : `${caller}, you're`} on air` : "You're on air"}
        </p>
      ) : null}

      {call?.transcript ? (
        <CallLine
          who={caller}
          role="Caller"
          text={call.transcript}
          en={showSubtitles ? call.transcriptEn : undefined}
          lang={station.language}
          size="sm"
        />
      ) : null}

      {call?.reply ? (
        <CallLine
          who={rjName}
          role="RJ, replying on air"
          speaker={replySpeaker}
          text={call.reply}
          en={showSubtitles ? call.replyEn : undefined}
          lang={station.language}
          size="lg"
        />
      ) : null}

      {call?.error ? (
        <p role="alert" className="text-fg-2">
          Your call didn&rsquo;t go through: {call.error} Hold the button to try again.
        </p>
      ) : null}
    </div>
  );
}

function CallLine({
  who,
  role,
  speaker,
  text,
  en,
  lang,
  size,
}: {
  who: string;
  role: string;
  speaker?: string;
  text: string;
  en?: string;
  lang: string;
  size: 'lg' | 'sm';
}) {
  return (
    <div className="call-line" data-size={size}>
      <div className="speaker fade-in">
        <span className="live-dot" data-live={!!speaker} aria-hidden="true" />
        <span className="speaker-name">{who}</span>
        <span className="speaker-role">{role}</span>
        {speaker ? <SpeakerChip id={speaker} speaking /> : null}
      </div>
      <CaptionText text={text} lang={lang} size={size} className="mt-2" />
      {en ? (
        <p lang="en" className="caption-en fade-in">
          {en}
        </p>
      ) : null}
    </div>
  );
}
