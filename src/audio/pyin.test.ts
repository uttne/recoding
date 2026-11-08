import { track } from "@audio/pitch-pyin";
import { describe, expect, it } from "vitest";
import { PyinStream } from "./pyin";

function sine(frequency: number, sampleRate: number, length: number, harmonic = 0): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const phase = (2 * Math.PI * i) / sampleRate;
    buffer[i] = 0.6 * Math.sin(frequency * phase) + harmonic * Math.sin(2 * frequency * phase);
  }
  return buffer;
}

function cents(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected);
}

function middle(trackHz: ArrayLike<number>): number[] {
  const start = Math.floor(trackHz.length * 0.25);
  const end = Math.floor(trackHz.length * 0.75);
  const voiced: number[] = [];
  for (let i = start; i < end; i++) if (trackHz[i] > 0) voiced.push(trackHz[i]);
  return voiced;
}

describe("pYIN", () => {
  it("estimates sine frequencies within 15 cents", () => {
    for (const sampleRate of [16_000, 48_000]) {
      for (const frequency of [220, 440, 880, 1_000]) {
        const result = track(sine(frequency, sampleRate, sampleRate), {
          fs: sampleRate,
          minFreq: 50,
          maxFreq: 2_100,
        });
        const voiced = middle(result.f0);
        expect(voiced.length, `${frequency} Hz at ${sampleRate}`).toBeGreaterThan(10);
        const median = voiced[Math.floor(voiced.length / 2)];
        expect(Math.abs(cents(median, frequency)), `${frequency} Hz at ${sampleRate}`).toBeLessThan(15);
      }
    }
  });

  it("keeps the fundamental when a weaker octave is added", () => {
    const sampleRate = 48_000;
    const result = track(sine(1_000, sampleRate, sampleRate, 0.5), { fs: sampleRate, minFreq: 50, maxFreq: 2_100 });
    const voiced = middle(result.f0);
    expect(voiced.length).toBeGreaterThan(10);
    expect(Math.abs(cents(voiced[Math.floor(voiced.length / 2)], 1_000))).toBeLessThan(50);
  });

  it("does not report a pitch above the ceiling", () => {
    const result = track(sine(1_000, 16_000, 16_000), { fs: 16_000, minFreq: 50, maxFreq: 500 });
    for (const hz of result.f0) if (hz > 0) expect(hz).toBeLessThan(550);
  });

  it("emits a confirmed 440 Hz from the live stream", () => {
    const frames: { hz: number | null }[] = [];
    const stream = new PyinStream(48_000, () => 2_100, (chunk) => frames.push(...chunk));
    const audio = sine(440, 48_000, 48_000);
    for (let offset = 0; offset < audio.length; offset += 512) stream.push(audio.subarray(offset, offset + 512));
    const voiced = frames.filter((frame) => frame.hz != null).map((frame) => frame.hz ?? 0);
    expect(voiced.length).toBeGreaterThan(10);
    expect(Math.abs(cents(voiced[Math.floor(voiced.length / 2)], 440))).toBeLessThan(15);
  });
});
