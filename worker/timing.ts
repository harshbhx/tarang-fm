/** Collects durations for the Server-Timing response header. */
export class Timings {
  private readonly entries = new Map<string, number>();

  add(name: string, ms: number): void {
    this.entries.set(name, (this.entries.get(name) ?? 0) + Math.max(0, Math.round(ms)));
  }

  async measure<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      this.add(name, Date.now() - t0);
    }
  }

  header(): string {
    return [...this.entries].map(([name, dur]) => `${name};dur=${dur}`).join(', ');
  }
}
