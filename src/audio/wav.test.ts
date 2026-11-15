import { describe, expect, it } from "vitest";
import { floatToInt16 } from "./pcm";
import { decodeWav, encodeWav } from "./wav";

describe("wav", () => {
  it("round-trips 16-bit mono PCM", () => {
    const pcm = floatToInt16(Float32Array.of(-1, -0.5, 0, 0.5, 1));
    const decoded = decodeWav(encodeWav(pcm, 48_000));
    expect(decoded.sampleRate).toBe(48_000);
    expect(Array.from(decoded.pcm)).toEqual(Array.from(pcm));
    expect(String.fromCharCode(...encodeWav(pcm, 48_000).subarray(0, 4))).toBe("RIFF");
  });

  it("rejects a file that is not a WAV", () => {
    expect(() => decodeWav(Uint8Array.of(1, 2, 3, 4))).toThrow(/WAV/);
  });
});
