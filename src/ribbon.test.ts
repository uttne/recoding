import { describe, expect, it } from "vitest";
import type { PitchPoint } from "./audio/engine";
import { RibbonGraph } from "./ribbon-graph";
import {
  CORE_PX,
  CORE_WHITE_MIX,
  HALO_MAX_PX,
  HALO_LAYERS,
  RIBBON_REST_ALPHA,
  densifyRibbon,
  loudnessGain,
  medianLoudness,
  mixWhite,
  ribbonOffsets,
  ribbonRuns,
} from "./ribbon";

function point(partial: Partial<PitchPoint> & Pick<PitchPoint, "time" | "hz">): PitchPoint {
  return {
    confidence: 1,
    detector: "acf2",
    ...partial,
  };
}

function dbToRms(db: number): number {
  return 10 ** (db / 20);
}

describe("loudnessGain", () => {
  it("clamps below −48 dB and above −12 dB", () => {
    expect(loudnessGain(-48)).toBe(0);
    expect(loudnessGain(-60)).toBe(0);
    expect(loudnessGain(-12)).toBe(1);
    expect(loudnessGain(0)).toBe(1);
    expect(loudnessGain(-30)).toBeCloseTo(0.5, 5);
    expect(loudnessGain(Number.NaN)).toBe(0);
  });
});

describe("medianLoudness", () => {
  it("removes a one-frame spike and keeps the steady level", () => {
    const smoothed = medianLoudness([
      { time: 1, db: -20 },
      { time: 1.01, db: -20 },
      { time: 1.02, db: -6 },
      { time: 1.03, db: -20 },
      { time: 1.04, db: -20 },
    ]);
    expect(smoothed[2]).toBe(-20);
  });

  it("does not mix levels across a missing sample or a long gap", () => {
    const broken = medianLoudness([
      { time: 0, db: -20 },
      { time: 0.01, db: -20 },
      { time: 0.02, db: null },
      { time: 0.03, db: -6 },
      { time: 0.04, db: -6 },
    ]);
    expect(broken[1]).toBe(-20);
    expect(broken[2]).toBeNull();
    expect(broken[3]).toBe(-6);

    const gapped = medianLoudness([
      { time: 0, db: -20 },
      { time: 0.01, db: -20 },
      { time: 0.08, db: -6 },
    ]);
    expect(gapped[1]).toBe(-20);
    expect(gapped[2]).toBe(-6);
  });
});

describe("mixWhite", () => {
  it("leaves the detector color alone at zero and lightens it a quarter toward white", () => {
    expect(mixWhite("#e6a15c", 0)).toBe("#e6a15c");
    expect(mixWhite("#e6a15c", 0.25)).toBe("rgb(236, 185, 133)");
  });
});

describe("ribbonRuns", () => {
  it("keeps a smoothed level on every vertex instead of one width for the whole note", () => {
    const times = [1, 1.01, 1.02, 1.03, 1.04];
    const runs = ribbonRuns(
      times.map((time) => point({ time, hz: 440 })),
      times.map((time, index) => ({ time, rms: dbToRms(index === 2 ? -12 : -24) })),
      1.04,
      440,
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].vertices.every((vertex) => Math.abs(vertex.gain - loudnessGain(-24)) < 1e-6)).toBe(true);
    expect(runs[0].alpha).toBe(1);
  });

  it("gives both notes of a chord the same loudness", () => {
    const runs = ribbonRuns(
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
        point({
          time: 1.02,
          hz: 442,
          detector: "basic-poly",
          pitches: [
            { hz: 442, confidence: 0.9 },
            { hz: 550, confidence: 0.4 },
          ],
        }),
      ],
      [
        { time: 1, rms: dbToRms(-20) },
        { time: 1.02, rms: dbToRms(-20) },
      ],
      1.02,
      440,
    );
    expect(runs).toHaveLength(2);
    expect(runs[0].vertices.map((vertex) => vertex.gain)).toEqual(runs[1].vertices.map((vertex) => vertex.gain));
    expect(runs[0].alpha).toBe(1);
  });
});

describe("densifyRibbon", () => {
  it("places the halfway loudness between two samples", () => {
    const dense = densifyRibbon(
      [
        { time: 0, midi: 60, gain: 0 },
        { time: 0.02, midi: 62, gain: 1 },
      ],
      0.01,
    );
    expect(dense.map((vertex) => vertex.gain)).toEqual([0, 0.5, 1]);
    expect(dense[1].midi).toBeCloseTo(61, 5);
  });
});

describe("ribbonOffsets", () => {
  it("widens the middle of a swell and pinches the ends", () => {
    const { left, right } = ribbonOffsets([
      { x: 0, y: 0, radius: 0 },
      { x: 10, y: 0, radius: 12 },
      { x: 20, y: 0, radius: 0 },
    ]);
    expect(left[1].y - right[1].y).toBeCloseTo(24, 5);
    expect(left[0].y).toBeCloseTo(0, 5);
    expect(left[2].y).toBeCloseTo(0, 5);
  });
});

describe("RibbonGraph", () => {
  it("draws a wide faint halo for a loud note and only a core for a quiet one", () => {
    const strokes: Array<{ lineWidth: number; alpha: number; strokeStyle: string }> = [];
    const fills: number[] = [];
    let lineWidth = 1;
    let alpha = 1;
    let strokeStyle = "";
    let ys: number[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "stroke") return () => strokes.push({ lineWidth, alpha, strokeStyle });
          if (prop === "beginPath") return () => { ys = []; };
          if (prop === "moveTo") return (_x: number, y: number) => { ys = [y]; };
          if (prop === "lineTo") return (_x: number, y: number) => { ys.push(y); };
          if (prop === "fill") {
            return () => {
              fills.push(Math.max(...ys) - Math.min(...ys));
            };
          }
          return () => undefined;
        },
        set(_target, prop, value) {
          if (prop === "lineWidth") lineWidth = Number(value);
          if (prop === "globalAlpha") alpha = Number(value);
          if (prop === "strokeStyle") strokeStyle = String(value);
          return true;
        },
      },
    );
    const canvas = {
      width: 800,
      height: 400,
      clientWidth: 800,
      clientHeight: 400,
      getContext: () => ctx,
    };
    const graph = new RibbonGraph(canvas as unknown as HTMLCanvasElement);
    graph.draw(
      [
        point({ time: 0, hz: 440 }),
        point({ time: 0.02, hz: 440 }),
        point({ time: 0.9, hz: 440 }),
        point({ time: 0.92, hz: 440 }),
      ],
      [
        { time: 0, rms: dbToRms(-12) },
        { time: 0.02, rms: dbToRms(-12) },
        { time: 0.9, rms: dbToRms(-48) },
        { time: 0.92, rms: dbToRms(-48) },
      ],
      1,
    );

    const marks = strokes.filter((stroke) => stroke.lineWidth >= CORE_PX);
    const cores = marks.filter((stroke) => stroke.lineWidth === CORE_PX);
    expect(cores).toHaveLength(2);
    expect(cores.find((stroke) => stroke.alpha === 1)?.strokeStyle).toBe("#e6a15c");
    expect(cores.find((stroke) => stroke.alpha === RIBBON_REST_ALPHA)?.strokeStyle).toBe(
      mixWhite("#e6a15c", CORE_WHITE_MIX),
    );
    expect(fills).toHaveLength(HALO_LAYERS);
    expect(Math.max(...fills)).toBeCloseTo(HALO_MAX_PX * 2, 1);
  });
});
