/**
 * TextEffect: adapted from Motion Primitives (https://motion-primitives.com, github.com/ibelick/motion-primitives).
 * Copyright (c) 2024 ibelick. MIT License.
 * Changes for Tarang FM: `m` components (LazyMotion), word and line modes only (never per
 * character: that would break Indic conjuncts and matras), blur capped at 6px, `lang` passthrough.
 */
import React from 'react';
import { AnimatePresence, m } from 'motion/react';
import type { TargetAndTransition, Transition, Variant, Variants } from 'motion/react';

export type PresetType = 'blur' | 'fade-in-blur' | 'fade';

export type PerType = 'word' | 'line';

export type TextEffectProps = {
  children: string;
  per?: PerType;
  as?: 'p' | 'span' | 'div';
  className?: string;
  preset?: PresetType;
  delay?: number;
  speedReveal?: number;
  speedSegment?: number;
  trigger?: boolean;
  containerTransition?: Transition;
  segmentTransition?: Transition;
  style?: React.CSSProperties;
  lang?: string;
};

const defaultStaggerTimes: Record<PerType, number> = {
  word: 0.05,
  line: 0.1,
};

const defaultContainerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
  exit: { transition: { staggerChildren: 0.05, staggerDirection: -1 } },
};

const presetVariants: Record<PresetType, { container: Variants; item: Variants }> = {
  blur: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, filter: 'blur(6px)' },
      visible: { opacity: 1, filter: 'blur(0px)' },
      exit: { opacity: 0, filter: 'blur(6px)' },
    },
  },
  'fade-in-blur': {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0, y: 8, filter: 'blur(6px)' },
      visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
      exit: { opacity: 0, y: 8, filter: 'blur(6px)' },
    },
  },
  fade: {
    container: defaultContainerVariants,
    item: {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
      exit: { opacity: 0 },
    },
  },
};

const AnimationComponent: React.FC<{ segment: string; variants: Variants; per: PerType }> = React.memo(
  ({ segment, variants, per }) =>
    per === 'line' ? (
      <m.span variants={variants} className="block">
        {segment}
      </m.span>
    ) : (
      <m.span aria-hidden="true" variants={variants} className="inline-block whitespace-pre">
        {segment}
      </m.span>
    ),
);

AnimationComponent.displayName = 'AnimationComponent';

/** Words are split on whitespace only, keeping each word's grapheme clusters intact. */
const splitText = (text: string, per: PerType) => (per === 'line' ? text.split('\n') : text.split(/(\s+)/));

const hasTransition = (variant?: Variant): variant is TargetAndTransition & { transition?: Transition } =>
  !!variant && typeof variant === 'object' && 'transition' in variant;

const createVariantsWithTransition = (
  baseVariants: Variants,
  transition?: Transition & { exit?: Transition },
): Variants => {
  if (!transition) return baseVariants;
  const { exit: _exit, ...mainTransition } = transition;
  void _exit;
  return {
    ...baseVariants,
    visible: {
      ...baseVariants.visible,
      transition: {
        ...(hasTransition(baseVariants.visible) ? baseVariants.visible.transition : {}),
        ...mainTransition,
      },
    },
    exit: {
      ...baseVariants.exit,
      transition: {
        ...(hasTransition(baseVariants.exit) ? baseVariants.exit.transition : {}),
        ...mainTransition,
        staggerDirection: -1,
      },
    },
  };
};

export function TextEffect({
  children,
  per = 'word',
  as = 'p',
  className,
  preset = 'fade',
  delay = 0,
  speedReveal = 1,
  speedSegment = 1,
  trigger = true,
  containerTransition,
  segmentTransition,
  style,
  lang,
}: TextEffectProps) {
  const segments = splitText(children, per);
  const MotionTag = m[as] as typeof m.p;
  const baseVariants = presetVariants[preset];
  const stagger = defaultStaggerTimes[per] / speedReveal;
  const baseDuration = 0.3 / speedSegment;

  const computedVariants = {
    container: createVariantsWithTransition(baseVariants.container, {
      staggerChildren: stagger,
      delayChildren: delay,
      ...containerTransition,
      exit: { staggerChildren: stagger, staggerDirection: -1 },
    }),
    item: createVariantsWithTransition(baseVariants.item, {
      duration: baseDuration,
      ...segmentTransition,
    }),
  };

  return (
    <AnimatePresence mode="popLayout">
      {trigger && (
        <MotionTag
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={computedVariants.container}
          className={className}
          style={style}
          lang={lang}
        >
          {per !== 'line' ? <span className="sr-only">{children}</span> : null}
          {segments.map((segment, index) => (
            <AnimationComponent
              key={`${per}-${index}-${segment}`}
              segment={segment}
              variants={computedVariants.item}
              per={per}
            />
          ))}
        </MotionTag>
      )}
    </AnimatePresence>
  );
}

export default TextEffect;
