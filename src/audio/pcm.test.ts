import { describe, expect, it } from "vitest";
import { floatToInt16, int16ToFloat, joinFloat32 } from "./pcm";

describe("pcm", () => {
  it("joins chunks without changing samples", () => {
    const joined = joinFloat32([Float32Array.of(1, 2), Float32Array.of(), Float32Array.of(3)]);
    expect(Array.from(joined)).toEqual([1, 2, 3]);
  });

  it("keeps full-scale samples inside int16", () => {
    const pcm = floatToInt16(Float32Array.of(-2, -1, 0, 1, 2));
    expect(Array.from(pcm)).toEqual([-32_768, -32_768, 0, 32_767, 32_767]);
  });

  it("round-trips a mid-scale sample", () => {
    const pcm = floatToInt16(Float32Array.of(0.5, -0.5));
    const floats = int16ToFloat(pcm);
    expect(floats[0]).toBeCloseTo(0.5, 4);
    expect(floats[1]).toBeCloseTo(-0.5, 4);
  });
});
