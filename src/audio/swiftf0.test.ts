import { describe, expect, it } from "vitest";
import { SWIFT_FRAME_PERIOD, SWIFT_HOP, SWIFT_LOOKAHEAD_FRAMES, SwiftF0Stream, type SwiftFrame } from "./swiftf0";

function hops(count: number, amplitude: number): Float32Array {
  return new Float32Array(count * SWIFT_HOP).fill(amplitude);
}

function fakeInfer(pitchHz: number) {
  return async (audio: Float32Array) => {
    const frames = Math.max(1, Math.floor(audio.length / SWIFT_HOP));
    return {
      pitch: new Float64Array(frames).fill(pitchHz),
      confidence: new Float32Array(frames).fill(0.95),
    };
  };
}

describe("SwiftF0Stream", () => {
  it("holds frames until 176 ms of later audio has arrived", async () => {
    const frames: SwiftFrame[] = [];
    const stream = new SwiftF0Stream(fakeInfer(440), (chunk) => frames.push(...chunk));
    const early = SWIFT_LOOKAHEAD_FRAMES;
    stream.push(hops(early, 0.2));
    await stream.whenIdle();
    expect(frames).toHaveLength(0);

    stream.push(hops(early, 0.2));
    await stream.whenIdle();
    expect(frames).toHaveLength(early);
    expect(frames[0].time).toBe(0);
    expect(frames[1].time).toBeCloseTo(SWIFT_FRAME_PERIOD);
    expect(frames[0].hz).toBe(440);

    await stream.flush();
    expect(frames).toHaveLength(early * 2);
  });

  it("zeroes confidence when the hop is silent", async () => {
    const frames: SwiftFrame[] = [];
    const stream = new SwiftF0Stream(fakeInfer(440), (chunk) => frames.push(...chunk));
    stream.push(hops(4, 0));
    await stream.flush();
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.confidence === 0)).toBe(true);
  });
});
