import { AnimatePresence, m } from 'motion/react';
import type { LiveListener } from '../../../shared/live';
import { initial, joinNames, newestFirst } from './format';
import { OnMicIcon, PeopleIcon } from './icons';

/** Chips shown before "+N more" */
const SHOWN_MAX = 30;

export type HelloState = 'waiting' | 'up_next' | 'on_air' | 'done';

interface PresenceProps {
  listeners: LiveListener[];
  you?: LiveListener;
  /** Listener ids the line on air is welcoming */
  welcoming: ReadonlySet<string>;
  /** Where your own live hello is */
  hello: HelloState;
  rjName: string;
  /** Show is live (hide the hello note while connecting) */
  live: boolean;
  className?: string;
}

const HELLO_NOTE: Record<HelloState, (rj: string) => string> = {
  waiting: (rj) => `${rj} will welcome you on air soon.`,
  up_next: () => 'Your live hello is up next.',
  on_air: (rj) => `${rj} is saying your name on air right now.`,
  done: (rj) => `${rj} welcomed you on air. You're part of the show.`,
};

/** Who is tuned in right now: a chip per listener (newest first), yours highlighted. */
export default function Presence({ listeners, you, welcoming, hello, rjName, live, className = '' }: PresenceProps) {
  const everyone = you && !listeners.some((l) => l.id === you.id) ? [you, ...listeners] : listeners;
  const sorted = newestFirst(everyone);
  const shown = sorted.slice(0, SHOWN_MAX);
  const more = sorted.length - shown.length;
  const greeted = sorted.filter((l) => welcoming.has(l.id) && l.id !== you?.id).map((l) => l.name);

  return (
    <section id="presence" aria-labelledby="presence-title" className={`live-presence ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="presence-title" className="section-title flex items-center gap-2">
          <PeopleIcon width={18} height={18} className="text-accent" />
          <span>
            <span className="tabular-nums">{sorted.length}</span> listening together
          </span>
        </h2>
        {live && you ? (
          <p className="live-hello-note" data-hello={hello}>
            {HELLO_NOTE[hello](rjName)}
          </p>
        ) : null}
      </div>

      <p className="live-greeting" data-on={greeted.length > 0} aria-live="polite">
        {greeted.length ? (
          <>
            <span className="lamp-dot live-greeting-dot" aria-hidden="true" />
            On air now: a hello for {joinNames(greeted, 3)}
          </>
        ) : null}
      </p>

      {sorted.length ? (
        <ul className="live-people" aria-label="Listeners">
          <AnimatePresence initial={false}>
            {shown.map((listener) => {
              const isYou = listener.id === you?.id;
              const isWelcome = welcoming.has(listener.id);
              return (
                <m.li
                  key={listener.id}
                  className="live-person"
                  data-you={isYou}
                  data-welcome={isWelcome}
                  initial={{ opacity: 0, scale: 0.85, y: 6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 26 }}
                >
                  <span className="live-avatar" aria-hidden="true">
                    {initial(listener.name)}
                  </span>
                  <span className="live-person-name">{listener.name}</span>
                  {listener.city ? <span className="live-person-city">{listener.city}</span> : null}
                  {isYou ? <span className="live-you-tag">You</span> : null}
                  {isWelcome ? (
                    <span className="live-person-mic">
                      <OnMicIcon width={14} height={14} />
                      <span className="sr-only">, being welcomed on air</span>
                    </span>
                  ) : null}
                </m.li>
              );
            })}
          </AnimatePresence>
          {more > 0 ? (
            <li className="live-person live-more">
              <span className="tabular-nums">+{more}</span> more
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-fg-3 mt-3 text-sm">Listeners show up here as they tune in.</p>
      )}
    </section>
  );
}
