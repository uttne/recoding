import { describe, expect, it } from "vitest";
import type { PitchPoint } from "./audio/engine";
import { LoudnessGraph } from "./loudness-graph";
import { levelNear, loudnessMarks, loudnessX, loudnessY, rmsToDb, type LevelSample } from "./loudness";

function point(partial: Partial<PitchPoint> & Pick<PitchPoint, "time" | "hz">): PitchPoint {
  return {
    confidence: 1,
    detector: "acf2",
    ...partial,
  };
}

describe("rmsToDb", () => {
  it("maps full scale to 0 dB and a tenth to -20 dB", () => {
    expect(rmsToDb(1)).toBeCloseTo(0, 5);
    expect(rmsToDb(0.1)).toBeCloseTo(-20, 5);
    expect(rmsToDb(0.001)).toBeCloseTo(-60, 5);
  });

  it("rejects silence and non-finite values", () => {
    expect(rmsToDb(0)).toBeNull();
    expect(rmsToDb(-0.2)).toBeNull();
    expect(rmsToDb(Number.NaN)).toBeNull();
  });
});

describe("levelNear", () => {
  const levels: LevelSample[] = [
    { time: 0, rms: 0.1 },
    { time: 0.1, rms: 0.2 },
    { time: 0.2, rms: 0.3 },
  ];

  it("returns the closer sample inside the tolerance", () => {
    expect(levelNear(levels, 0.14)).toBe(0.2);
    expect(levelNear(levels, 0.16)).toBe(0.3);
    expect(levelNear(levels, 0.1)).toBe(0.2);
  });

  it("returns null when the nearest chunk is too far, or the list is empty", () => {
    expect(levelNear(levels, 0.5)).toBeNull();
    expect(levelNear([], 0.1)).toBeNull();
  });
});

describe("loudnessMarks", () => {
  const levels: LevelSample[] = [{ time: 1, rms: 0.1 }];

  it("places every note of a chord at the same loudness", () => {
    const marks = loudnessMarks(
      [
        point({
          time: 1,
          hz: 440,
          detector: "basic-poly",
          pitches: [
            { hz: 440, confidence: 0.9 },
            { hz: 554, confidence: 0.4 },
          ],
        }),
      ],
      levels,
      1,
      8,
    );
    expect(marks.map((mark) => mark.hz)).toEqual([440, 554]);
    expect(marks[0].db).toBeCloseTo(-20, 5);
    expect(marks[1].db).toBeCloseTo(marks[0].db, 5);
  });

  it("keeps a pitch at the window edge and drops silence, older points, and unmatched times", () => {
    const marks = loudnessMarks(
      [
        point({ time: 1, hz: null }),
        point({ time: 1, hz: 440 }),
        point({ time: 1.2, hz: 880 }),
        point({ time: 0, hz: 220 }),
      ],
      levels,
      9,
      8,
    );
    expect(marks.map((mark) => mark.hz)).toEqual([440]);
  });

  it("drops levels quieter than -60 dBFS", () => {
    const marks = loudnessMarks([point({ time: 1, hz: 440 })], [{ time: 1, rms: 0.0005 }], 1, 8);
    expect(marks).toEqual([]);
  });
});

describe("LoudnessGraph", () => {
  it("draws the newest voiced pitch as a large dot", () => {
    const arcs: Array<[number, number, number]> = [];
    const ctx = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "arc") return (x: number, y: number, radius: number) => arcs.push([x, y, radius]);
          return () => undefined;
        },
        set() {
          return true;
        },
      },
    );
    const canvas = {
      width: 800,
      height: 300,
      clientWidth: 800,
      clientHeight: 300,
      getContext: () => ctx,
    };
    const graph = new LoudnessGraph(canvas as unknown as HTMLCanvasElement);
    graph.draw([point({ time: 1, hz: 440 })], [{ time: 1, rms: 0.1 }], 1);
    expect(arcs).toHaveLength(1);
    expect(arcs[0][0]).toBeCloseTo(loudnessX(69, 48, 740, 30, 108), 5);
    expect(arcs[0][1]).toBeCloseTo(loudnessY(-20, 16, 258), 5);
    expect(arcs[0][2]).toBeCloseTo(5.6, 5);

    arcs.length = 0;
    graph.draw([point({ time: 1, hz: 440 })], [{ time: 1, rms: 0.1 }], 5);
    expect(arcs).toHaveLength(1);
    expect(arcs[0][2]).toBeCloseTo(3.2, 5);
  });
});

describe("loudness axes", () => {
  it("puts low pitch on the left and 0 dB at the top", () => {
    expect(loudnessX(30, 10, 200, 30, 108)).toBeCloseTo(10, 5);
    expect(loudnessX(108, 10, 200, 30, 108)).toBeCloseTo(210, 5);
    expect(loudnessX(69, 10, 200, 30, 108)).toBeCloseTo(10 + (39 / 78) * 200, 5);
    expect(loudnessY(0, 8, 120)).toBeCloseTo(8, 5);
    expect(loudnessY(-60, 8, 120)).toBeCloseTo(128, 5);
    expect(loudnessY(6, 8, 120)).toBeCloseTo(8, 5);
    expect(loudnessX(12, 10, 200, 30, 108)).toBeCloseTo(10, 5);
  });
});
