import { StreamResampler, tailFloat32 } from "./resample";

/**
 * Spotify Basic Pitch nmp.onnx (Apache-2.0).
 * One window is 43844 samples at 22050 Hz. The graph contains the harmonic CQT.
 * Outputs used here: note `StatefulPartitionedCall:1` [1,172,88],
 * contour `StatefulPartitionedCall:0` [1,172,264].
 * `StatefulPartitionedCall:2` is the onset head and is not read.
 */
export const BASIC_SAMPLE_RATE = 22_050;
export const BASIC_AUDIO_SAMPLES = 43_844;
export const BASIC_FRAMES = 172;
export const BASIC_FFT_HOP = 256;
export const BASIC_NOTE_BINS = 88;
export const BASIC_CONTOUR_BINS = 264;
export const BASIC_MIDI0 = 21;
export const BASIC_FRAME_THRESHOLD = 0.3;
export const BASIC_EDGE_FRAMES = 15;
export const BASIC_MAX_NOTES = 8;
export const BASIC_HOP_SECONDS = 0.25;
/** Contour bins in one equal-tempered semitone. Bin `n * 3 + 1` is MIDI `21 + n`. */
const CONTOUR_BINS_PER_SEMITONE = 3;
/** Mono search around the previous ridge. An ordinary glissando moves far less than this per frame. */
const RIDGE_RADIUS_BINS = 2 * CONTOUR_BINS_PER_SEMITONE;
/** Note heads farther than this from the ridge do not count as support. */
const NOTE_GATE_BINS = CONTOUR_BINS_PER_SEMITONE;
/** Half-width of the mono median. Five frames is about 58 ms. */
const MONO_MEDIAN_RADIUS = 2;

const BASIC_F0 = 27.5;

export function noteBinHz(bin: number): number {
  return BASIC_F0 * 2 ** (bin / 12);
}

/**
 * Contour bin 1 is A0 (27.5 Hz). An equal-tempered MIDI note `21 + n`
 * peaks on bin `n * 3 + 1`, one bin above `36 * log2(hz / 27.5)`.
 * A 440 Hz sine peaks on bin 145, which this maps back to 440 Hz.
 */
export function contourBinHz(bin: number): number {
  return BASIC_F0 * 2 ** ((bin - 1) / 36);
}

export const BASIC_FMIN_HZ = noteBinHz(0);
export const BASIC_FMAX_HZ = noteBinHz(BASIC_NOTE_BINS - 1);

export type BasicMode = "mono" | "poly";

export type BasicReading = { hz: number; confidence: number };

export type BasicFrame = {
  /** Seconds from the start of the 22050 Hz stream. */
  time: number;
  pitches: BasicReading[];
};

export type BasicInference = { note: Float32Array; contour: Float32Array };

export type BasicInferFn = (audio: Float32Array) => Promise<BasicInference>;

export type BasicWorkerRequest =
  | { type: "load" }
  | { type: "infer"; id: number; audio: Float32Array };

export type BasicWorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; note: Float32Array; contour: Float32Array; elapsedMs: number }
  | { type: "error"; message: string; id?: number };

function frequencyBounds(fmin: number, fmax: number): { floor: number; ceiling: number } {
  const floor = Number.isFinite(fmin) && fmin > 0 ? fmin : BASIC_FMIN_HZ;
  const ceiling = Number.isFinite(fmax) && fmax > floor ? fmax : BASIC_FMAX_HZ;
  return { floor, ceiling };
}

type Peak = { bin: number; value: number };

function notePeaks(note: ArrayLike<number>, frame: number): Peak[] {
  const base = frame * BASIC_NOTE_BINS;
  const found: Peak[] = [];
  for (let bin = 0; bin < BASIC_NOTE_BINS; bin++) {
    const value = note[base + bin];
    if (value < BASIC_FRAME_THRESHOLD) continue;
    const left = bin === 0 ? -Infinity : note[base + bin - 1];
    const right = bin === BASIC_NOTE_BINS - 1 ? -Infinity : note[base + bin + 1];
    if (value >= left && value > right) found.push({ bin, value });
  }
  return found;
}

export function readBasicFrame(
  note: ArrayLike<number>,
  contour: ArrayLike<number>,
  frame: number,
  fmin: number,
  fmax: number,
): BasicReading[] {
  const { floor, ceiling } = frequencyBounds(fmin, fmax);
  const found: BasicReading[] = [];
  for (const peak of notePeaks(note, frame)) {
    const hz = refineHz(peak.bin, contour, frame);
    if (hz < floor || hz > ceiling) continue;
    found.push({ hz, confidence: peak.value });
  }
  found.sort((a, b) => b.confidence - a.confidence);
  return found.slice(0, BASIC_MAX_NOTES);
}

