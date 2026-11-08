import { describe, expect, it } from "vitest";
import {
  BASIC_CONTOUR_BINS,
  BASIC_FMAX_HZ,
  BASIC_FRAMES,
  BASIC_NOTE_BINS,
  BasicPitchStream,
  contourBinHz,
  medianVoicedHz,
  readBasicFrame,
  readMonoFrames,
  type BasicInference,
  type BasicReading,
} from "./basicpitch";

function cents(actual: number, expected: number): number {
  return 1200 * Math.log2(actual / expected);
}

function monoSequence(frames: Array<{ notes: Array<[number, number]>; contour: Array<[number, number]> }>): Array<BasicReading | null> {
  const note = new Float32Array(frames.length * BASIC_NOTE_BINS);
  const contour = new Float32Array(frames.length * BASIC_CONTOUR_BINS);
  frames.forEach((frame, index) => {
    for (const [bin, value] of frame.notes) note[index * BASIC_NOTE_BINS + bin] = value;
    for (const [bin, value] of frame.contour) contour[index * BASIC_CONTOUR_BINS + bin] = value;
  });
  return readMonoFrames(note, contour, 0, frames.length, 27.5, BASIC_FMAX_HZ);
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
  });

  it("returns every chord tone in strength order", () => {
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
    expect(readings.map((reading) => Math.round(reading.hz))).toEqual([
      Math.round(contourBinHz(55 * 3 + 1)),
      Math.round(contourBinHz(52 * 3 + 1)),
      Math.round(contourBinHz(48 * 3 + 1)),
    ]);
  });

  it("drops notes outside the ceiling", () => {
    const { note, contour } = activations([[48, 0.9]], 145);
    expect(readBasicFrame(note, contour, 0, 27.5, 400)).toEqual([]);
    expect(readMonoFrames(note, contour, 0, 1, 27.5, 400)).toEqual([null]);
  });

  it("holds a steady contour ridge on bin 145 at 440 Hz", () => {
    const readings = monoSequence([{ notes: [[48, 0.8]], contour: [[145, 0.9]] }]);
    expect(readings[0]).not.toBeNull();
    expect(Math.abs(cents(readings[0]!.hz, 440))).toBeLessThan(5);
  });

  it("follows a ridge across semitones instead of stepping with the note head", () => {
    const bins = [145, 147, 149, 152, 155];
    const readings = monoSequence(
      bins.map((bin) => ({
        notes: [[Math.round((bin - 1) / 3), 0.8]],
        contour: [[bin, 0.9]],
      })),
    );
    for (let index = 0; index < bins.length; index++) {
      expect(readings[index]).not.toBeNull();
      expect(Math.abs(cents(readings[index]!.hz, contourBinHz(bins[index])))).toBeLessThan(5);
    }
    expect(Math.abs(cents(readings[1]!.hz, 440))).toBeGreaterThan(50);
    const smoothed = medianVoicedHz(readings.map((reading) => reading?.hz ?? null));
    expect(Math.abs(cents(smoothed[2]!, contourBinHz(149)))).toBeLessThan(5);
    expect(Math.abs(cents(smoothed[2]!, contourBinHz(148)))).toBeGreaterThan(20);
  });

  it("keeps following the ridge after it leaves the original semitone window", () => {
    const readings = monoSequence([
      { notes: [[48, 0.9]], contour: [[145, 0.9]] },
      {
        notes: [
          [48, 0.9],
          [50, 0.45],
        ],
        contour: [[151, 0.9]],
      },
    ]);
    expect(Math.abs(cents(readings[1]!.hz, contourBinHz(151)))).toBeLessThan(5);
    expect(Math.abs(cents(readings[1]!.hz, 440))).toBeGreaterThan(150);
  });

  it("prefers the ridge near the previous pitch over a louder neighbor", () => {
    const readings = monoSequence([
      { notes: [[48, 0.8]], contour: [[145, 0.9]] },
      { notes: [[49, 0.8]], contour: [[145, 0.4], [149, 0.95]] },
    ]);
    expect(Math.abs(cents(readings[1]!.hz, 440))).toBeLessThan(5);
  });

  it("is silent when the note head is more than a semitone from the ridge", () => {
    expect(monoSequence([{ notes: [[50, 0.9]], contour: [[145, 0.9]] }])).toEqual([null]);
    expect(monoSequence([{ notes: [[48, 0.9]], contour: [[181, 0.9]] }])).toEqual([null]);
    const edge = monoSequence([{ notes: [[49, 0.8]], contour: [[145, 0.9]] }]);
    expect(edge[0]).not.toBeNull();
    expect(Math.abs(cents(edge[0]!.hz, 440))).toBeLessThan(5);
  });

  it("does not fall back to the semitone when the contour is empty", () => {
    const note = new Float32Array(BASIC_NOTE_BINS);
    note[48] = 0.9;
    expect(readMonoFrames(note, new Float32Array(BASIC_CONTOUR_BINS), 0, 1, 27.5, BASIC_FMAX_HZ)).toEqual([null]);
  });

  it("does not mix pitches on either side of silence", () => {
    const readings = monoSequence([
      { notes: [[48, 0.8]], contour: [[145, 0.9]] },
      { notes: [], contour: [] },
      { notes: [[60, 0.8]], contour: [[181, 0.9]] },
    ]);
    const smoothed = medianVoicedHz(readings.map((reading) => reading?.hz ?? null));
    expect(Math.abs(cents(smoothed[0]!, 440))).toBeLessThan(5);
    expect(smoothed[1]).toBeNull();
    expect(Math.abs(cents(smoothed[2]!, 880))).toBeLessThan(5);

    const mixed = medianVoicedHz([430, 450, null, 860, 900]);
    expect(mixed[0]).toBeCloseTo(440, 5);
    expect(mixed[1]).toBeCloseTo(440, 5);
    expect(mixed[2]).toBeNull();
    expect(mixed[3]).toBeCloseTo(880, 5);
    expect(mixed[4]).toBeCloseTo(880, 5);
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
