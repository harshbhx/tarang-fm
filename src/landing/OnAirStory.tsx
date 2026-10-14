import { AnimatePresence, m, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getStation } from '../../shared/stations';
import { loadListenerName } from '../radio/listener';
import { greetingLine, STORY_BEATS, STORY_LAMPS, type StoryBeat, type StoryLine } from './data';
import { PhoneIcon } from './icons';
import { PlayGlyph, SectionHead, SpeakerId, type Vars } from './ui';
import { useAnalyserLevel } from './useAnalyser';
import type { VoicePlayer } from './useVoicePlayer';

const EASE = [0.22, 1, 0.36, 1] as const;
const ID_PREFIX = 'story-';
const hindi = getStation('hi');
const BARS = [0.55, 0.85, 1, 0.7, 0.9, 0.6];

const lineId = (beat: StoryBeat, i: number) => `${ID_PREFIX}${beat.key}-${i}`;

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

function initial(name: string) {
  return [...name][0]?.toUpperCase() ?? '•';
}

/**
 * An evening on Tarang FM, told as you scroll: seven beats pass a pinned on-air stage that shows what the
 * radio is saying at that moment, and every beat can be heard in the real Bulbul voice.
 */
export default function OnAirStory({ player }: { player: VoicePlayer }) {
  const listRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const beatRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion() ?? false;
  const [name] = useState(() => loadListenerName());
  const beats = useMemo(
    () => STORY_BEATS.map((b) => (b.key === 'rj' && name ? { ...b, lines: [greetingLine(name)] } : b)),
    [name],
  );
  const beat = beats[active];

  // The beam fills with the reader's progress through the beats
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 0.6', 'end 0.6'] });
  const head = useTransform(scrollYProgress, (v) => `${(v * 100).toFixed(2)}%`);

  // The active beat is the one under the reading line: mid-viewport, or mid of what's below a stage pinned on top
  useMotionValueEvent(scrollYProgress, 'change', () => {
    const stage = stageRef.current?.getBoundingClientRect();
    const pinnedTop = stage && stage.width >= window.innerWidth * 0.85 ? Math.max(0, stage.bottom) : 0;
    const line = pinnedTop + (window.innerHeight - pinnedTop) * 0.5;
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

  // Playing: one beat's lines in order, in the real voices
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

  const hear = () => {
    if (busy) {
      queue.current = null;
      player.stop();
      return;
    }
    queue.current = beat.lines.length > 1 ? { beat, next: 1 } : null;
    player.toggle(request(beat, 0, beat.lines[0]));
  };

  // The next line of a multi-voice beat starts once the previous one has finished
  useEffect(() => {
    const q = queue.current;
    if (!q || id !== null || phase !== null) return;
    queue.current = q.next + 1 < q.beat.lines.length ? { beat: q.beat, next: q.next + 1 } : null;
    player.toggle(request(q.beat, q.next, q.beat.lines[q.next]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, phase]);

  // Scrolling on to the next beat takes the previous one off air
  useEffect(() => {
    const current = player.state.id;
    if (current && current.startsWith(ID_PREFIX) && !current.startsWith(`${ID_PREFIX}${beat.key}-`)) {
      queue.current = null;
      player.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beat.key]);

  const ttfa = player.state.ttfa[lineId(beat, 0)];
  let status = '';
  if (playingThis && phase === 'loading') status = 'Calling Bulbul v4 Flash…';
  else if (playingThis && phase === 'playing') status = ttfa !== undefined ? `On air · first audio in ${ttfa} ms` : 'On air';
  else if (playingThis && phase === 'error') status = player.state.error ?? 'No signal. Try again.';
  else if (ttfa !== undefined) status = `First audio in ${ttfa} ms`;

  const lamp = busy ? 'live' : 'standby';

  return (
    <section className="lp-section lp-story" aria-labelledby="story-title">
      <div className="lp-wrap">
        <SectionHead id="story-title" title="One evening on Tarang FM">
          Scroll through a show. Every line here is written and voiced live when you tune in; press Hear it and the actual voice
          streams from Bulbul v4 Flash.
        </SectionHead>

        <div className="lp-story-grid">
          <div className="lp-story-stage-col">
            <div ref={stageRef} className="lp-stage" data-live={busy} style={{ '--st': hindi.accent } as Vars}>
              <div className="lp-stage-top">
                <span className="lp-onair" data-state={lamp} aria-hidden="true">
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
                    initial={reduce ? false : { opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    transition={{ duration: reduce ? 0.12 : 0.26, ease: EASE }}
                  >
                    <p className="lp-stage-kicker">
                      <span>{beat.clock}</span>
                      <span>{beat.kicker}</span>
                    </p>
                    {beat.caller && (
                      <figure className="lp-stage-caller">
                        <figcaption>You, heard by Saaras v4</figcaption>
                        <p className="lp-native" lang="hi">
                          {beat.caller.text}
                        </p>
                        <p className="lp-english">{beat.caller.en}</p>
                      </figure>
                    )}
                    {beat.studio && (
                      <div className="lp-stage-studio" aria-label="Studio line card">
                        <span className="lp-stage-studio-icon" aria-hidden="true">
                          <PhoneIcon size={14} />
                        </span>
                        <span className="lp-stage-studio-who">
                          {beat.studio.name} · {beat.studio.city}
                        </span>
                        <span className="lp-stage-studio-meta">
                          {beat.studio.number} · {beat.studio.type}
                        </span>
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

          <div className="lp-story-beats-col">
            <div className="lp-story-beam" aria-hidden="true">
              <m.div className="lp-story-beam-lit" style={{ scaleY: scrollYProgress }} />
              <m.div className="lp-story-beam-head" style={{ top: head }} />
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
                  <button
                    type="button"
                    className="lp-beat-hear"
                    onClick={() => {
                      setActive(i);
                      if (i === active) hear();
                      else {
                        queue.current = b.lines.length > 1 ? { beat: b, next: 1 } : null;
                        player.toggle(request(b, 0, b.lines[0]));
                      }
                    }}
                    aria-label={`Hear it: ${b.kicker}`}
                  >
                    <PlayGlyph phase={id?.startsWith(`${ID_PREFIX}${b.key}-`) ? (phase ?? 'idle') : 'idle'} size={14} />
                    Hear it
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <p className="lp-footnote">Voices shown: {hindi.languageName} {hindi.frequency}. Every station has its own cast and runs the same show in its language.</p>
      </div>
    </section>
  );
}
