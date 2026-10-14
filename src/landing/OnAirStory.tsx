import { AnimatePresence, m, useInView, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LISTENER_NAME_MAX } from '../../shared/constants';
import { getStation } from '../../shared/stations';
import type { PhoneCall, Source } from '../../shared/types';
import { getContext, getPhoneRecent } from '../radio/api';
import { cleanListenerName, loadListenerName, saveListenerName } from '../radio/listener';
import {
  CALL_TYPE_LABEL,
  greetingLine,
  KAHANI_THEMES,
  kahaniLine,
  newsLine,
  STORY_BEATS,
  STORY_LAMPS,
  studioLine,
  type StoryBeat,
  type StoryLine,
} from './data';
import { PhoneIcon } from './icons';
import { PlayGlyph, SectionHead, SpeakerId, type Vars } from './ui';
import { useAnalyserLevel } from './useAnalyser';
import type { VoicePlayer } from './useVoicePlayer';

const EASE = [0.22, 1, 0.36, 1] as const;
const ID_PREFIX = 'story-';
const hindi = getStation('hi');
const BARS = [0.55, 0.85, 1, 0.7, 0.9, 0.6];

const lineId = (beat: StoryBeat, i: number) => `${ID_PREFIX}${beat.key}-${i}`;

/** "7:04 PM" → minutes past 7 */
const minutesOf = (clock: string) => {
  const m = /^(\d+):(\d+)/.exec(clock);
  return m ? (Number(m[1]) - 7) * 60 + Number(m[2]) : 0;
};
const clockText = (minutes: number) => {
  const h = 7 + Math.floor(minutes / 60);
  return `${h}:${String(Math.round(minutes) % 60).padStart(2, '0')} PM`;
};

interface Live {
  city?: string;
  headlines: Source[];
  call: PhoneCall | null;
}

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

const initial = (name: string) => [...name][0]?.toUpperCase() ?? '•';

/**
 * An evening on Tarang FM, told as you scroll: seven beats pass a pinned on-air stage that shows what the
 * radio is saying at that moment, with real pieces of tonight's show in it (your name, the headlines right
 * now, a story you pick, the latest call on the studio line), and every beat can be heard in the real voice.
 */
