/** Server clock estimate for the shared live show: serverNow ≈ Date.now() + offset. */

/** Offsets kept for the median */
const SAMPLES = 5;
/** Round trips longer than this say little about the clock and are ignored */
const MAX_RTT_MS = 10_000;

export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class ServerClock {
  private samples: number[] = [];
  /** Rough offset from a message's `now` (one-way latency included), used until a ping comes back */
  private rough: number | null = null;

  /** Offset in ms to add to the local epoch clock */
  get offsetMs(): number {
    if (this.samples.length) return Math.round(median(this.samples));
    return this.rough ?? 0;
  }

  get synced(): boolean {
    return this.samples.length > 0;
  }

  /** A server timestamp seen at local epoch time `localNow`, before any ping has been answered. */
  seed(serverNow: number, localNow: number): void {
    if (this.samples.length || !Number.isFinite(serverNow)) return;
    this.rough = serverNow - localNow;
  }

  /**
   * A pong: `serverNow` stamped by the server, `rttMs` measured on the monotonic clock, and
   * `localNow` the local epoch time it arrived. offset = server now − (send time + rtt/2).
   * Returns false when the sample was rejected.
   */
  add(serverNow: number, rttMs: number, localNow: number): boolean {
    if (!Number.isFinite(serverNow) || !Number.isFinite(rttMs) || rttMs < 0 || rttMs > MAX_RTT_MS) return false;
    const sentAt = localNow - rttMs;
    this.samples = [...this.samples, serverNow - (sentAt + rttMs / 2)].slice(-SAMPLES);
    return true;
  }
}
