import type { ReactNode } from 'react';
import type { SegmentType } from '../../shared/types';
import NumberTicker from './NumberTicker';
import SplitFlapText from './SplitFlapText';
import { SEGMENT_NAMES } from './format';
import { BoltIcon } from './icons';

interface NowPlayingProps {
  /** Latin board label, e.g. 'NEWS' */
  board: string;
  /** Plain-English name for screen readers, e.g. 'Kahani Corner' */
  name: string;
  /** Segment title as written by the station (station language) */
  title?: string;
  lang: string;
  /** Control at the end of the row (subtitle toggle) */
  action?: ReactNode;
}

/** Split-flap segment label and the segment's title. */
export default function NowPlaying({ board, name, title, lang, action }: NowPlayingProps) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0 pt-1">
        <SplitFlapText text={board} fontSize={15} aria-hidden="true" />
        <span className="sr-only">{name}</span>
        {title ? (
          <p lang={lang} className="text-fg mt-3 line-clamp-2 text-[1.05rem] leading-snug font-medium sm:text-lg">
            {title}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

/** What comes next and how fast the latest line started. */
export function ShowMeta({ upNext, ttfaMs }: { upNext?: SegmentType; ttfaMs?: number }) {
  if (!upNext && ttfaMs == null) return null;
  return (
    <div className="border-line text-fg-3 mt-6 flex flex-wrap items-center justify-between gap-x-5 gap-y-1 border-t pt-4 text-sm">
      {upNext ? (
        <p>
          Up next: <span className="text-fg-2">{SEGMENT_NAMES[upNext]}</span>
        </p>
      ) : (
        <span />
      )}
      {ttfaMs != null ? (
        <p className="flex items-center gap-1.5 font-mono" title="Time to first audio for the latest line">
          <BoltIcon width={13} height={13} className="text-accent" />
          <NumberTicker value={Math.round(ttfaMs)} className="text-fg-2" />
          <span>ms</span>
          <span className="sr-only">to first audio</span>
        </p>
      ) : null}
    </div>
  );
}
