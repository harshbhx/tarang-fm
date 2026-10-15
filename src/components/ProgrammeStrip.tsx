import type { ReactNode } from 'react';
import type { ClockSlot, SegmentType } from '../../shared/types';
import type { UpNextSlot } from '../radio/state';
import NumberTicker from './NumberTicker';
import SplitFlapText from './SplitFlapText';
import { formatClock, laterOnClock, slotLabel } from './format';
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
  /** The next clock slot (its bulletin kind or serial part, and the slot after it), or just its type */
  upNext?: SegmentType | UpNextSlot;
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
  const next: UpNextSlot | undefined = typeof upNext === 'string' ? { type: upNext } : upNext;
  const laterType = next?.later ? undefined : laterOnClock(segment, next?.type);
  const later: ClockSlot | undefined = next?.later ?? (laterType ? { type: laterType } : undefined);
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
        <li className="prog-slot" data-empty={!next}>
          <span className="prog-k">Next</span>
          <span className="prog-v">
            {next ? <SegmentIcon type={next.type} width={16} height={16} /> : null}
            {next ? <SlotName slot={next} lang={lang} /> : 'Coming up'}
          </span>
        </li>
        {later ? (
          <li className="prog-slot">
            <span className="prog-k">Later</span>
            <span className="prog-v">
              <SegmentIcon type={later.type} width={16} height={16} />
              <SlotName slot={later} lang={lang} />
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

/** 'Kahani · कड़ी 2' (the part word the station says on air), 'News update', 'RJ' */
function SlotName({ slot, lang }: { slot: ClockSlot; lang: string }) {
  const label = slotLabel(slot, lang);
  if (!label.detail) return <>{label.name}</>;
  return (
    <>
      {label.name} · <span lang={label.lang}>{label.detail}</span>
    </>
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
