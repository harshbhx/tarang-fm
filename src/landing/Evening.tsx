import { AnimatePresence, m, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LISTENER_NAME_MAX } from '../../shared/constants';
import { getStation } from '../../shared/stations';
import type { Source } from '../../shared/types';
import { getContext } from '../radio/api';
import { cleanListenerName, loadListenerName, saveListenerName } from '../radio/listener';
import { AD_PRODUCT, greetingLine, KAHANI_THEMES, kahaniLine, newsLine, STORY_BEATS, STORY_LAMPS, type StoryBeat, type StoryLine } from './data';
import { SceneCity, SceneKahani, SceneName } from './scenes';
import { PlayGlyph, SectionHead, SpeakerId, type Vars } from './ui';
import { useAnalyserLevel } from './useAnalyser';
import type { VoicePlayer } from './useVoicePlayer';

const EASE = [0.22, 1, 0.36, 1] as const;
const ID_PREFIX = 'story-';
const hindi = getStation('hi');
const BARS = [0.55, 0.85, 1, 0.7, 0.9, 0.6];

const lineId = (beat: StoryBeat, i: number) => `${ID_PREFIX}${beat.key}-${i}`;
const initial = (name: string) => [...name][0]?.toUpperCase() ?? '•';

/** Six bars that follow the live analyser while a line plays; written straight to the DOM, no renders. */
function StageMeter({ active, analyser }: { active: boolean; analyser: () => AnalyserNode | null }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const held = useRef(0);
  useAnalyserLevel(active, analyser, (level) => {
    held.current = level > held.current ? level : held.current * 0.86 + level * 0.14;
    bars.current.forEach((el, i) => {
      if (el) el.style.transform = `scaleY(${Math.max(0.08, Math.min(1, held.current * BARS[i] * 1.25))})`;
    });
  });
  return (
    <span className="lp-stage-meter" data-active={active} aria-hidden="true">
      {BARS.map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            bars.current[i] = el;
          }}
        />
      ))}
    </span>
  );
}

function Scene({ beat }: { beat: StoryBeat }) {
  if (beat.key === 'rj') return <SceneName size={96} />;
  if (beat.key === 'news') return <SceneCity size={96} />;
  if (beat.key === 'kahani') return <SceneKahani size={96} />;
  return null;
}

/**
 * One evening on Tarang FM, in four beats: each passes a pinned on-air stage that shows what the radio is
 * saying then, with real pieces of tonight's show in it (your name, the headlines right now, a story you
 * pick), and one Hear it for the actual voice.
 */
