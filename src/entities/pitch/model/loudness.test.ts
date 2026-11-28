import { afterEach, describe, expect, it, vi } from "vitest";
import type { PitchPoint } from "../../../audio/engine";
import { PITCH_GRID_CSS, pitchGridStroke, type GraphStyle } from "./graph";
import { LoudnessGraph } from "./loudness-graph";
import { droppedByLevel, keepsLevel, levelDbAt, levelNear, loudnessMarks, loudnessX, loudnessY, rmsToDb, type LevelSample } from "./loudness";

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

  it("drops a pitch under the floor and keeps one at it", () => {
    const marks = loudnessMarks(
      [point({ time: 1, hz: 440 }), point({ time: 1.02, hz: 466 })],
      [
        { time: 1, rms: 10 ** (-40 / 20) },
        { time: 1.02, rms: 10 ** (-50 / 20) },
      ],
      1.02,
      8,
      -40,
    );
    expect(marks.map((mark) => mark.hz)).toEqual([440]);
  });

  it("drops every note of a chord when the chunk is under the floor", () => {
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
      [{ time: 1, rms: 10 ** (-50 / 20) }],
      1,
      8,
      -40,
    );
    expect(marks).toEqual([]);
  });
});

describe("level gate", () => {
  it("keeps the floor and drops a missing or quieter level", () => {
    expect(keepsLevel(-40, -40)).toBe(true);
    expect(keepsLevel(-39.9, -40)).toBe(true);
    expect(keepsLevel(-40.1, -40)).toBe(false);
    expect(keepsLevel(null, -40)).toBe(false);
    expect(levelDbAt([{ time: 1, rms: 0.1 }], 1)).toBeCloseTo(-20, 5);
    const voiced = point({ time: 1, hz: 440, confidence: 0.99 });
    expect(droppedByLevel(voiced, -50, -40)).toBe(true);
    expect(droppedByLevel(voiced, -20, undefined)).toBe(false);
    expect(droppedByLevel(point({ time: 1, hz: null }), -50, -40)).toBe(false);
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

type RecordedStroke = { lineWidth: number; strokeStyle: string; x0: number; y0: number; x1: number; y1: number };

function recordingContext(): { ctx: CanvasRenderingContext2D; strokes: RecordedStroke[] } {
  const strokes: RecordedStroke[] = [];
  let lineWidth = 1;
  let strokeStyle = "";
  let x0 = 0;
  let y0 = 0;
  let x1 = 0;
  let y1 = 0;
  const ctx = new Proxy({} as CanvasRenderingContext2D, {
    get(_target, prop) {
      if (prop === "stroke") return () => strokes.push({ lineWidth, strokeStyle, x0, y0, x1, y1 });
      if (prop === "moveTo") {
        return (x: number, y: number) => {
          x0 = x;
          y0 = y;
          x1 = x;
          y1 = y;
        };
      }
      if (prop === "lineTo") {
        return (x: number, y: number) => {
          x1 = x;
          y1 = y;
        };
      }
      return () => undefined;
    },
    set(_target, prop, value) {
      if (prop === "lineWidth") lineWidth = Number(value);
      if (prop === "strokeStyle") strokeStyle = String(value);
      return true;
    },
  });
  return { ctx, strokes };
}

const octave: GraphStyle = {
  guides: false,
  pending: false,
  distinguish: false,
  pitchSpan: { low: 60, high: 72 },
};

function pitchWidths(strokes: RecordedStroke[], strokeStyle: string): number[] {
  return strokes
    .filter((stroke) => stroke.strokeStyle === strokeStyle && stroke.x0 === stroke.x1)
    .map((stroke) => stroke.lineWidth);
}

describe("loudness pitch grid weight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function draw(style: GraphStyle): RecordedStroke[] {
    const { ctx, strokes } = recordingContext();
    const canvas = {
      width: 800,
      height: 300,
      clientWidth: 800,
      clientHeight: 300,
      getContext: () => ctx,
    };
    new LoudnessGraph(canvas as unknown as HTMLCanvasElement).draw([], [], 1, { style });
    return strokes;
  }

  it("uses the same chromatic weights as the time-pitch grid", () => {
    const strokes = draw({ ...octave, scale: { kind: "chromatic" } });
    const c = pitchWidths(strokes, "rgba(243,234,215,1)");
    const white = pitchWidths(strokes, "rgba(243,234,215,0.78)");
    const black = pitchWidths(strokes, "rgba(243,234,215,0.55)");
    expect(c).toHaveLength(2);
    expect(white).toHaveLength(6);
    expect(black).toHaveLength(5);
    expect(c[0]).toBe(pitchGridStroke("main", 1).lineWidth);
    expect(white[0]).toBe(pitchGridStroke("middle", 1).lineWidth);
    expect(black[0]).toBe(pitchGridStroke("guide", 1).lineWidth);
    expect(c[0]).toBeGreaterThan(white[0]);
    expect(white[0]).toBeGreaterThan(black[0]);
    const levels = strokes.filter((stroke) => stroke.y0 === stroke.y1);
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((stroke) => stroke.lineWidth === 1)).toBe(true);
  });

  it("uses the same scale weights as the time-pitch grid", () => {
    const strokes = draw({ ...octave, scale: { kind: "chord", root: 0, quality: "major" } });
    const vertical = strokes.filter((stroke) => stroke.x0 === stroke.x1);
    const root = pitchWidths(strokes, "rgba(243,234,215,1)");
    const chord = pitchWidths(strokes, "rgba(243,234,215,0.78)");
    const degree = pitchWidths(strokes, "rgba(243,234,215,0.55)");
    expect(vertical).toHaveLength(8);
    expect(root).toHaveLength(2);
    expect(chord).toHaveLength(2);
    expect(degree).toHaveLength(4);
    expect(root[0]).toBe(pitchGridStroke("main", 1).lineWidth);
    expect(chord[0]).toBe(pitchGridStroke("middle", 1).lineWidth);
    expect(degree[0]).toBe(pitchGridStroke("guide", 1).lineWidth);
    expect(root[0]).toBeGreaterThan(chord[0]);
    expect(chord[0]).toBeGreaterThan(degree[0]);
  });

  it("multiplies the pitch lines by the device pixel ratio", () => {
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    const strokes = draw({ ...octave, scale: { kind: "chromatic" } });
    expect(pitchWidths(strokes, "rgba(243,234,215,0.55)")[0]).toBe(PITCH_GRID_CSS.guide * 2);
    expect(pitchWidths(strokes, "rgba(243,234,215,1)")[0]).toBe(PITCH_GRID_CSS.main * 2);
    expect(pitchWidths(strokes, "rgba(243,234,215,0.55)")[0]).toBeGreaterThan(1);
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
