import { useRef } from 'react';
import type { Station } from '../../shared/types';
import type { Caption, CallState, RadioStatus } from '../radio/state';
import { WaitingLine } from './CaptionStage';
import CaptionText from './CaptionText';
import SpeakerChip from './SpeakerChip';
import { voiceName } from './format';
import { useKeepInView, useReducedMotion } from './hooks';

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

/** The phone-in: live mic meter, then the caller's words, then the RJ's reply on air. */
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
    <div ref={panelRef} className="caption-current flex flex-col gap-6">
      {status === 'call_recording' ? (
        <div role="status">
          <p className="text-fg-2 text-sm">You&rsquo;re on the line with {rjName}</p>
          <p className="mt-1 text-3xl font-semibold tracking-tight lg:text-4xl">Speak now</p>
          <div className="vu mt-5" aria-hidden="true" />
          <p className="text-fg-3 mt-3 text-sm tabular-nums">
            {secondsLeft} s left. Release to send, or press Esc to cancel.
          </p>
        </div>
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

      {status === 'call_thinking' && !call?.reply ? (
        <div role="status" className="flex flex-col gap-2">
          <WaitingLine>RJ is listening…</WaitingLine>
          <p className="text-fg-3">{rjName} will answer you on air in a moment.</p>
        </div>
      ) : null}

      {call?.reply ? (
        <CallLine
          who={voiceName(rj.label)}
          role="RJ, on air"
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
    <div>
      <div className="fade-in flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="live-dot" data-live={!!speaker} aria-hidden="true" />
        <span className="font-semibold">{who}</span>
        <span className="text-fg-3 text-sm">{role}</span>
        {speaker ? <SpeakerChip id={speaker} speaking /> : null}
      </div>
      <CaptionText text={text} lang={lang} size={size} className="mt-2" />
      {en ? (
        <p lang="en" className="caption-en fade-in mt-1.5">
          {en}
        </p>
      ) : null}
    </div>
  );
}
