import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { VOICE_COUNT, VOICE_GROUPS, type CastVoice } from './data';
import { PlayGlyph, SectionHead, SpeakerId, type Vars } from './ui';
import { useAnalyserLevel } from './useAnalyser';
import type { SamplePhase, VoicePlayer } from './useVoicePlayer';

const SEGMENTS = 14;

/** Spotlight that follows the pointer across a voice chip (idea from React Bits ChromaGrid, MIT). */
function spot(e: PointerEvent<HTMLButtonElement>) {
  if (e.pointerType !== 'mouse') return;
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

function cap(s: string) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function phaseOf(player: VoicePlayer, id: string): SamplePhase | 'idle' {
  return player.state.id === id ? (player.state.phase ?? 'idle') : 'idle';
}

function request(v: CastVoice) {
  return {
    id: v.speaker,
    station: v.station.id,
    speaker: v.speaker,
    text: v.line.text,
    pace: v.pace,
    temperature: v.temperature,
  };
}

/** LED level meter on the monitor: lights segments from the live analyser, no re-renders. */
function LevelMeter({ active, analyser }: { active: boolean; analyser: () => AnalyserNode | null }) {
  const leds = useRef<(HTMLSpanElement | null)[]>([]);
  const held = useRef(0);
  useAnalyserLevel(active, analyser, (level) => {
    held.current = level > held.current ? level : held.current * 0.9 + level * 0.1;
    const lit = Math.round(held.current * SEGMENTS);
    leds.current.forEach((el, i) => el?.toggleAttribute('data-on', i < lit));
  });
  return (
    <span className="lp-level" data-active={active} aria-hidden="true">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <span
          key={i}
          data-zone={i >= SEGMENTS - 2 ? 'hot' : i >= SEGMENTS - 5 ? 'warm' : undefined}
          ref={(el) => {
            leds.current[i] = el;
          }}
        />
      ))}
    </span>
  );
}

function Monitor({ voice, player }: { voice: CastVoice; player: VoicePlayer }) {
  const phase = phaseOf(player, voice.speaker);
  const busy = phase === 'loading' || phase === 'playing';
  const ttfa = player.state.ttfa[voice.speaker];
  let status = `Plays the ${voice.roles} on ${voice.station.languageName} ${voice.station.frequency}`;
  if (phase === 'loading') status = 'Streaming from Bulbul v4 Flash…';
  else if (phase === 'playing') status = ttfa !== undefined ? `On air. First audio in ${ttfa} ms` : 'On air';
  else if (phase === 'error') status = player.state.error ?? 'That voice did not come through.';
  else if (ttfa !== undefined) status = `First audio in ${ttfa} ms`;

  return (
    <div className="lp-monitor" data-phase={phase} style={{ '--st': voice.station.accent } as Vars}>
      <div className="lp-monitor-top">
        <button
          type="button"
          className="lp-play"
          onClick={() => player.toggle(request(voice))}
          aria-label={`${busy ? 'Stop' : 'Play'} ${voice.name}, ${voice.style} voice in ${voice.station.languageName}`}
        >
          <PlayGlyph phase={phase} size={20} />
        </button>
        <div className="lp-monitor-who">
          <p className="lp-monitor-name">
            {voice.name} <span>{cap(voice.style)}</span>
          </p>
          <SpeakerId id={voice.speaker} />
        </div>
        <LevelMeter active={phase === 'playing'} analyser={player.analyser} />
      </div>
      <p className="lp-native" lang={voice.station.language}>
        {voice.line.text}
      </p>
      <p className="lp-english">{voice.line.en}</p>
      <p className="lp-monitor-status" data-kind={phase === 'error' ? 'error' : ttfa !== undefined ? 'ttfa' : undefined} aria-live="polite">
        {status}
      </p>
    </div>
  );
}

export default function VoiceTuner({ player }: { player: VoicePlayer }) {
  const [tab, setTab] = useState(0);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const uid = useId();

  const group = VOICE_GROUPS[tab];
  const selected = group.voices.find((v) => v.speaker === picked[tab]) ?? group.voices[0];

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = VOICE_GROUPS.length;
    const to =
      e.key === 'ArrowRight' ? (i + 1) % n : e.key === 'ArrowLeft' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(to);
    tabs.current[to]?.focus();
  };

  const pick = (v: CastVoice) => {
    setPicked((p) => ({ ...p, [tab]: v.speaker }));
    player.toggle(request(v));
  };

  return (
    <section className="lp-section lp-voices" aria-labelledby="voices-title">
      <div className="lp-wrap">
        <SectionHead id="voices-title" title="Hear every voice">
          {VOICE_COUNT} Bulbul v4 Flash personas, each cast for one job. Tap a voice and it streams in a blink.
        </SectionHead>

        <div className="lp-tabs" role="tablist" aria-label="Stations" style={{ '--i': String(tab) } as Vars}>
          {VOICE_GROUPS.map(({ station, voices }, i) => (
            <button
              key={station.id}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-tab-${i}`}
              aria-selected={tab === i}
              aria-controls={`${uid}-panel`}
              tabIndex={tab === i ? 0 : -1}
              className="lp-tab"
              style={{ '--st': station.accent } as Vars}
              onClick={() => setTab(i)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              <span className="lp-tab-lamp" aria-hidden="true" />
              <span className="lp-tab-name">{station.languageName}</span>
              <span className="lp-tab-meta">{voices.length} voices</span>
            </button>
          ))}
        </div>

        <div
          className="lp-tuner"
          role="tabpanel"
          id={`${uid}-panel`}
          aria-labelledby={`${uid}-tab-${tab}`}
          style={{ '--st': group.station.accent } as Vars}
        >
          <Monitor voice={selected} player={player} />
          <ul className="lp-vlist" aria-label={`${group.station.languageName} voices`}>
            {group.voices.map((v) => {
              const phase = phaseOf(player, v.speaker);
              const busy = phase === 'loading' || phase === 'playing';
              return (
                <li key={v.speaker}>
                  <button
                    type="button"
                    className="lp-vchip"
                    data-phase={phase}
                    data-selected={v.speaker === selected.speaker}
                    onClick={() => pick(v)}
                    onPointerMove={spot}
                    aria-label={`${busy ? 'Stop' : 'Play'} ${v.name}, ${v.style}, ${v.roles}`}
                  >
                    <span className="lp-vchip-glyph" aria-hidden="true">
                      <PlayGlyph phase={phase} size={14} />
                    </span>
                    <span className="lp-vchip-name">{v.name}</span>
                    <span className="lp-vchip-style">{cap(v.style)}</span>
                    <span className="lp-vchip-role">{cap(v.roles)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
