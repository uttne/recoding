import { describe, expect, it } from "vitest";
import {
  BASIC_CONTOUR_BINS,
  BASIC_FMAX_HZ,
  BASIC_FRAMES,
  BASIC_NOTE_BINS,
  BasicPitchStream,
  contourBinHz,
  readBasicFrame,
  selectBasic,
  type BasicInference,
} from "./basicpitch";

function cents(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected);
}

function activations(notes: Array<[number, number]>, contourBin: number): { note: Float32Array; contour: Float32Array } {
  const note = new Float32Array(BASIC_NOTE_BINS);
  const contour = new Float32Array(BASIC_CONTOUR_BINS);
  for (const [bin, value] of notes) note[bin] = value;
  contour[contourBin] = 0.9;
  return { note, contour };
}

describe("Basic Pitch decode", () => {
  it("maps the A4 contour bin back to 440 Hz", () => {
    expect(contourBinHz(145)).toBeCloseTo(440, 5);
    const { note, contour } = activations([[48, 0.8]], 145);
    const readings = readBasicFrame(note, contour, 0, 27.5, BASIC_FMAX_HZ);
    expect(readings).toHaveLength(1);
    expect(Math.abs(cents(readings[0].hz, 440))).toBeLessThan(5);
    expect(selectBasic(readings, "mono")).toEqual(readings);
  });

  it("returns every chord tone in poly mode and only the loudest in mono mode", () => {
    const { note, contour } = activations(
      [
        [48, 0.55],
        [52, 0.7],
        [55, 0.9],
      ],
      145,
    );
    contour[52 * 3 + 1] = 0.8;
    contour[55 * 3 + 1] = 0.8;
    const readings = readBasicFrame(note, contour, 0, 27.5, BASIC_FMAX_HZ);
    expect(selectBasic(readings, "poly").map((reading) => Math.round(reading.hz))).toEqual([
      Math.round(contourBinHz(55 * 3 + 1)),
      Math.round(contourBinHz(52 * 3 + 1)),
      Math.round(contourBinHz(48 * 3 + 1)),
    ]);
    expect(selectBasic(readings, "mono")).toHaveLength(1);
    expect(selectBasic(readings, "mono")[0].confidence).toBeCloseTo(0.9);
  });

  it("drops notes outside the ceiling", () => {
    const { note, contour } = activations([[48, 0.9]], 145);
    expect(readBasicFrame(note, contour, 0, 27.5, 400)).toEqual([]);
  });

  it("emits A4 from the middle of a sliding window", async () => {
    const note = new Float32Array(BASIC_FRAMES * BASIC_NOTE_BINS);
    const contour = new Float32Array(BASIC_FRAMES * BASIC_CONTOUR_BINS);
    for (let frame = 0; frame < BASIC_FRAMES; frame++) {
      note[frame * BASIC_NOTE_BINS + 48] = 0.85;
      contour[frame * BASIC_CONTOUR_BINS + 145] = 0.9;
    }
    const inference: BasicInference = { note, contour };
    const got: { hz: number }[] = [];
    let mode: "mono" | "poly" = "mono";
    const stream = new BasicPitchStream(
      48_000,
      async () => inference,
      (frames) => {
        for (const frame of frames) if (frame.pitches[0]) got.push({ hz: frame.pitches[0].hz });
      },
      (error) => {
        throw error;
      },
      () => mode,
      () => BASIC_FMAX_HZ,
    );
    stream.setEnabled(true);
    const audio = new Float32Array(Math.ceil(2.5 * 48_000));
    stream.push(audio);
    await stream.whenIdle();
    expect(got.length).toBeGreaterThan(20);
    expect(Math.abs(cents(got[0].hz, 440))).toBeLessThan(5);

    mode = "poly";
    got.length = 0;
    stream.push(new Float32Array(Math.ceil(0.3 * 48_000)));
    await stream.whenIdle();
    expect(got.length).toBeGreaterThan(0);
  });
});
