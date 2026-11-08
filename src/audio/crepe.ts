import { StreamResampler, tailFloat32 } from "./resample";

/** Tiny-CREPE, 16 kHz, 1024-sample frames, 360 bins of 20 cents from C1. */
export const CREPE_SAMPLE_RATE = 16_000;
export const CREPE_FRAME = 1024;
export const CREPE_HOP = 160;
export const CREPE_BINS = 360;
export const CREPE_CONFIDENCE = 0.5;
const CENTS0 = 1997.3794084376191;
const CENTS_STEP = 20;

export function crepeBinHz(bin: number): number {
  return 10 * 2 ** ((CENTS0 + bin * CENTS_STEP) / 1200);
}

export const CREPE_FMIN_HZ = crepeBinHz(0);
export const CREPE_FMAX_HZ = crepeBinHz(CREPE_BINS - 1);

export type CrepeReading = { hz: number | null; confidence: number };

export type CrepeFrame = CrepeReading & {
  /** Seconds from the start of the 16 kHz stream. The frame is centered here. */
  time: number;
};

export type CrepeInferFn = (frames: Float32Array, rows: number) => Promise<Float32Array>;

export type CrepeWorkerRequest =
  | { type: "load" }
  | { type: "infer"; id: number; audio: Float32Array; rows: number };

export type CrepeWorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; probabilities: Float32Array; elapsedMs: number }
  | { type: "error"; message: string; id?: number };

/**
 * One CREPE frame. `probs` holds 360 sigmoid activations.
 * Bins outside [fmin, fmax] are ignored. The Hz is the salience-weighted
 * mean of the nine bins around the peak, in cents, matching CREPE's
 * `to_local_average_cents`.
 */
export function decodeCrepeFrame(probs: ArrayLike<number>, offset: number, fmin: number, fmax: number): CrepeReading {
  const floor = Number.isFinite(fmin) && fmin > 0 ? fmin : CREPE_FMIN_HZ;
  const ceiling = Number.isFinite(fmax) && fmax > floor ? fmax : CREPE_FMAX_HZ;
  let peak = -1;
  let peakValue = 0;
  for (let bin = 0; bin < CREPE_BINS; bin++) {
    const hz = crepeBinHz(bin);
    if (hz < floor || hz > ceiling) continue;
    const value = probs[offset + bin];
    if (value > peakValue) {
      peakValue = value;
      peak = bin;
    }
  }
  if (peak < 0 || peakValue < CREPE_CONFIDENCE) return { hz: null, confidence: peakValue };
  const start = Math.max(0, peak - 4);
  const end = Math.min(CREPE_BINS - 1, peak + 4);
  let weighted = 0;
  let mass = 0;
  for (let bin = start; bin <= end; bin++) {
    const hz = crepeBinHz(bin);
    if (hz < floor || hz > ceiling) continue;
    const value = probs[offset + bin];
    if (value <= 0) continue;
    weighted += value * (CENTS0 + bin * CENTS_STEP);
    mass += value;
  }
  if (mass <= 0) return { hz: null, confidence: peakValue };
  return { hz: 10 * 2 ** (weighted / mass / 1200), confidence: peakValue };
}

const MAX_BATCH = 8;

/**
 * Centered 64 ms frames every 10 ms. A frame is ready 32 ms after the time
 * it describes, because the window extends 512 samples past its center.
 */
export class CrepeStream {
  private readonly resampler: StreamResampler;
  private buffer = new Float32Array(0);
  private samples = 0;
  private nextCenter = CREPE_FRAME / 2;
  private pending: Float32Array[] = [];
  private pendingTimes: number[] = [];
  private enabled = false;
  private running: Promise<void> | null = null;
  private idle: Array<() => void> = [];

  constructor(
    sampleRate: number,
    private readonly infer: CrepeInferFn,
    private readonly onFrames: (frames: CrepeFrame[]) => void,
    private readonly onError: (error: unknown) => void,
    private readonly fmax: () => number,
  ) {
    this.resampler = new StreamResampler(sampleRate, CREPE_SAMPLE_RATE);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) this.pump();
  }

  push(chunk: Float32Array): void {
    if (chunk.length === 0) return;
    const audio = this.resampler.push(chunk);
    if (audio.length === 0) return;
    this.buffer = tailFloat32(this.buffer, audio, CREPE_FRAME + CREPE_HOP * MAX_BATCH);
    this.samples += audio.length;
    this.collect();
    if (this.enabled) this.pump();
  }

  whenIdle(): Promise<void> {
    if (!this.running) return Promise.resolve();
    return new Promise((resolve) => this.idle.push(resolve));
  }

  private collect(): void {
    const half = CREPE_FRAME / 2;
    while (this.nextCenter + half <= this.samples) {
      if (this.enabled) {
        const bufferStart = this.samples - this.buffer.length;
        const start = this.nextCenter - half;
        if (start >= bufferStart) {
          const offset = start - bufferStart;
          this.pending.push(this.buffer.slice(offset, offset + CREPE_FRAME));
          this.pendingTimes.push(this.nextCenter / CREPE_SAMPLE_RATE);
        }
      }
      this.nextCenter += CREPE_HOP;
    }
    if (this.pending.length > MAX_BATCH * 3) {
      const drop = this.pending.length - MAX_BATCH;
      this.pending.splice(0, drop);
      this.pendingTimes.splice(0, drop);
    }
  }

  private pump(): void {
    if (this.running || !this.enabled || this.pending.length === 0) return;
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.enabled && this.pending.length > 0) this.pump();
      else this.idle.splice(0).forEach((resolve) => resolve());
    });
  }

  private async run(): Promise<void> {
    while (this.enabled && this.pending.length > 0) {
      const rows = Math.min(MAX_BATCH, this.pending.length);
      const frames = this.pending.splice(0, rows);
      const times = this.pendingTimes.splice(0, rows);
      const packed = new Float32Array(rows * CREPE_FRAME);
      frames.forEach((frame, row) => packed.set(frame, row * CREPE_FRAME));
      try {
        const probs = await this.infer(packed, rows);
        if (!this.enabled) return;
        const ceiling = this.fmax();
        const decoded: CrepeFrame[] = [];
        for (let row = 0; row < rows; row++) {
          const reading = decodeCrepeFrame(probs, row * CREPE_BINS, CREPE_FMIN_HZ, ceiling);
          decoded.push({ time: times[row], ...reading });
        }
        this.onFrames(decoded);
      } catch (error) {
        this.onError(error);
        return;
      }
    }
  }
}
