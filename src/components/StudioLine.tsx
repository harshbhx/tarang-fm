import { useEffect, useRef, useState } from 'react';
import { STUDIO_NUMBER, STUDIO_NUMBER_DISPLAY } from '../../shared/constants';
import type { PhoneCall, PhoneRequestType } from '../../shared/types';
import type { RadioState } from '../radio/state';
import { PhoneIcon } from './icons';

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

function CallRow({ call, now }: { call: PhoneCall; now: number }) {
  const who = call.name?.trim() || 'A listener';
  return (
    <li className="studio-call">
      <p className="studio-call-meta">
        <span className="studio-call-name">{who}</span>
        {call.city ? <span>{call.city}</span> : null}
        <span className="studio-call-number">{call.maskedNumber}</span>
      </p>
      <p className="studio-call-msg" lang={scriptLang(call.message)}>
        {call.message}
      </p>
      <p className="studio-call-foot">
        <span className="studio-call-type">{TYPE_LABELS[call.type] ?? 'Message'}</span>
        <time dateTime={call.at}>{timeAgo(call.at, now)}</time>
      </p>
    </li>
  );
}

/** Calls to the real phone line: RJ Sunny answers, and each dedication is read on the live show. */
export function StudioLinePanel({ phone, className = '' }: { phone?: RadioState['phone']; className?: string }) {
  const now = useNow(30_000);
  const { tel, display } = studioNumber(phone);
  const calls = phone?.calls ?? [];

  return (
    <section aria-labelledby="studio-title" className={`studio ${className}`}>
      <div className="studio-intro">
        <p className="studio-led-row">
          <span className="studio-led" aria-hidden="true" />
          Studio line open
        </p>
        <h2 id="studio-title" className="section-title">
          From the studio line
        </h2>
        <p className="studio-sub">
          Call from any phone and talk to RJ Sunny in Hindi, Marathi, Gujarati, Tamil, Bangla or English. Your
          dedication is read out on the live show.
        </p>
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
      </div>

      {calls.length ? (
        <ul className="studio-calls" aria-label="Recent calls">
          {calls.map((call) => (
            <CallRow key={call.id} call={call} now={now} />
          ))}
        </ul>
      ) : (
        <p className="studio-empty">
          Lines are open. Call <span className="studio-empty-number">{display}</span> and RJ Sunny puts you on air.
        </p>
      )}
    </section>
  );
}
