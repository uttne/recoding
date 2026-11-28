import { afterEach, describe, expect, it, vi } from "vitest";
import type { PitchPoint } from "../../../audio/engine";
import {
  PITCH_GRID_CSS,
  PITCH_TRACE_CSS,
  PitchGraph,
  paintPitchTimeAxes,
  pitchGridStroke,
  pitchVoices,
  type GraphStyle,
} from "./graph";

function point(partial: Partial<PitchPoint> & Pick<PitchPoint, "time" | "hz">): PitchPoint {
  return {
    confidence: 1,
    detector: "acf2",
    ...partial,
  };
}

describe("pitchVoices", () => {
  it("joins a small step and breaks a jump, a long gap, and silence", () => {
    const now = 1.1;
    expect(pitchVoices([point({ time: 1, hz: 440 }), point({ time: 1.02, hz: 450 })], now, 440)).toHaveLength(1);
    expect(pitchVoices([point({ time: 1, hz: 440 }), point({ time: 1.02, hz: 880 })], now, 440)).toHaveLength(2);
    expect(pitchVoices([point({ time: 1, hz: 440 }), point({ time: 1.06, hz: 440 })], now, 440).map((voice) => voice.points.length)).toEqual([
      1, 1,
    ]);
    expect(
      pitchVoices(
        [point({ time: 1, hz: 440 }), point({ time: 1.01, hz: null }), point({ time: 1.02, hz: 440 })],
        now,
        440,
      ),
    ).toHaveLength(2);
  });

  it("lets Basic Pitch bridge a wider step than ACF2+", () => {
    const hz = 440 * 2 ** (0.7 / 12);
    const pair = (detector: PitchPoint["detector"]) =>
      pitchVoices(
        [
          point({ time: 1, hz: 440, detector }),
          point({ time: 1.02, hz, detector }),
        ],
        1.02,
        440,
      );
    expect(pair("basic-mono")).toHaveLength(1);
    expect(pair("acf2")).toHaveLength(2);
  });

  it("shares the boundary when a provisional color takes over", () => {
    const voices = pitchVoices(
      [
        point({ time: 1, hz: 440, detector: "acf-basic", provisional: true }),
        point({ time: 1.01, hz: 440, detector: "acf-basic", provisional: false }),
      ],
      1.01,
      440,
    );
    expect(voices.map((voice) => voice.provisional)).toEqual([true, false]);
    expect(voices[0].points.map((item) => item.time)).toEqual([1, 1.01]);
    expect(voices[1].points.map((item) => item.time)).toEqual([1, 1.01]);
  });

  it("keeps an ACF2+ to Basic handoff as one stroke when the colors are unified", () => {
    const voices = pitchVoices(
      [
        point({ time: 1, hz: 440, detector: "acf-basic", provisional: true }),
        point({ time: 1.01, hz: 440, detector: "acf-basic", provisional: false }),
      ],
      1.01,
      440,
      { splitProvisional: false },
    );
    expect(voices).toHaveLength(1);
    expect(voices[0].points.map((item) => item.time)).toEqual([1, 1.01]);
  });

  it("breaks on a quiet chunk and would join if that point were only removed", () => {
    const now = 1.08;
    const notes = [1, 1.02, 1.04, 1.06, 1.08].map((time) => point({ time, hz: 440 }));
    const levels = notes.map((note, index) => ({ time: note.time, rms: 10 ** ((index === 2 ? -52 : -18) / 20) }));
    const gated = pitchVoices(notes, now, 440, { levels, levelFloor: -40 });
    expect(gated.map((voice) => voice.points.map((item) => item.time))).toEqual([[1, 1.02], [1.06, 1.08]]);
    const removed = pitchVoices([notes[0], notes[1], notes[3], notes[4]], now, 440);
    expect(removed).toHaveLength(1);
    expect(removed[0].points.map((item) => item.time)).toEqual([1, 1.02, 1.06, 1.08]);
  });

  it("uses chunk loudness for every detector and ignores confidence", () => {
    const now = 1.02;
    const voices = pitchVoices(
      [
        point({ time: 1, hz: 440, confidence: 0.99, detector: "crepe" }),
        point({ time: 1.02, hz: 442, confidence: 0.05, detector: "mpm" }),
      ],
      now,
      440,
      {
        levels: [
          { time: 1, rms: 10 ** (-55 / 20) },
          { time: 1.02, rms: 10 ** (-12 / 20) },
        ],
        levelFloor: -40,
      },
    );
    expect(voices).toHaveLength(1);
    expect(voices[0].detector).toBe("mpm");
    expect(voices[0].points.map((item) => item.time)).toEqual([1.02]);
  });

  it("keeps a chord at the floor and breaks when the same chunk is quieter", () => {
    const chord = (time: number) =>
      point({
        time,
        hz: 440,
        detector: "basic-poly",
        pitches: [
          { hz: 440, confidence: 1 },
          { hz: 554, confidence: 1 },
        ],
      });
    const kept = pitchVoices([chord(1)], 1, 440, { levels: [{ time: 1, rms: 10 ** (-40 / 20) }], levelFloor: -40 });
    expect(kept).toHaveLength(2);
    const broken = pitchVoices([chord(1), chord(1.02), chord(1.04)], 1.04, 440, {
      levels: [
        { time: 1, rms: 10 ** (-15 / 20) },
        { time: 1.02, rms: 10 ** (-50 / 20) },
        { time: 1.04, rms: 10 ** (-15 / 20) },
      ],
      levelFloor: -40,
    });
    expect(broken.every((voice) => voice.points.length === 1)).toBe(true);
    expect(broken.filter((voice) => voice.points[0].time === 1.02)).toHaveLength(0);
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

function widthsFor(strokes: RecordedStroke[], strokeStyle: string): number[] {
  return strokes.filter((stroke) => stroke.strokeStyle === strokeStyle).map((stroke) => stroke.lineWidth);
}

describe("pitch grid weight", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("draws C thicker than the other white keys, and those thicker than the black keys", () => {
    const { ctx, strokes } = recordingContext();
    paintPitchTimeAxes(ctx, 800, 400, 1, 440, { style: { ...octave, scale: { kind: "chromatic" } } });
    const c = widthsFor(strokes, "rgba(243,234,215,0.28)");
    const white = widthsFor(strokes, "rgba(243,234,215,0.12)");
    const black = widthsFor(strokes, "rgba(243,234,215,0.05)");
    expect(c).toHaveLength(2);
    expect(white).toHaveLength(6);
    expect(black).toHaveLength(5);
    expect(c[0]).toBe(pitchGridStroke("main", "chromatic", 1).lineWidth);
    expect(white[0]).toBe(pitchGridStroke("middle", "chromatic", 1).lineWidth);
    expect(black[0]).toBe(pitchGridStroke("guide", "chromatic", 1).lineWidth);
    expect(new Set(c)).toEqual(new Set([c[0]]));
    expect(new Set(white)).toEqual(new Set([white[0]]));
    expect(new Set(black)).toEqual(new Set([black[0]]));
    expect(c[0]).toBeGreaterThan(white[0]);
    expect(white[0]).toBeGreaterThan(black[0]);
    expect(PITCH_GRID_CSS.main).toBeGreaterThan(PITCH_GRID_CSS.middle);
    expect(PITCH_GRID_CSS.middle).toBeGreaterThan(PITCH_GRID_CSS.guide);
    expect(PITCH_GRID_CSS.guide).toBeGreaterThanOrEqual(1);
  });

  it("draws the root thicker than chord tones, and those thicker than the other scale tones", () => {
    const { ctx, strokes } = recordingContext();
    paintPitchTimeAxes(ctx, 800, 400, 1, 440, {
      style: { ...octave, scale: { kind: "chord", root: 0, quality: "major" } },
    });
    const root = widthsFor(strokes, "rgba(243,234,215,0.55)");
    const chord = widthsFor(strokes, "rgba(243,234,215,0.28)");
    const degree = widthsFor(strokes, "rgba(243,234,215,0.12)");
    expect(strokes).toHaveLength(8);
    expect(root).toHaveLength(2);
    expect(chord).toHaveLength(2);
    expect(degree).toHaveLength(4);
    expect(root[0]).toBe(pitchGridStroke("main", "scale", 1).lineWidth);
    expect(chord[0]).toBe(pitchGridStroke("middle", "scale", 1).lineWidth);
    expect(degree[0]).toBe(pitchGridStroke("guide", "scale", 1).lineWidth);
    expect(root[0]).toBeGreaterThan(chord[0]);
    expect(chord[0]).toBeGreaterThan(degree[0]);
    expect(root[0]).toBe(pitchGridStroke("main", "chromatic", 1).lineWidth);
  });

  it("multiplies every grid tier by the device pixel ratio", () => {
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    const { ctx, strokes } = recordingContext();
    paintPitchTimeAxes(ctx, 800, 400, 1, 440, { style: { ...octave, scale: { kind: "chromatic" } } });
    const c = widthsFor(strokes, "rgba(243,234,215,0.28)");
    const white = widthsFor(strokes, "rgba(243,234,215,0.12)");
    const black = widthsFor(strokes, "rgba(243,234,215,0.05)");
    expect(c[0]).toBe(PITCH_GRID_CSS.main * 2);
    expect(white[0]).toBe(PITCH_GRID_CSS.middle * 2);
    expect(black[0]).toBe(PITCH_GRID_CSS.guide * 2);
    expect(black[0]).toBeGreaterThan(1);
  });
});

describe("PitchGraph", () => {
  it("strokes the sung pitch thicker than the heaviest grid line", () => {
    const { ctx, strokes } = recordingContext();
    const canvas = {
      width: 800,
      height: 400,
      clientWidth: 800,
      clientHeight: 400,
      getContext: () => ctx,
    };
    const graph = new PitchGraph(canvas as unknown as HTMLCanvasElement);
    graph.draw([point({ time: 1, hz: 440 }), point({ time: 1.02, hz: 442 })], 1.02);
    const trace = strokes.filter((stroke) => stroke.strokeStyle === "#e6a15c");
    const grid = strokes.filter((stroke) => stroke.y0 === stroke.y1);
    expect(trace).toHaveLength(1);
    expect(trace[0].lineWidth).toBe(PITCH_TRACE_CSS);
    expect(trace[0].lineWidth).toBeGreaterThan(Math.max(...grid.map((stroke) => stroke.lineWidth)));
    expect(trace[0].lineWidth).toBeGreaterThan(PITCH_GRID_CSS.main);
  });
});
