import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PcmStreamDecoder } from './pcm';

const SPIKE = fileURLToPath(new URL('../../tmp/spike/', import.meta.url));
const PCM_FILE = SPIKE + 'hi_linear16.pcm';
const WAV_FILE = SPIKE + 'hi_wav.wav';

function int16Bytes(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setInt16(i * 2, v, true));
  return out;
}

function wavHeader(extraChunk = false): Uint8Array {
  const parts: number[] = [];
  const str = (s: string) => [...s].forEach((c) => parts.push(c.charCodeAt(0)));
  const u32 = (n: number) => parts.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff);
  const u16 = (n: number) => parts.push(n & 0xff, (n >>> 8) & 0xff);
  str('RIFF');
  u32(0xffffffff);
  str('WAVE');
  str('fmt ');
  u32(16);
  u16(1);
  u16(1);
  u32(24000);
  u32(48000);
  u16(2);
  u16(16);
  if (extraChunk) {
    str('LIST');
    u32(5);
    parts.push(1, 2, 3, 4, 5, 0);
  }
  str('data');
  u32(0xffffffff);
  return new Uint8Array(parts);
}

function decodeAll(decoder: PcmStreamDecoder, chunks: Uint8Array[]): Float32Array {
  const parts: Float32Array[] = [];
  for (const c of chunks) {
    const out = decoder.push(c);
    if (out) parts.push(out);
  }
  const tail = decoder.flush();
  if (tail) parts.push(tail);
  const total = parts.reduce((n, p) => n + p.length, 0);
  const merged = new Float32Array(total);
  let at = 0;
  for (const p of parts) {
    merged.set(p, at);
    at += p.length;
  }
  return merged;
}

function split(bytes: Uint8Array, sizes: number[]): Uint8Array[] {
  const out: Uint8Array[] = [];
  let at = 0;
  let i = 0;
  while (at < bytes.length) {
    const n = sizes[i++ % sizes.length];
    out.push(bytes.subarray(at, at + n));
    at += n;
  }
  return out;
}

describe('PcmStreamDecoder', () => {
  it('converts Int16LE to Float32 in [-1, 1)', () => {
    const d = new PcmStreamDecoder();
    const out = d.push(int16Bytes([0, 16384, -16384, 32767, -32768]))!;
    expect(Array.from(out)).toEqual([0, 0.5, -0.5, 32767 / 32768, -1]);
  });

  it('carries odd trailing bytes across chunks', () => {
    const values = [1, -2, 300, -400, 32767, -32768, 12345];
    const bytes = int16Bytes(values);
    const expected = values.map((v) => v / 32768);
    for (const sizes of [[1], [3], [1, 2], [5, 1, 3], [7], [13]]) {
      const got = decodeAll(new PcmStreamDecoder(), split(bytes, sizes));
      expect(Array.from(got)).toEqual(expected);
    }
  });

  it('returns null for a lone byte and completes it on the next push', () => {
    const d = new PcmStreamDecoder();
    const bytes = int16Bytes([1234, -5678]);
    expect(d.push(bytes.subarray(0, 1))).toBeNull();
    const out = d.push(bytes.subarray(1))!;
    expect(Array.from(out)).toEqual([1234 / 32768, -5678 / 32768]);
  });

  it('drops a dangling odd byte on flush', () => {
    const d = new PcmStreamDecoder();
    expect(d.push(new Uint8Array([0, 0, 0]))!.length).toBe(1);
    expect(d.flush()).toBeNull();
  });

  it('skips a streaming WAV header and reads the fmt chunk', () => {
    const d = new PcmStreamDecoder();
    const body = int16Bytes([100, -200, 300]);
    const out = d.push(new Uint8Array([...wavHeader(), ...body]))!;
    expect(Array.from(out)).toEqual([100, -200, 300].map((v) => v / 32768));
    expect(d.format).toEqual({ sampleRate: 24000, channels: 1, bitsPerSample: 16 });
  });

  it('skips a WAV header split across chunks at every boundary', () => {
    const header = wavHeader(true);
    const body = int16Bytes([7, -8, 9, -10]);
    const all = new Uint8Array([...header, ...body]);
    const expected = [7, -8, 9, -10].map((v) => v / 32768);
    for (let cut = 1; cut < all.length; cut++) {
      const got = decodeAll(new PcmStreamDecoder(), [all.subarray(0, cut), all.subarray(cut)]);
      expect(Array.from(got), `cut at ${cut}`).toEqual(expected);
    }
    const byteByByte = decodeAll(new PcmStreamDecoder(), split(all, [1]));
    expect(Array.from(byteByByte)).toEqual(expected);
  });

  it('treats a stream that only starts like RIFF as raw PCM', () => {
    const bytes = new Uint8Array([0x52, 0x49, 0x00, 0x00]);
    const got = decodeAll(new PcmStreamDecoder(), [bytes.subarray(0, 1), bytes.subarray(1)]);
    expect(got.length).toBe(2);
  });

  it('decodes short raw PCM that never completes the RIFF check', () => {
    const got = decodeAll(new PcmStreamDecoder(), [new Uint8Array([0x52, 0x49])]);
    expect(got.length).toBe(1);
  });

  it('can be reused after flush', () => {
    const d = new PcmStreamDecoder();
    decodeAll(d, [new Uint8Array([...wavHeader(), 1, 0])]);
    const got = decodeAll(d, [int16Bytes([5])]);
    expect(Array.from(got)).toEqual([5 / 32768]);
  });
});

describe.skipIf(!existsSync(PCM_FILE) || !existsSync(WAV_FILE))('spike streams', () => {
  it('decodes the raw linear16 stream with odd chunking', () => {
    const bytes = new Uint8Array(readFileSync(PCM_FILE));
    const whole = decodeAll(new PcmStreamDecoder(), [bytes]);
    expect(whole.length).toBe(bytes.length / 2);
    const chunked = decodeAll(new PcmStreamDecoder(), split(bytes, [4097, 12001, 3, 999]));
    expect(chunked).toEqual(whole);
    const peak = whole.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('decodes the WAV stream: 44-byte header skipped, PCM from byte 44', () => {
    const bytes = new Uint8Array(readFileSync(WAV_FILE));
    const d = new PcmStreamDecoder();
    const whole = decodeAll(d, [bytes]);
    expect(whole.length).toBe((bytes.length - 44) / 2);
    expect(d.format?.sampleRate).toBe(24000);
    expect(d.format?.channels).toBe(1);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    for (const i of [0, 1000, 50000, whole.length - 1]) {
      expect(whole[i]).toBe(view.getInt16(44 + i * 2, true) / 32768);
    }
    const chunked = decodeAll(new PcmStreamDecoder(), split(bytes, [5, 17, 3, 4093]));
    expect(chunked).toEqual(whole);
  });
});
