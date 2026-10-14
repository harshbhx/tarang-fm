import { AnimatePresence, m } from 'motion/react';

interface WelcomeBannerProps {
  /** True while the welcome line that names you is on air */
  show: boolean;
  rjName: string;
}

/**
 * The live-welcome moment: a glowing ON AIR banner that floats near the top (below the slim
 * dial bar) while the RJ says your name to everyone, wherever the page is scrolled.
 */
export default function WelcomeBanner({ show, rjName }: WelcomeBannerProps) {
  return (
    <div className="live-welcome-slot" role="status" aria-live="polite">
      <AnimatePresence>
        {show ? (
          <m.div
            key="welcome"
            className="live-welcome"
            initial={{ opacity: 0, y: -16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
          >
            <span className="you-on-air-flash" aria-hidden="true" />
            <span className="lamp-dot" aria-hidden="true" />
            <span className="live-welcome-text">
              <span className="live-welcome-title">
                {rjName} is welcoming you live! <span aria-hidden="true">🎙️</span>
              </span>
              <span className="live-welcome-sub">Everyone tuned in is hearing your name.</span>
            </span>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
