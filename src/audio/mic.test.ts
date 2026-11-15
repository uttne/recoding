import { describe, expect, it } from "vitest";
import { rawMicConstraints } from "./engine";

describe("rawMicConstraints", () => {
  it("turns off every processor that changes the captured level", () => {
    expect(
      rawMicConstraints({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }),
    ).toEqual({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });

  it("sets only the constraints the browser lists", () => {
    expect(rawMicConstraints({ autoGainControl: true })).toEqual({ autoGainControl: false });
  });

  it("leaves the browser default when none of those processors can be set", () => {
    expect(rawMicConstraints({})).toBe(true);
  });
});