function refineHz(noteBin: number, contour: ArrayLike<number>, frame: number): number {
  const center = noteBin * 3 + 1;
  const start = Math.max(0, center - 4);
  const end = Math.min(BASIC_CONTOUR_BINS - 1, center + 4);
  const base = frame * BASIC_CONTOUR_BINS;
  let weighted = 0;
  let mass = 0;
  for (let bin = start; bin <= end; bin++) {
    const weight = contour[base + bin];
    if (weight <= 0) continue;
    weighted += weight * bin;
    mass += weight;
  }
  if (mass <= 0) return noteBinHz(noteBin);
  return contourBinHz(weighted / mass);
}

function contourPeaks(contour: ArrayLike<number>, frame: number, start: number, end: number): Peak[] {
  const base = frame * BASIC_CONTOUR_BINS;
  const found: Peak[] = [];
  for (let bin = start; bin <= end; bin++) {
    const value = contour[base + bin];
    if (value <= 0) continue;
    const left = bin === 0 ? -Infinity : contour[base + bin - 1];
    const right = bin === BASIC_CONTOUR_BINS - 1 ? -Infinity : contour[base + bin + 1];
    if (value >= left && value > right) found.push({ bin, value });
  }
  return found;
}

/** Center of mass of one contour peak, including the shoulders that still fall away from it. */
function ridgeCentroid(contour: ArrayLike<number>, frame: number, peakBin: number): number {
  const base = frame * BASIC_CONTOUR_BINS;
  let left = peakBin;
  while (left > 0 && peakBin - left < 4) {
    const next = contour[base + left - 1];
    if (next <= 0 || next > contour[base + left]) break;
    left--;
  }
  let right = peakBin;
  while (right < BASIC_CONTOUR_BINS - 1 && right - peakBin < 4) {
    const next = contour[base + right + 1];
    if (next <= 0 || next > contour[base + right]) break;
    right++;
  }
  let weighted = 0;
  let mass = 0;
  for (let bin = left; bin <= right; bin++) {
    const weight = contour[base + bin];
    if (weight <= 0) continue;
    weighted += weight * bin;
    mass += weight;
  }
  return mass > 0 ? weighted / mass : peakBin;
}

function ridgeFrom(
  note: ArrayLike<number>,
  contour: ArrayLike<number>,
  frame: number,
  anchorBin: number,
  floor: number,
  ceiling: number,
): (BasicReading & { bin: number }) | null {
  const center = Math.round(anchorBin);
  const start = Math.max(0, center - RIDGE_RADIUS_BINS);
  const end = Math.min(BASIC_CONTOUR_BINS - 1, center + RIDGE_RADIUS_BINS);
  let peaks = contourPeaks(contour, frame, start, end);
  if (peaks.length === 0) {
    const base = frame * BASIC_CONTOUR_BINS;
    let bestBin = -1;
    let best = 0;
    for (let bin = start; bin <= end; bin++) {
      const value = contour[base + bin];
      if (value > best) {
        best = value;
        bestBin = bin;
      }
    }
    if (bestBin < 0) return null;
    peaks = [{ bin: bestBin, value: best }];
  }
  peaks.sort((a, b) => Math.abs(a.bin - anchorBin) - Math.abs(b.bin - anchorBin) || b.value - a.value);
  const ridgeBin = ridgeCentroid(contour, frame, peaks[0].bin);
  let confidence = 0;
  for (const peak of notePeaks(note, frame)) {
    if (Math.abs(peak.bin * CONTOUR_BINS_PER_SEMITONE + 1 - ridgeBin) <= NOTE_GATE_BINS) {
      confidence = Math.max(confidence, peak.value);
    }
  }
  if (confidence < BASIC_FRAME_THRESHOLD) return null;
  const hz = contourBinHz(ridgeBin);
  if (hz < floor || hz > ceiling) return null;
  return { hz, confidence, bin: ridgeBin };
}

function readMonoFrame(
  note: ArrayLike<number>,
  contour: ArrayLike<number>,
  frame: number,
  fmin: number,
  fmax: number,
  anchorBin: number | null,
): (BasicReading & { bin: number }) | null {
  const { floor, ceiling } = frequencyBounds(fmin, fmax);
  if (anchorBin != null) return ridgeFrom(note, contour, frame, anchorBin, floor, ceiling);
  const peaks = notePeaks(note, frame).sort((a, b) => b.value - a.value);
  for (const peak of peaks) {
    const reading = ridgeFrom(note, contour, frame, peak.bin * CONTOUR_BINS_PER_SEMITONE + 1, floor, ceiling);
    if (reading) return reading;
  }
  return null;
}

/**
 * Mono pitch for frames `[start, end)`. Hz is the contour peak nearest the
 * previous frame, not the semitone bin of the note head. The first voiced
 * frame starts at the strongest note head. A frame whose nearest note head is
 * more than a semitone from that peak is silence.
 */
export function readMonoFrames(
  note: ArrayLike<number>,
  contour: ArrayLike<number>,
  start: number,
  end: number,
  fmin: number,
  fmax: number,
): Array<BasicReading | null> {
  const readings: Array<BasicReading | null> = [];
  let anchor: number | null = null;
  for (let frame = start; frame < end; frame++) {
    const reading = readMonoFrame(note, contour, frame, fmin, fmax, anchor);
    anchor = reading ? reading.bin : null;
    readings.push(reading ? { hz: reading.hz, confidence: reading.confidence } : null);
  }
  return readings;
}

