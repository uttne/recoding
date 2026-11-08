import { describe, expect, it } from "vitest";
import { acf2Plus, acfWindowSize } from "./acf2";

function sine(frequency: number, sampleRate: number, length: number, amplitude = 0.6): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return buffer;
}

function cents(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected);
}

describe("acf2Plus", () => {
  it("estimates sine frequencies within 10 cents", () => {
    for (const sampleRate of [16_000, 48_000]) {
      const window = acfWindowSize(sampleRate);
      for (const frequency of [82.41, 220, 440, 880, 1_000, 2_000]) {
        const hz = acf2Plus(sine(frequency, sampleRate, window), sampleRate);
        expect(Math.abs(cents(hz, frequency)), `${frequency} Hz at ${sampleRate}`).toBeLessThan(10);
      }
    }
  });

  it("prefers 1000 Hz when a weaker 2000 Hz harmonic is added", () => {
    for (const sampleRate of [16_000, 48_000]) {
      const window = acfWindowSize(sampleRate);
      const buffer = new Float32Array(window);
      for (let i = 0; i < window; i++) {
        const phase = (2 * Math.PI * i) / sampleRate;
        buffer[i] = 0.6 * Math.sin(1_000 * phase) + 0.3 * Math.sin(2_000 * phase);
      }
      const hz = acf2Plus(buffer, sampleRate);
      expect(Math.abs(cents(hz, 1_000)), `harmonic at ${sampleRate}`).toBeLessThan(50);
    }
  });

  it("returns -1 for silence", () => {
    expect(acf2Plus(sine(440, 48_000, 2048, 0.001), 48_000)).toBe(-1);
    expect(acf2Plus(new Float32Array(2048), 48_000)).toBe(-1);
  });
});
