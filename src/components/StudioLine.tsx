import { useEffect, useRef, useState } from 'react';
import { STUDIO_NUMBER, STUDIO_NUMBER_DISPLAY } from '../../shared/constants';
import type { PhoneCall, PhoneRequestType } from '../../shared/types';
import type { PhoneAirStatus, RadioState } from '../radio/state';
import { Eq, PhoneIcon, SegmentIcon } from './icons';

/** The studio line's number as a tel: target and as printed on the radio. */
export function studioNumber(phone?: RadioState['phone']): { tel: string; display: string } {
  const tel = phone?.number?.trim() || STUDIO_NUMBER;
  return { tel, display: tel === STUDIO_NUMBER ? STUDIO_NUMBER_DISPLAY : tel };
}

const TYPE_LABELS: Record<PhoneRequestType, string> = {
  dedication: 'Dedication',
  story_request: 'Story request',
  news_request: 'News request',
  chat: 'Shout-out',
  other: 'Message',
};

/** "just now", "5 min ago", "2 h ago" */
export function timeAgo(at: string, now: number): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : 'yesterday';
}

/** The caller speaks any language: tag the message by its script so it gets the right face and voice. */
function scriptLang(text: string): string | undefined {
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  if (/[ঀ-৿]/.test(text)) return 'bn';
  if (/[઀-૿]/.test(text)) return 'gu';
  if (/[஀-௿]/.test(text)) return 'ta';
  return undefined;
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/** Copies the printed number; the label confirms for a moment. */
function CopyNumber({ display, className = '' }: { display: string; className?: string }) {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = () => {
    const done = (result: 'done' | 'failed') => {
      setCopied(result);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied('idle'), 1800);
    };
    if (!navigator.clipboard) {
      done('failed');
      return;
    }
    navigator.clipboard.writeText(display).then(
      () => done('done'),
      () => done('failed'),
    );
  };

  return (
    <button type="button" className={`studio-copy ${className}`} onClick={copy} aria-label={`Copy ${display}`}>
      <span aria-hidden="true">{copied === 'done' ? 'Copied' : copied === 'failed' ? 'Copy failed' : 'Copy'}</span>
      <span className="sr-only" aria-live="polite">
        {copied === 'done' ? 'Number copied' : copied === 'failed' ? 'Could not copy the number' : ''}
      </span>
    </button>
  );
}

/**
 * The dock key for the studio line. On a phone it dials (tel:); on a desktop it shows the number with a copy
 * button, since there is nothing to dial with.
 */
export function StudioDockKey({ phone }: { phone?: RadioState['phone'] }) {
  const { tel, display } = studioNumber(phone);
  return (
    <>
      <a className="icon-btn studio-key studio-touch" href={`tel:${tel}`} aria-label={`Call the studio, ${display}`}>
        <PhoneIcon width={22} height={22} />
        <span className="studio-key-text" aria-hidden="true">
          Studio
        </span>
      </a>
      <div className="studio-dock studio-desk">
        <span className="studio-dock-icon" aria-hidden="true">
          <PhoneIcon width={18} height={18} />
        </span>
        <span className="studio-dock-text">
          <span className="studio-dock-label">Call the studio</span>
          <span className="studio-dock-number">{display}</span>
        </span>
        <CopyNumber display={display} />
      </div>
    </>
  );
}

type AirTag = { label: string; tone: 'waiting' | 'next' | 'live' | 'held' | 'done' | 'idle' };

/** Whether this listener's radio is playing, paused, or not tuned in. */
export type RadioMode = 'live' | 'paused' | 'off';

/** Where a call is on its way to air, in words a listener understands. */
export function airTag(status: PhoneAirStatus | undefined, radio: RadioMode): AirTag {
  if (status === 'aired') return { label: 'Read on air', tone: 'done' };
  if (radio === 'paused') {
    if (status === 'on_air') return { label: 'Paused mid-read', tone: 'held' };
    return { label: status === 'up_next' ? 'Up next · paused' : 'Resume to hear it', tone: 'held' };
  }
  if (status === 'on_air') return { label: 'On air now', tone: 'live' };
  if (status === 'up_next') return { label: 'Up next', tone: 'next' };
  return radio === 'live' ? { label: 'In the queue', tone: 'waiting' } : { label: 'Tune in to hear it', tone: 'idle' };
}

function initials(name: string | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '☎';
  return words
    .slice(0, 2)
    .map((w) => [...w][0])
    .join('')
    .toUpperCase();
}

