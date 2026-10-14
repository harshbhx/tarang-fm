/**
 * Incremental decoder for /api/tts streams: raw 16-bit LE mono PCM, or the same
 * PCM behind a streaming WAV header (RIFF with 0xFFFFFFFF size fields).
 */

const RIFF = [0x52, 0x49, 0x46, 0x46];
const MAX_HEADER_BYTES = 64 * 1024;

type Mode = 'detect' | 'header' | 'pcm';

export interface WavFormat {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

function fourcc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

export class PcmStreamDecoder {
  private mode: Mode = 'detect';
  private head: Uint8Array = new Uint8Array(0);
  private carry = -1;
  /** Format from the WAV `fmt ` chunk, when the stream had one. */
  format: WavFormat | null = null;
  /** Total samples emitted so far. */
  samples = 0;

  push(bytes: Uint8Array): Float32Array<ArrayBuffer> | null {
    if (bytes.length === 0) return null;
    if (this.mode === 'pcm') return this.decode(bytes);

    this.head = concat(this.head, bytes);
    if (this.mode === 'detect') {
      const n = Math.min(this.head.length, 4);
      for (let i = 0; i < n; i++) {
        if (this.head[i] !== RIFF[i]) return this.toPcm(0);
      }
      if (this.head.length < 4) return null;
      this.mode = 'header';
    }
    return this.parseHeader();
  }

  /** Ends the stream. Returns any samples still held back; a lone odd byte is dropped. */
  flush(): Float32Array<ArrayBuffer> | null {
    let out: Float32Array<ArrayBuffer> | null = null;
    if (this.mode === 'detect' && this.head.length > 0) out = this.toPcm(0);
    this.reset();
    return out;
  }

  reset(): void {
    this.mode = 'detect';
    this.head = new Uint8Array(0);
    this.carry = -1;
  }

  private parseHeader(): Float32Array<ArrayBuffer> | null {
    const h = this.head;
    if (h.length < 12) return null;
    if (fourcc(h, 8) !== 'WAVE') return this.toPcm(0);
    const view = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let at = 12;
    while (at + 8 <= h.length) {
      const id = fourcc(h, at);
      const size = view.getUint32(at + 4, true);
      if (id === 'data') return this.toPcm(at + 8);
      if (id === 'fmt ' && at + 8 + 16 <= h.length) {
        this.format = {
          channels: view.getUint16(at + 10, true),
          sampleRate: view.getUint32(at + 12, true),
          bitsPerSample: view.getUint16(at + 22, true),
        };
      }
      const next = at + 8 + size + (size & 1);
      if (size === 0xffffffff || next > MAX_HEADER_BYTES) return this.toPcm(Math.min(at + 8, h.length));
      if (next > h.length) return null;
      at = next;
    }
    if (h.length > MAX_HEADER_BYTES) return this.toPcm(h.length);
    return null;
  }

  private toPcm(offset: number): Float32Array<ArrayBuffer> | null {
    const rest = this.head.subarray(offset);
    this.head = new Uint8Array(0);
    this.mode = 'pcm';
    return rest.length > 0 ? this.decode(rest) : null;
  }

  private decode(bytes: Uint8Array): Float32Array<ArrayBuffer> | null {
    const hasCarry = this.carry >= 0;
    const total = bytes.length + (hasCarry ? 1 : 0);
    const count = total >> 1;
    if (count === 0) {
      this.carry = bytes[0];
      return null;
    }
    const out = new Float32Array(count);
    let i = 0;
    let s = 0;
    if (hasCarry) {
      out[s++] = int16(this.carry, bytes[0]);
      i = 1;
    }
    for (; s < count; s++, i += 2) out[s] = int16(bytes[i], bytes[i + 1]);
    this.carry = i < bytes.length ? bytes[i] : -1;
    this.samples += count;
    return out;
  }
}

function int16(lo: number, hi: number): number {
  const v = (hi << 8) | lo;
  return (v >= 0x8000 ? v - 0x10000 : v) / 32768;
}
