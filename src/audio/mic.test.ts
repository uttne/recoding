import { describe, expect, it } from "vitest";
import { audioInputOptions, rawMicConstraints } from "./engine";

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

  it("requests the chosen input and leaves the default alone when none is chosen", () => {
    expect(rawMicConstraints({ deviceId: true, autoGainControl: true }, "mic-a")).toEqual({
      autoGainControl: false,
      deviceId: { exact: "mic-a" },
    });
    expect(rawMicConstraints({ deviceId: true }, "")).toBe(true);
    expect(rawMicConstraints({ autoGainControl: true }, "mic-a")).toEqual({ autoGainControl: false });
  });
});

describe("audioInputOptions", () => {
  it("keeps audio inputs and names unlabeled ones", () => {
    expect(
      audioInputOptions([
        { kind: "videoinput", deviceId: "cam", label: "Camera" },
        { kind: "audioinput", deviceId: "built-in", label: "内蔵マイク" },
        { kind: "audioinput", deviceId: "usb", label: "  " },
        { kind: "audioinput", deviceId: "", label: "無視" },
      ]),
    ).toEqual([
      { id: "built-in", label: "内蔵マイク" },
      { id: "usb", label: "マイク 2" },
    ]);
  });
});
