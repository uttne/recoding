import { describe, expect, it } from "vitest";
import { acf2Plus, acfWindowSize } from "./acf2";

function sine(frequency: number, sampleRate: number, length: number, amplitude = 0.6): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

describe("acf2Plus", () => {
  it("estimates sine frequencies within 10 cents", () => {
    for (const sampleRate of [16_000, 48_000]) {
      const window = acfWindowSize(sampleRate);
      for (const frequency of [82.41, 220, 440, 880]) {
        const hz = acf2Plus(sine(frequency, sampleRate, window), sampleRate);
        const cents = 1200 * Math.log2(hz / frequency);
        expect(Math.abs(cents)).toBeLessThan(10);
      }
    }
  });

  it("returns -1 for silence", () => {
    expect(acf2Plus(sine(440, 48_000, 2048, 0.001), 48_000)).toBe(-1);
    expect(acf2Plus(new Float32Array(2048), 48_000)).toBe(-1);
  });
});
