import SplitFlapText from '../../components/SplitFlapText';
import { SEGMENT_NAMES } from '../../components/format';
import { SegmentIcon } from '../../components/icons';
import type { LiveLine } from '../../../shared/live';
import type { LiveStatus } from '../types';
import { liveBoard, upcomingSegments } from './format';
import { OnMicIcon } from './icons';

interface LiveProgrammeProps {
  status: LiveStatus;
  current?: LiveLine;
  upcoming: LiveLine[];
  /** Station language (BCP-47) for segment titles */
  lang: string;
}

/** The shared schedule line: NOW (split-flap board and title) and the next segments everyone will hear. */
export default function LiveProgramme({ status, current, upcoming, lang }: LiveProgrammeProps) {
  const board = liveBoard(status, current);
  const onAir = status === 'on_air' && current;
  const next = status === 'error' ? [] : upcomingSegments(upcoming, current?.segmentId);
  const nowName = onAir ? (current.welcome?.length ? 'Live hello' : SEGMENT_NAMES[current.type]) : board.toLowerCase();

  return (
    <section aria-label="Programme" className="programme live-programme">
      <div className="prog-now">
        <span className="prog-k">Now</span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <SplitFlapText text={board} fontSize={14} aria-hidden="true" />
          <span className="sr-only">{nowName}</span>
          {onAir && current.title ? (
            <p lang={lang} className="prog-title">
              {current.title}
            </p>
          ) : null}
        </div>
      </div>

      <div className="live-next">
        <span className="prog-k">Up next</span>
        {next.length ? (
          <ol className="live-next-list" aria-label="Up next">
            {next.map((segment) => (
              <li key={segment.id} className="live-next-item">
                <span className="live-next-type">
                  {segment.welcome ? (
                    <OnMicIcon width={15} height={15} />
                  ) : (
                    <SegmentIcon type={segment.type} width={15} height={15} />
                  )}
                  {segment.welcome ? 'Live hello' : SEGMENT_NAMES[segment.type]}
                </span>
                {segment.title ? (
                  <span lang={lang} className="live-next-title">
                    {segment.title}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="live-next-empty">{status === 'on_air' ? 'Being written now…' : 'Coming up once the studio is live'}</p>
        )}
      </div>
    </section>
  );
}
