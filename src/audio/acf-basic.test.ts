import { describe, expect, it } from "vitest";
import { REVISION_RADIUS, reviseHybrid, type RevisionFrame } from "./acf-basic";

type Row = RevisionFrame & { provisional?: boolean; marker?: string };

function stamp(point: RevisionFrame & { provisional: boolean }): Row {
  return { ...point, marker: "revised" };
}

describe("reviseHybrid", () => {
  it("replaces a nearby ACF2+ point with the Basic Pitch pitch", () => {
    const live: Row = { time: 1, hz: 1000, confidence: 1, provisional: true, marker: "live" };
    const result = reviseHybrid([live], [{ time: 1.002, hz: 2000, confidence: 0.8 }], 4186, stamp);
    expect(result.some((point) => point.marker === "live")).toBe(false);
    expect(result).toContainEqual({ time: 1.002, hz: 2000, confidence: 0.8, provisional: false, marker: "revised" });
  });

  it("keeps a pitch above the Basic Pitch ceiling when that frame is silent", () => {
    const high: Row = { time: 1, hz: 4500, confidence: 1, provisional: true };
    const result = reviseHybrid([high], [{ time: 1.002, hz: null, confidence: 0 }], 4186, stamp);
    expect(result).toEqual([{ time: 1, hz: 4500, confidence: 1, provisional: true, marker: "revised" }]);
  });

  it("drops a pitch above the ceiling when Basic Pitch has a note", () => {
    const high: Row = { time: 1, hz: 4500, confidence: 1, provisional: true };
    const result = reviseHybrid([high], [{ time: 1.002, hz: 880, confidence: 0.7 }], 4186, stamp);
    expect(result.map((point) => point.hz)).toEqual([880]);
  });

  it("turns an in-range ACF2+ pitch into silence when Basic Pitch is silent", () => {
    const live: Row = { time: 1, hz: 440, confidence: 1, provisional: true };
    const result = reviseHybrid([live], [{ time: 1.001, hz: null, confidence: 0 }], 4186, stamp);
    expect(result).toEqual([{ time: 1.001, hz: null, confidence: 0, provisional: false, marker: "revised" }]);
  });

  it("does not invent a silence point where ACF2+ had nothing", () => {
    const result = reviseHybrid([], [{ time: 1, hz: null, confidence: 0 }], 4186, stamp);
    expect(result).toEqual([]);
  });

  it("leaves provisional points outside the frame radius, and leaves other traces alone", () => {
    const far: Row = { time: 2, hz: 440, confidence: 1, provisional: true, marker: "far" };
    const other: Row = { time: 1.001, hz: 100, confidence: 1, marker: "other" };
    const edge: Row = {
      time: 1 + REVISION_RADIUS + 0.001,
      hz: 330,
      confidence: 1,
      provisional: true,
      marker: "edge",
    };
    const result = reviseHybrid([far, other, edge], [{ time: 1, hz: 880, confidence: 0.5 }], 4186, stamp);
    expect(result).toContain(far);
    expect(result).toContain(other);
    expect(result).toContain(edge);
    expect(result.some((point) => point.hz === 880 && point.provisional === false)).toBe(true);
  });
});
