import { useRef, type ReactNode } from 'react';
import type { Station } from '../../shared/types';
import type { Caption } from '../radio/state';
import CaptionText from './CaptionText';
import ShinyText from './ShinyText';
import SpeakerChip from './SpeakerChip';
import { ROLE_NAMES, sameCaption, voiceName } from './format';
import { useKeepInView, useReducedMotion } from './hooks';
import { Eq, PauseIcon, RetryIcon } from './icons';

const HISTORY_OPACITY = [0.75, 0.5, 0.32];

interface CaptionStageProps {
  caption?: Caption;
  /** Recent captions, newest last */
  history: Caption[];
  showSubtitles: boolean;
  /** Station language (BCP-47) */
  lang: string;
  paused?: boolean;
  /** Pulse the speaker dot while audio is playing */
  live?: boolean;
  /** Shown in place of the current line when there is none (tuning, between segments) */
  placeholder?: ReactNode;
}

/**
 * The hero: the line being spoken, large, with the speaker and their V4 voice ID, plus a short
 * fading history above. Both areas reserve their height so new lines never shift the layout.
 */
export default function CaptionStage({
  caption,
  history,
  showSubtitles,
  lang,
  paused = false,
  live = false,
  placeholder,
}: CaptionStageProps) {
  const earlier = (caption ? history.filter((c) => !sameCaption(c, caption)) : history).slice(-3);
  const lineRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useKeepInView(lineRef, caption ? `${caption.speaker}:${caption.text}:${showSubtitles}` : '', reduced);

  return (
    <div>
      <ol className="history" aria-label="Earlier lines">
        {earlier.map((line, i) => (
          <li
            key={`${line.speaker}:${line.text}`}
            className="history-item"
            style={{ opacity: HISTORY_OPACITY[earlier.length - 1 - i] }}
          >
            <span className="text-fg-3 mr-2 text-[0.8rem] font-medium">{voiceName(line.label)}</span>
            <span lang={lang}>{line.text}</span>
          </li>
        ))}
      </ol>

      <div
        className={`caption-current mt-4 transition-opacity duration-500 ${paused ? 'opacity-45' : ''}`}
        aria-live="polite"
        aria-atomic="true"
      >
        {paused ? (
          <p className="text-fg-2 mb-3 flex items-center gap-2 text-sm">
            <PauseIcon width={14} height={14} />
            Paused. Tap Resume to pick up where you left off.
          </p>
        ) : null}
        <div ref={lineRef}>
        {caption ? (
          <CaptionLine
            key={`${caption.speaker}:${caption.text}`}
            caption={caption}
            lang={lang}
            showSubtitles={showSubtitles}
            live={live && !paused}
          />
        ) : (
          placeholder
        )}
        </div>
      </div>
    </div>
  );
}

function CaptionLine({
  caption,
  lang,
  showSubtitles,
  live,
}: {
  caption: Caption;
  lang: string;
  showSubtitles: boolean;
  live: boolean;
}) {
  const isCaller = caption.role === 'caller';
  return (
    <article>
      <header className="fade-in flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="live-dot" data-live={live} aria-hidden="true" />
        <span className="font-semibold">{voiceName(caption.label)}</span>
        <span className="text-fg-3 text-sm">{ROLE_NAMES[caption.role]}</span>
        {caption.speaker && !isCaller ? <SpeakerChip id={caption.speaker} speaking={live} /> : null}
      </header>
      <CaptionText text={caption.text} lang={lang} className="mt-3" />
      {showSubtitles && caption.en ? (
        <p lang="en" className="caption-en fade-in mt-2">
          {caption.en}
        </p>
      ) : null}
    </article>
  );
}

export function WaitingLine({ children }: { children: string }) {
  return (
    <p className="text-fg-2 flex items-center gap-3 text-[1.05rem] font-medium">
      <Eq className="text-accent" />
      <ShinyText text={children} color="#a1a1a1" shineColor="#ffffff" speed={2.2} />
    </p>
  );
}

/** Playing, but no line yet (jingle, music bed, next segment loading). */
export function OnAirSoon({ station }: { station: Station }) {
  return (
    <div className="flex flex-col gap-4 pt-1">
      <WaitingLine>On air in a moment…</WaitingLine>
      <p className="text-fg-3 max-w-md">The next voice on {station.name} is on its way.</p>
    </div>
  );
}

export function TuningNotice({ station }: { station: Station }) {
  return (
    <div role="status" className="flex flex-col gap-4 pt-1">
      <WaitingLine>{`Tuning in to ${station.languageName} ${station.frequency}…`}</WaitingLine>
      <p className="text-fg-3 max-w-md">The station jingle plays first, then your RJ says hello.</p>
    </div>
  );
}

export function ErrorNotice({ message, onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="caption-current flex flex-col items-start gap-3 pt-1">
      <h3 className="text-2xl font-semibold tracking-tight">Signal lost</h3>
      <p className="text-fg-2 max-w-md leading-relaxed">
        {message || 'The station stopped responding.'} Check your connection, then try again.
      </p>
      <button type="button" className="tune-btn mt-2" onClick={onRetry}>
        <RetryIcon width={18} height={18} />
        Try again
      </button>
    </div>
  );
}
