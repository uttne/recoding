import { describe, expect, it } from "vitest";
import { createMpm, MPM_FMIN_HZ, mpmWindowSize } from "./mpm";

function sine(frequency: number, sampleRate: number, length: number, amplitude = 0.6): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) buffer[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  return buffer;
}

function cents(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected);
}

describe("MPM", () => {
  it("estimates sine frequencies within 10 cents", () => {
    for (const sampleRate of [16_000, 48_000]) {
      const mpm = createMpm(sampleRate);
      expect(mpm.bufferSize).toBe(mpmWindowSize(sampleRate));
      for (const frequency of [110, 220, 440, 880, 1_000, 2_000]) {
        const reading = mpm.estimate(sine(frequency, sampleRate, mpm.bufferSize));
        expect(reading.hz, `${frequency} Hz at ${sampleRate}`).not.toBeNull();
        expect(Math.abs(cents(reading.hz ?? 0, frequency)), `${frequency} Hz at ${sampleRate}`).toBeLessThan(10);
      }
    }
  });

  it("prefers 1000 Hz when a weaker 2000 Hz harmonic is added", () => {
    for (const sampleRate of [16_000, 48_000]) {
      const mpm = createMpm(sampleRate);
      const buffer = new Float32Array(mpm.bufferSize);
      for (let i = 0; i < buffer.length; i++) {
        const phase = (2 * Math.PI * i) / sampleRate;
        buffer[i] = 0.6 * Math.sin(1_000 * phase) + 0.3 * Math.sin(2_000 * phase);
      }
      const reading = mpm.estimate(buffer);
      expect(reading.hz, `harmonic at ${sampleRate}`).not.toBeNull();
      expect(Math.abs(cents(reading.hz ?? 0, 1_000))).toBeLessThan(50);
    }
  });

  it("drops a tone above the ceiling and stays silent below its floor", () => {
    const mpm = createMpm(48_000);
    const high = mpm.estimate(sine(3_000, 48_000, mpm.bufferSize), 2_100);
    expect(high.hz == null || Math.abs(cents(high.hz, 3_000)) > 50).toBe(true);
    const low = mpm.estimate(sine(MPM_FMIN_HZ - 20, 48_000, mpm.bufferSize));
    expect(low.hz).toBeNull();
    expect(mpm.estimate(sine(440, 48_000, mpm.bufferSize, 0.001)).hz).toBeNull();
    expect(mpm.estimate(new Float32Array(mpm.bufferSize)).hz).toBeNull();
  });
});