function CallRow({ call, now, status, radio }: { call: PhoneCall; now: number; status?: PhoneAirStatus; radio: RadioMode }) {
  const who = call.name?.trim() || 'A listener';
  const tag = airTag(status, radio);
  return (
    <li className="studio-call" data-tone={tag.tone}>
      <span className="studio-avatar" aria-hidden="true">
        {initials(call.name)}
      </span>
      <div className="studio-call-body">
        <p className="studio-call-meta">
          <span className="studio-call-name">{who}</span>
          {call.city ? <span>{call.city}</span> : null}
          <span className="studio-call-number">{call.maskedNumber}</span>
        </p>
        <p className="studio-call-msg" lang={scriptLang(call.message)}>
          {call.message}
        </p>
        {call.type === 'story_request' && call.theme ? (
          <p className="studio-call-theme">
            <SegmentIcon type="kahani" width={14} height={14} aria-hidden="true" />
            Kahani request: {call.theme}
          </p>
        ) : null}
        <p className="studio-call-foot">
          <span className="studio-call-type">{TYPE_LABELS[call.type] ?? 'Message'}</span>
          <time dateTime={call.at}>{timeAgo(call.at, now)}</time>
          <span className="studio-air" data-tone={tag.tone}>
            {tag.tone === 'live' ? <Eq className="studio-air-eq" /> : <span className="studio-air-dot" aria-hidden="true" />}
            {tag.label}
          </span>
        </p>
      </div>
    </li>
  );
}

const STEPS: { title: string; body: string }[] = [
  { title: 'Call the studio', body: 'From any phone. No app, no internet.' },
  { title: 'Talk to RJ Sunny', body: 'Hindi, Marathi, Gujarati, Tamil, Bangla or English.' },
  { title: 'Hear it on air', body: 'The next RJ link reads your dedication by name.' },
];

/** Calls to the real phone line: RJ Sunny answers, and each call is read on the live show. */
export function StudioLinePanel({
  phone,
  phoneStatus = {},
  radio = 'off',
  className = '',
}: {
  phone?: RadioState['phone'];
  phoneStatus?: RadioState['phoneStatus'];
  radio?: RadioMode;
  className?: string;
}) {
  const now = useNow(30_000);
  const { tel, display } = studioNumber(phone);
  const calls = phone?.calls ?? [];
  const live = radio === 'live' ? calls.find((c) => phoneStatus[c.id] === 'on_air') : undefined;
  const waiting = calls.filter((c) => !phoneStatus[c.id] || phoneStatus[c.id] === 'up_next').length;

  return (
    <section aria-labelledby="studio-title" className={`studio ${className}`} data-live={live ? 'true' : undefined}>
      <div className="studio-intro">
        <p className="studio-led-row">
          <span className="studio-led" aria-hidden="true" />
          Studio line open · 24×7
        </p>
        <h2 id="studio-title" className="section-title">
          Call the studio
        </h2>
        <p className="studio-sub">Ring the real phone line, chat with the RJ, and hear your message on this show.</p>
        <div className="studio-actions">
          <a className="studio-dial studio-touch" href={`tel:${tel}`}>
            <PhoneIcon width={18} height={18} />
            Call {display}
          </a>
          <p className="studio-desk studio-number-row">
            <PhoneIcon width={18} height={18} className="studio-number-icon" />
            <span className="studio-number">{display}</span>
            <CopyNumber display={display} />
          </p>
        </div>
        <ol className="studio-steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="studio-step">
              <span className="studio-step-n" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="studio-step-title">{step.title}</span>
                <span className="studio-step-body">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="studio-feed">
        <div className="studio-feed-head">
          <h3 className="studio-feed-title">From the studio line</h3>
          {calls.length ? (
            <p className="studio-feed-count" aria-live="polite">
              {live
                ? 'Reading a call on air'
                : radio === 'paused' && waiting
                  ? 'Paused · press play to hear your call'
                  : waiting
                    ? `${waiting} waiting to go on air`
                    : 'All calls read on air'}
            </p>
          ) : null}
        </div>
        {calls.length ? (
          <ul className="studio-calls" aria-label="Recent calls">
            {calls.map((call) => (
              <CallRow key={call.id} call={call} now={now} status={phoneStatus[call.id]} radio={radio} />
            ))}
          </ul>
        ) : (
          <div className="studio-empty">
            <span className="studio-empty-icon" aria-hidden="true">
              <PhoneIcon width={22} height={22} />
            </span>
            <p>
              No calls yet. Be the first: call <span className="studio-empty-number">{display}</span> and RJ Sunny puts you on air.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