/**
 * Median of up to five frames. The window stops at silence, so the pitch
 * before a gap is not mixed with the pitch after it.
 */
export function medianVoicedHz(values: Array<number | null>, radius = MONO_MEDIAN_RADIUS): Array<number | null> {
  const out: Array<number | null> = [];
  for (let index = 0; index < values.length; index++) {
    if (values[index] == null) {
      out.push(null);
      continue;
    }
    let lo = index;
    let hi = index;
    while (lo > index - radius && values[lo - 1] != null) lo--;
    while (hi < index + radius && values[hi + 1] != null) hi++;
    const window: number[] = [];
    for (let cursor = lo; cursor <= hi; cursor++) window.push(values[cursor] as number);
    window.sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    out.push(window.length % 2 === 1 ? window[mid] : (window[mid - 1] + window[mid]) / 2);
  }
  return out;
}

/**
 * Sliding 1.99 s windows. Frames within 15 of either edge are discarded,
 * the same half-overlap the reference inference removes. The newest kept
 * frame is about 0.18 s behind the end of the window.
 */
export class BasicPitchStream {
  private readonly resampler: StreamResampler;
  private buffer = new Float32Array(0);
  private samples = 0;
  private sinceInfer = Number.POSITIVE_INFINITY;
  private emittedUntil = -Infinity;
  private enabled = false;
  private dirty = false;
  private running: Promise<void> | null = null;
  private idle: Array<() => void> = [];

  constructor(
    sampleRate: number,
    private readonly infer: BasicInferFn,
    private readonly onFrames: (frames: BasicFrame[]) => void,
    private readonly onError: (error: unknown) => void,
    private readonly mode: () => BasicMode,
    private readonly fmax: () => number,
  ) {
    this.resampler = new StreamResampler(sampleRate, BASIC_SAMPLE_RATE);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) this.request();
  }

  push(chunk: Float32Array): void {
    if (chunk.length === 0) return;
    const audio = this.resampler.push(chunk);
    if (audio.length === 0) return;
    this.buffer = tailFloat32(this.buffer, audio, BASIC_AUDIO_SAMPLES);
    this.samples += audio.length;
    this.sinceInfer += audio.length;
    if (this.enabled) this.request();
  }

  whenIdle(): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }

  private request(): void {
    if (!this.enabled || this.buffer.length < BASIC_AUDIO_SAMPLES) return;
    const hop = Math.round(BASIC_HOP_SECONDS * BASIC_SAMPLE_RATE);
    if (this.sinceInfer < hop && this.sinceInfer !== Number.POSITIVE_INFINITY) return;
    if (this.running) {
      this.dirty = true;
      return;
    }
    this.sinceInfer = 0;
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.dirty) {
        this.dirty = false;
        this.sinceInfer = Number.POSITIVE_INFINITY;
        this.request();
      }
      if (!this.running) this.idle.splice(0).forEach((resolve) => resolve());
    });
  }

  private async run(): Promise<void> {
    const audio = this.buffer.slice();
    const windowStart = (this.samples - audio.length) / BASIC_SAMPLE_RATE;
    try {
      const output = await this.infer(audio);
      if (!this.enabled) return;
      const ceiling = this.fmax();
      const mode = this.mode();
      const hop = BASIC_FFT_HOP / BASIC_SAMPLE_RATE;
      const frames: BasicFrame[] = [];
      const last = BASIC_FRAMES - BASIC_EDGE_FRAMES;
      if (mode === "mono") {
        const decoded = readMonoFrames(output.note, output.contour, BASIC_EDGE_FRAMES, last, BASIC_FMIN_HZ, ceiling);
        const smoothed = medianVoicedHz(decoded.map((reading) => (reading ? reading.hz : null)));
        for (let i = 0; i < decoded.length; i++) {
          const time = windowStart + (BASIC_EDGE_FRAMES + i) * hop;
          if (time <= this.emittedUntil + 1e-4) continue;
          const reading = decoded[i];
          const hz = smoothed[i];
          frames.push({
            time,
            pitches: reading && hz != null ? [{ hz, confidence: reading.confidence }] : [],
          });
        }
      } else {
        for (let frame = BASIC_EDGE_FRAMES; frame < last; frame++) {
          const time = windowStart + frame * hop;
          if (time <= this.emittedUntil + 1e-4) continue;
          frames.push({
            time,
            pitches: readBasicFrame(output.note, output.contour, frame, BASIC_FMIN_HZ, ceiling),
          });
        }
      }
      const newest = frames.at(-1);
      if (newest) this.emittedUntil = newest.time;
      if (frames.length > 0) this.onFrames(frames);
    } catch (error) {
      this.onError(error);
    }
  }
}
