type AudioContextCtor = typeof AudioContext;

interface AudioSessionLike {
  type: string;
}

let shared: AudioContext | null = null;

export function audioContextCtor(): AudioContextCtor | null {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  return (window as Window & { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

/** The engine's context, once unlocked. The recorder reuses it for its level meter. */
export function getSharedContext(): AudioContext | null {
  return shared;
}

export function setSharedContext(ctx: AudioContext | null): void {
  shared = ctx;
}

/** Safari 16.4+: 'playback' keeps Web Audio audible with the ring/silent switch on. */
export function setAudioSessionType(type: 'playback' | 'play-and-record' | 'auto'): void {
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    /* unsupported value */
  }
}

/** Cancel pending automation and glide from the current value to `target`. */
export function rampTo(param: AudioParam, target: number, seconds: number, ctx: BaseAudioContext): void {
  const t = ctx.currentTime;
  const hold = (param as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam }).cancelAndHoldAtTime;
  if (hold) {
    hold.call(param, t);
  } else {
    const v = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(v, t);
  }
  if (seconds <= 0) param.setValueAtTime(target, t);
  else param.linearRampToValueAtTime(target, t + seconds);
}
