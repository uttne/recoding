import { describe, expect, it } from "vitest";
import "./flac-test-hook";
import { encodeAudio } from "./encode";
import { floatToInt16 } from "./pcm";

function tone(rate: number, seconds: number, hz: number): Int16Array {
  const length = Math.floor(rate * seconds);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) samples[i] = Math.sin((2 * Math.PI * hz * i) / rate) * 0.4;
  return floatToInt16(samples);
}

describe("encodeAudio", () => {
  it("writes a FLAC file smaller than the PCM", async () => {
    const pcm = tone(48_000, 0.2, 440);
    const flac = await encodeAudio("flac", pcm, 48_000);
    expect(String.fromCharCode(...flac.subarray(0, 4))).toBe("fLaC");
    expect(flac.byteLength).toBeLessThan(pcm.byteLength);
  });

  it("writes an MP3 frame", () => {
    const pcm = tone(48_000, 0.2, 440);
    return encodeAudio("mp3", pcm, 48_000).then((mp3) => {
      expect(mp3[0]).toBe(0xff);
      expect(mp3[1] & 0xe0).toBe(0xe0);
      expect(mp3.byteLength).toBeLessThan(pcm.byteLength);
    });
  });
});
