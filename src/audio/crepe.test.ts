import { describe, expect, it } from "vitest";
import { CREPE_BINS, CREPE_FMAX_HZ, CREPE_FRAME, CrepeStream, crepeBinHz, decodeCrepeFrame } from "./crepe";

function cents(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected);
}

describe("Tiny-CREPE decode", () => {
  it("turns a peaked salience into the bin frequency", () => {
    const probs = new Float32Array(CREPE_BINS);
    probs[228] = 0.93;
    const reading = decodeCrepeFrame(probs, 0, 30, CREPE_FMAX_HZ);
    expect(reading.hz).not.toBeNull();
    expect(Math.abs(cents(reading.hz ?? 0, crepeBinHz(228)))).toBeLessThan(1);
    expect(Math.abs(cents(reading.hz ?? 0, 440))).toBeLessThan(15);
    expect(reading.confidence).toBeCloseTo(0.93);
  });

  it("rejects a peak outside the ceiling and a weak peak", () => {
    const probs = new Float32Array(CREPE_BINS);
    probs[228] = 0.93;
    expect(decodeCrepeFrame(probs, 0, 30, 200).hz).toBeNull();
    probs[228] = 0.2;
    expect(decodeCrepeFrame(probs, 0, 30, CREPE_FMAX_HZ).hz).toBeNull();
  });

  it("decodes centered frames from the stream", async () => {
    const got: { time: number; hz: number | null }[] = [];
    const stream = new CrepeStream(
      16_000,
      async (_frames, rows) => {
        const probs = new Float32Array(rows * CREPE_BINS);
        for (let row = 0; row < rows; row++) probs[row * CREPE_BINS + 228] = 0.95;
        return probs;
      },
      (frames) => got.push(...frames),
      (error) => {
        throw error;
      },
      () => CREPE_FMAX_HZ,
    );
    stream.setEnabled(true);
    stream.push(new Float32Array(CREPE_FRAME * 2));
    await stream.whenIdle();
    expect(got.length).toBeGreaterThan(3);
    expect(got[0].time).toBeCloseTo(0.032, 3);
    for (const frame of got) expect(Math.abs(cents(frame.hz ?? 0, 440))).toBeLessThan(15);
  });
});
