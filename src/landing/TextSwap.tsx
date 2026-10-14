/*
 * Adapted from TextLoop in motion-primitives by ibelick (MIT License),
 * https://github.com/ibelick/motion-primitives. Changed to a controlled component:
 * the caller decides which item shows, so the swap can follow the radio dial.
 */
import { AnimatePresence, m } from 'motion/react';

export function TextSwap({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      <AnimatePresence mode="popLayout" initial={false}>
        <m.span
          key={text}
          className="lp-swap-item"
          initial={{ y: '0.45em', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-0.45em', opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          {text}
        </m.span>
      </AnimatePresence>
    </span>
  );
}
