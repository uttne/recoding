import { describe, expect, it } from "vitest";
import { clampFixedSpan, easePitchSpan, followPitchSpan, type PitchSpan } from "./pitch-axis";

const bounds: PitchSpan = { low: 30, high: 108 };

describe("clampFixedSpan", () => {
  it("keeps a typed range inside the full axis and at least an octave tall", () => {
    expect(clampFixedSpan(48, 72, bounds)).toEqual({ low: 48, high: 72 });
    expect(clampFixedSpan(70, 60, bounds)).toEqual({ low: 60, high: 72 });
    expect(clampFixedSpan(10, 200, bounds)).toEqual({ low: 30, high: 108 });
    expect(clampFixedSpan(50, 55, bounds)).toEqual({ low: 50, high: 62 });
  });
});

describe("followPitchSpan", () => {
  const window: PitchSpan = { low: 48, high: 72 };

  it("does not move while the note stays away from the edges", () => {
    expect(followPitchSpan(window, 60, 24, bounds)).toEqual(window);
  });

  it("shifts up only far enough to leave room above the note", () => {
    const next = followPitchSpan(window, 70, 24, bounds);
    expect(next.high - next.low).toBeCloseTo(24, 5);
    expect(next.high - 70).toBeCloseTo(24 * 0.38, 5);
    expect(next.low).toBeGreaterThan(window.low);
  });

  it("shifts down the same way and keeps a silent window where it was", () => {
    const next = followPitchSpan(window, 50, 24, bounds);
    expect(50 - next.low).toBeCloseTo(24 * 0.38, 5);
    expect(followPitchSpan(window, null, 24, bounds)).toEqual(window);
  });

  it("sticks to the top of the full range instead of centering past it", () => {
    const next = followPitchSpan(window, 107, 24, bounds);
    expect(next.high).toBeCloseTo(108, 5);
    expect(next.low).toBeCloseTo(84, 5);
  });
});

describe("easePitchSpan", () => {
  it("moves part of the way and snaps after a long pause", () => {
    const from = { low: 48, high: 72 };
    const to = { low: 60, high: 84 };
    const step = easePitchSpan(from, to, 0.2);
    expect(step.low).toBeGreaterThan(from.low);
    expect(step.low).toBeLessThan(to.low);
    expect(easePitchSpan(from, to, 1)).toEqual(to);
  });
});