export default function OnAirStory({ player }: { player: VoicePlayer }) {
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const beatRefs = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const reduce = useReducedMotion() ?? false;

  // The pieces of tonight's show that the reader changes or that come in live
  const [name, setName] = useState(() => loadListenerName() ?? '');
  const [theme, setTheme] = useState(0);
  const [live, setLive] = useState<Live | null>(null);
  const near = useInView(sectionRef, { once: true, margin: '600px 0px' });
  useEffect(() => {
    if (!near) return;
    let on = true;
    void Promise.allSettled([getContext(hindi.id), getPhoneRecent()]).then(([ctx, phone]) => {
      if (!on) return;
      const context = ctx.status === 'fulfilled' ? ctx.value : undefined;
      const calls = phone.status === 'fulfilled' ? phone.value.calls : [];
      setLive({ city: context?.city?.trim() || undefined, headlines: context?.headlines ?? [], call: calls[0] ?? null });
    });
    return () => {
      on = false;
    };
  }, [near]);

  const beats = useMemo(
    () =>
      STORY_BEATS.map((b): StoryBeat => {
        if (b.key === 'rj') return { ...b, lines: [greetingLine(cleanListenerName(name))] };
        if (b.key === 'news' && live?.headlines.length) {
          return { ...b, lines: [newsLine(live.city, live.headlines[0])], headlines: live.headlines.slice(0, 3), city: live.city };
        }
        if (b.key === 'kahani') return { ...b, lines: [kahaniLine(KAHANI_THEMES[theme])] };
        if (b.key === 'phone' && live?.call) {
          const call = live.call;
          return {
            ...b,
            studio: {
              name: call.name?.trim() || 'A listener',
              city: call.city?.trim() || '',
              number: call.maskedNumber,
              type: CALL_TYPE_LABEL[call.type] ?? 'Message',
              live: true,
            },
            lines: [studioLine(call)],
          };
        }
        return b;
      }),
    [name, theme, live],
  );
  const beat = beats[active];

  // The beam fills with the reader's progress through the beats; the clock on the stage keeps time with it
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start 0.6', 'end 0.6'] });
  const head = useTransform(scrollYProgress, (v) => `${(v * 100).toFixed(2)}%`);

  // The active beat is the one under the reading line: mid-viewport, or lower down when the stage is pinned on
  // top (a fixed fraction, not the stage's edge: the stage changes height with each beat, and a line that
  // moved with it could flip beats back and forth)
  useMotionValueEvent(scrollYProgress, 'change', () => {
    const stage = stageRef.current?.getBoundingClientRect();
    const pinned = !!stage && stage.width >= window.innerWidth * 0.85;
    const line = window.innerHeight * (pinned ? 0.72 : 0.5);
    let best = 0;
    let bestDist = Infinity;
    let frac = 0;
    beatRefs.current.forEach((el, i) => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dist = r.top <= line && r.bottom > line ? 0 : Math.min(Math.abs(r.top - line), Math.abs(r.bottom - line));
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
        frac = Math.max(0, Math.min(1, (line - r.top) / Math.max(1, r.height)));
      }
    });
    if (clockRef.current) {
      const from = minutesOf(STORY_BEATS[best].clock);
      const to = best + 1 < STORY_BEATS.length ? minutesOf(STORY_BEATS[best + 1].clock) : from + 3;
      clockRef.current.textContent = clockText(from + (to - from) * frac);
    }
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

  const stopStory = () => {
    queue.current = null;
    if (player.state.id?.startsWith(ID_PREFIX)) player.stop();
  };

  const play = (b: StoryBeat) => {
    queue.current = b.lines.length > 1 ? { beat: b, next: 1 } : null;
    player.toggle(request(b, 0, b.lines[0]));
  };

  const hear = () => {
    if (busy) {
      stopStory();
      return;
    }
    play(beat);
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
    <section ref={sectionRef} className="lp-section lp-story" aria-labelledby="story-title">
      <div className="lp-wrap">
        <SectionHead id="story-title" title="One evening on Tarang FM">
          Scroll through a show. Every line is written and voiced live when you tune in, so parts of this one are live too: type your
          name, pick tonight’s story, and press Hear it for the actual Bulbul voice.
        </SectionHead>

        <div className="lp-story-grid">
          <div className="lp-story-stage-col">
            <div ref={stageRef} className="lp-stage" data-live={busy} style={{ '--st': hindi.accent } as Vars}>
              <div className="lp-stage-top">
                <span className="lp-onair" data-state={busy ? 'live' : 'standby'} aria-hidden="true">
                  <span className="lp-onair-bulb" />
                  On air
                </span>
                <span ref={clockRef} className="lp-stage-clock" aria-hidden="true">
                  {beat.clock}
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
                      <div className="lp-stage-news">
                        <p className="lp-stage-news-head">
                          <span className="lp-stage-pill">Live</span>
                          Headlines right now{beat.city ? ` · ${beat.city}` : ''}
                        </p>
                        <ul>
                          {beat.headlines.map((h) => (
                            <li key={h.url}>
                              <span className="lp-stage-news-source">
                                {h.source ?? 'News'}
                                {h.local ? ' · your city' : ''}
                              </span>
                              <span className="lp-stage-news-title">{h.title}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
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
                          {beat.studio.live && <span className="lp-stage-pill">Live</span>}
                          {beat.studio.name}
                          {beat.studio.city ? ` · ${beat.studio.city}` : ''}
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
                      else play(b);
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
        <p className="lp-footnote">
          Voices shown: {hindi.languageName} {hindi.frequency}. Every station has its own cast and runs the same show in its language.
        </p>
      </div>
    </section>
  );
}
