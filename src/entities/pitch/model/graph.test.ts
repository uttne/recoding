import { describe, expect, it } from "vitest";
import type { PitchPoint } from "../../../audio/engine";
import { PitchGraph, pitchVoices } from "./graph";

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
});

describe("PitchGraph", () => {
  it("strokes one line at the pitch width", () => {
    const widths: number[] = [];
    let lineWidth = 1;
    const ctx = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "stroke") return () => widths.push(lineWidth);
          return () => undefined;
        },
        set(_target, prop, value) {
          if (prop === "lineWidth") lineWidth = Number(value);
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
    const graph = new PitchGraph(canvas as unknown as HTMLCanvasElement);
    graph.draw([point({ time: 1, hz: 440 }), point({ time: 1.02, hz: 442 })], 1.02);
    expect(widths.filter((width) => width >= 2)).toEqual([2.4]);
  });
});
