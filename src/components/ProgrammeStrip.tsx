import type { ReactNode } from 'react';
import type { SegmentType } from '../../shared/types';
import NumberTicker from './NumberTicker';
import SplitFlapText from './SplitFlapText';
import { SEGMENT_NAMES, formatClock, laterOnClock } from './format';
import { useElapsedSeconds } from './hooks';
import { BoltIcon, SegmentIcon } from './icons';

interface ProgrammeStripProps {
  /** Latin split-flap label, e.g. 'KAHANI' or 'CALL IN' */
  board: string;
  /** Plain-English name for screen readers */
  boardName: string;
  /** Segment on air (undefined while tuning or between segments) */
  segment?: SegmentType;
  /** Segment title as written by the station (station language) */
  title?: string;
  lang: string;
  upNext?: SegmentType;
  ttfaMs?: number;
  /** Show clock keys: remount (reset the timer) per station */
  clockKey: string;
  /** Small toggles at the end of the strip (subtitles) */
  tools?: ReactNode;
}

/** A radio schedule line: NOW (split-flap) · NEXT · LATER, on-air timer and time to first audio. */
export default function ProgrammeStrip({
  board,
  boardName,
  segment,
  title,
  lang,
  upNext,
  ttfaMs,
  clockKey,
  tools,
}: ProgrammeStripProps) {
  const later = laterOnClock(segment, upNext);
  return (
    <section aria-label="Programme" className="programme">
      <div className="prog-now">
        <span className="prog-k">Now</span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <SplitFlapText text={board} fontSize={14} aria-hidden="true" />
          <span className="sr-only">{boardName}</span>
          {title ? (
            <p lang={lang} className="prog-title">
              {title}
            </p>
          ) : null}
        </div>
      </div>

      <ol className="prog-queue" aria-label="Coming up">
        <li className="prog-slot" data-empty={!upNext}>
          <span className="prog-k">Next</span>
          <span className="prog-v">
            {upNext ? <SegmentIcon type={upNext} width={16} height={16} /> : null}
            {upNext ? SEGMENT_NAMES[upNext] : 'Coming up'}
          </span>
        </li>
        {later ? (
          <li className="prog-slot">
            <span className="prog-k">Later</span>
            <span className="prog-v">
              <SegmentIcon type={later} width={16} height={16} />
              {SEGMENT_NAMES[later]}
            </span>
          </li>
        ) : null}
      </ol>

      <div className="prog-meta">
        <OnAirClock key={clockKey} />
        {ttfaMs != null ? (
          <p className="prog-ttfa" title="Time to first audio for the latest line">
            <BoltIcon width={13} height={13} className="text-accent" />
            <NumberTicker value={Math.round(ttfaMs)} className="text-fg" />
            <span className="text-fg-3">ms</span>
            <span className="sr-only">to first audio</span>
          </p>
        ) : null}
        {tools ? <div className="prog-tools">{tools}</div> : null}
      </div>
    </section>
  );
}

function OnAirClock() {
  const seconds = useElapsedSeconds();
  return (
    <p className="prog-clock">
      <span className="text-fg-3">On air for</span>{' '}
      <time className="text-fg tabular-nums" dateTime={`PT${seconds}S`}>
        {formatClock(seconds)}
      </time>
    </p>
  );
}