export default function Evening({ player }: { player: VoicePlayer }) {
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion() ?? false;

  const [name, setName] = useState(() => loadListenerName() ?? '');
  const [theme, setTheme] = useState(0);
  const [live, setLive] = useState<{ city?: string; headlines: Source[] } | null>(null);
  const near = useInView(sectionRef, { once: true, margin: '600px 0px' });
  useEffect(() => {
    if (!near) return;
    let on = true;
    getContext(hindi.id)
      .then((ctx) => {
        if (on) setLive({ city: ctx.city?.trim() || undefined, headlines: ctx.headlines ?? [] });
      })
      .catch(() => undefined);
    return () => {
      on = false;
    };
  }, [near]);

  const beats = useMemo(
    () =>
      STORY_BEATS.map((b): StoryBeat => {
        if (b.key === 'rj') return { ...b, lines: [greetingLine(cleanListenerName(name))] };
        if (b.key === 'news' && live?.headlines.length) {
          return { ...b, lines: [newsLine(live.city, live.headlines[0])], headlines: live.headlines.slice(0, 2), city: live.city };
        }
        if (b.key === 'kahani') return { ...b, lines: [kahaniLine(KAHANI_THEMES[theme])] };
        return b;
      }),
    [name, theme, live],
  );
  const beat = beats[active];

  // A thin beam fills with the reader's progress; the stage follows the beat under the reading line
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 0.6', 'end 0.6'] });
  const head = useTransform(scrollYProgress, (v) => `${(v * 100).toFixed(2)}%`);
  useMotionValueEvent(scrollYProgress, 'change', () => {
    const stage = stageRef.current?.getBoundingClientRect();
    const pinned = !!stage && stage.width >= window.innerWidth * 0.85;
    const line = window.innerHeight * (pinned ? 0.72 : 0.5);
    let best = 0;
    let bestDist = Infinity;
    beatRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = r.top <= line && r.bottom > line ? 0 : Math.min(Math.abs(r.top - line), Math.abs(r.bottom - line));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive((cur) => (cur === best ? cur : best));
  });

  // Playing: a beat's lines in order, in the real voices
  const queue = useRef<{ beat: StoryBeat; next: number } | null>(null);
  const { id, phase } = player.state;
  const playingThis = !!id && id.startsWith(`${ID_PREFIX}${beat.key}-`);
  const busy = playingThis && (phase === 'loading' || phase === 'playing');
  const playingLine = playingThis ? Number(id!.slice(id!.lastIndexOf('-') + 1)) : -1;

  const request = (b: StoryBeat, i: number, line: StoryLine) => ({
    id: lineId(b, i),
    station: hindi.id,
    speaker: line.speaker,
    text: line.text,
    pace: line.pace,
    temperature: line.temperature,
  });
  const stopStory = () => {
    queue.current = null;
    if (player.state.id?.startsWith(ID_PREFIX)) player.stop();
  };
  const hear = () => {
    if (busy) {
      stopStory();
      return;
    }
    queue.current = beat.lines.length > 1 ? { beat, next: 1 } : null;
    player.toggle(request(beat, 0, beat.lines[0]));
  };
  useEffect(() => {
    const q = queue.current;
    if (!q || id !== null || phase !== null) return;
    queue.current = q.next + 1 < q.beat.lines.length ? { beat: q.beat, next: q.next + 1 } : null;
    player.toggle(request(q.beat, q.next, q.beat.lines[q.next]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, phase]);
  useEffect(() => {
    const current = player.state.id;
    if (current && current.startsWith(ID_PREFIX) && !current.startsWith(`${ID_PREFIX}${beat.key}-`)) stopStory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.key]);

  const onName = (value: string) => {
    setName(value);
    saveListenerName(cleanListenerName(value));
  };
  const pickTheme = (i: number) => {
    if (i === theme) return;
    stopStory();
    setTheme(i);
  };

  const ttfa = player.state.ttfa[lineId(beat, 0)];
  let status = '';
  if (playingThis && phase === 'loading') status = 'Calling Bulbul v4 Flash…';
  else if (playingThis && phase === 'playing') status = ttfa !== undefined ? `On air · first audio in ${ttfa} ms` : 'On air';
  else if (playingThis && phase === 'error') status = player.state.error ?? 'No signal. Try again.';
  else if (ttfa !== undefined) status = `First audio in ${ttfa} ms`;

  return (
    <section ref={sectionRef} className="lp-section lp-evening" aria-labelledby="evening-title">
      <div className="lp-wrap">
        <SectionHead id="evening-title" kicker="7:00 PM · One evening on Tarang FM" title="Tonight’s show, written for you.">
          Scroll through an evening. Every line is written and voiced live when you tune in; press Hear it for the real voice.
        </SectionHead>

        <div className="lp-evening-grid">
          <div className="lp-stage-col">
            <div ref={stageRef} className="lp-stage" data-live={busy} style={{ '--st': hindi.accent } as Vars}>
              <div className="lp-stage-top">
                <span className="lp-onair" data-state={busy ? 'live' : undefined} aria-hidden="true">
                  <span className="lp-onair-bulb" />
                  On air
                </span>
                <ol className="lp-stage-lamps" aria-label="Segments">
                  {STORY_LAMPS.map((l) => (
                    <li key={l.key} data-on={beat.lamp === l.key} aria-current={beat.lamp === l.key ? 'step' : undefined}>
                      {l.label}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="lp-stage-body">
                <AnimatePresence mode="wait" initial={false}>
                  <m.div
                    key={beat.key}
                    className="lp-stage-script"
                    initial={reduce ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    transition={{ duration: reduce ? 0.12 : 0.24, ease: EASE }}
                  >
                    <div className="lp-stage-scene" aria-hidden="true">
                      <Scene beat={beat} />
                    </div>

                    {beat.key === 'rj' && (
                      <label className="lp-stage-field">
                        <span>What should the RJ call you?</span>
                        <input
                          type="text"
                          value={name}
                          maxLength={LISTENER_NAME_MAX}
                          autoComplete="given-name"
                          placeholder="Your first name"
                          onChange={(e) => onName(e.target.value)}
                        />
                      </label>
                    )}

                    {beat.headlines && (
                      <ul className="lp-stage-news" aria-label={`Headlines right now${beat.city ? ` in ${beat.city}` : ''}`}>
                        {beat.headlines.map((h) => (
                          <li key={h.url}>
                            <span className="lp-stage-news-source">
                              <span className="lp-stage-pill">Live</span>
                              {h.source ?? 'News'}
                              {h.local ? ` · ${beat.city ?? 'your city'}` : ''}
                            </span>
                            <span className="lp-stage-news-title">{h.title}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {beat.key === 'ad' && (
                      <p className="lp-stage-ad" aria-label={`Tonight’s product: ${AD_PRODUCT.en}`}>
                        <span className="lp-stage-ad-tag">Tonight’s product</span>
                        <span className="lp-stage-ad-name" lang="hi">
                          {AD_PRODUCT.name}
                        </span>
                      </p>
                    )}

                    {beat.key === 'kahani' && (
                      <div className="lp-stage-chips" role="group" aria-label="Pick tonight’s story">
                        {KAHANI_THEMES.map((t, i) => (
                          <button
                            key={t.key}
                            type="button"
                            className="lp-stage-chip"
                            data-on={i === theme}
                            aria-pressed={i === theme}
                            aria-label={`${t.labelEn} (${t.label})`}
                            onClick={() => pickTheme(i)}
                            lang="hi"
                          >
                            {t.label}
                            <span lang="en">{t.labelEn}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {beat.lines.map((line, i) => (
                      <div key={line.speaker + i} className="lp-stage-line" data-on={playingLine === i} data-lit={playingLine === i || (playingLine < 0 && i === 0)}>
                        <p className="lp-stage-who">
                          <span className="lp-stage-avatar" aria-hidden="true">
                            {initial(line.name)}
                          </span>
                          <span className="lp-stage-name">
                            {line.name} <span>{line.style}</span>
                          </span>
                          <SpeakerId id={line.speaker} />
                        </p>
                        <p className="lp-native" lang="hi">
                          {line.text}
                        </p>
                        <p className="lp-english">{line.en}</p>
                      </div>
                    ))}
                  </m.div>
                </AnimatePresence>
              </div>

              <div className="lp-stage-foot">
                <button
                  type="button"
                  className="lp-ghost lp-ghost--sample"
                  data-phase={playingThis ? (phase ?? 'idle') : 'idle'}
                  onClick={hear}
                  aria-label={busy ? `Stop, ${beat.kicker}` : `Hear it: ${beat.kicker}`}
                >
                  <PlayGlyph phase={playingThis ? (phase ?? 'idle') : 'idle'} size={16} />
                  {busy ? 'Stop' : playingThis && phase === 'error' ? 'Try again' : 'Hear it'}
                </button>
                <StageMeter active={busy && phase === 'playing'} analyser={player.analyser} />
                <span className="lp-status" data-kind={playingThis && phase === 'error' ? 'error' : ttfa !== undefined ? 'ttfa' : undefined} aria-live="polite">
                  {status}
                </span>
              </div>
            </div>
          </div>

          <div className="lp-beats-col">
            <div className="lp-beam" aria-hidden="true">
              <m.div className="lp-beam-lit" style={{ scaleY: scrollYProgress }} />
              <m.div className="lp-beam-head" style={{ top: head }} />
            </div>
            <ol ref={listRef} className="lp-beats">
              {beats.map((b, i) => (
                <li
                  key={b.key}
                  ref={(el) => {
                    beatRefs.current[i] = el;
                  }}
                  className="lp-beat"
                  data-active={i === active}
                  data-passed={i < active}
                >
                  <p className="lp-beat-clock">
                    <span>{b.clock}</span>
                    <span>{b.kicker}</span>
                  </p>
                  <h3 className="lp-beat-title">
                    <span className="lp-beat-dot" aria-hidden="true" />
                    {b.title}
                  </h3>
                  <p className="lp-beat-body">{b.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
