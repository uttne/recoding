import { concatFloat32 } from "./resample";

/** SwiftF0 constants from swift_f0/core.py (Lars Nieradzik, MIT). */
export const SWIFT_SAMPLE_RATE = 16_000;
export const SWIFT_HOP = 256;
export const SWIFT_FRAME_PERIOD = SWIFT_HOP / SWIFT_SAMPLE_RATE;
export const SWIFT_FMIN = 46.875;
export const SWIFT_FMAX = 2093.75;
export const SWIFT_LOOKAHEAD_FRAMES = 10;
export const SWIFT_LEFT_FRAMES = 11;
const SILENCE_PEAK = 1e-3;

export type SwiftInference = {
  pitch: Float64Array;
  confidence: Float32Array;
};

export type SwiftFrame = {
  /** Seconds from the start of the 16 kHz stream. */
  time: number;
  hz: number;
  confidence: number;
};

export type SwiftInferFn = (audio: Float32Array) => Promise<SwiftInference>;

export type SwiftWorkerRequest =
  | { type: "load" }
  | { type: "infer"; id: number; audio: Float32Array; fmax: number };

export type SwiftWorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: number; pitch: Float64Array; confidence: Float32Array; elapsedMs: number }
  | { type: "error"; message: string; id?: number };

/**
 * Live SwiftF0 stream. A frame is emitted only after 10 later frames
 * (176 ms) have arrived, matching PitchStream in the reference package.
 * Frames whose hop peaks below 0.001 are forced to confidence 0.
 */
export class SwiftF0Stream {
  private buffer = new Float32Array(0);
  private queued: Float32Array[] = [];
  private base = 0;
  private emitted = 0;
  private running: Promise<void> | null = null;
  private closed = false;
  private flushRequested = false;
  private flushResolvers: Array<() => void> = [];
  private idleResolvers: Array<() => void> = [];

  constructor(
    private readonly infer: SwiftInferFn,
    private readonly onFrames: (frames: SwiftFrame[]) => void,
    private readonly onError?: (error: unknown) => void,
  ) {}

  push(chunk: Float32Array): void {
    if (this.closed || chunk.length === 0) return;
    this.queued.push(chunk);
    this.pump();
  }

  flush(): Promise<void> {
    this.closed = true;
    this.flushRequested = true;
    const done = new Promise<void>((resolve) => this.flushResolvers.push(resolve));
    this.pump();
    return done;
  }

  whenIdle(): Promise<void> {
    if (!this.running && this.queued.length === 0 && !this.flushRequested) return Promise.resolve();
    return new Promise((resolve) => this.idleResolvers.push(resolve));
  }

  private pump(): void {
    if (this.running) return;
    this.running = this.run().finally(() => {
      this.running = null;
      if (this.queued.length || this.flushRequested) this.pump();
      else this.resolveWaiters();
    });
  }

  private resolveWaiters(): void {
    const flushing = this.flushResolvers.splice(0);
    const idle = this.idleResolvers.splice(0);
    for (const resolve of flushing) resolve();
    for (const resolve of idle) resolve();
  }

  private async run(): Promise<void> {
    try {
      const chunks = this.queued.splice(0);
      if (chunks.length) {
        let extra = new Float32Array(0);
        for (const chunk of chunks) extra = concatFloat32(extra, chunk);
        this.buffer = concatFloat32(this.buffer, extra);
      }
      const final = this.flushRequested && this.queued.length === 0;
      const frames = await this.emitReady(final);
      if (frames.length) this.onFrames(frames);
      if (final) this.flushRequested = false;
    } catch (error) {
      this.flushRequested = false;
      this.closed = true;
      this.queued.length = 0;
      this.onError?.(error);
    }
  }

  private async emitReady(final: boolean): Promise<SwiftFrame[]> {
    const first = this.emitted - this.base;
    let available = Math.floor(this.buffer.length / SWIFT_HOP);
    if (final && this.base === 0 && available === 0 && this.buffer.length > 0) available = 1;
    let last = final ? available : available - SWIFT_LOOKAHEAD_FRAMES;
    if (last <= first) return [];

    const inferred = await this.infer(this.buffer);
    const pitch = inferred.pitch;
    const confidence = inferred.confidence.slice();
    const framesInAudio = Math.max(1, Math.floor(this.buffer.length / SWIFT_HOP));
    const count = Math.min(pitch.length, confidence.length, framesInAudio);
    for (let i = 0; i < count; i++) {
      let peak = 0;
      const start = i * SWIFT_HOP;
      const end = Math.min(start + SWIFT_HOP, this.buffer.length);
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(this.buffer[j]));
      if (peak < SILENCE_PEAK) confidence[i] = 0;
    }
    if (last > count) last = count;
    if (last <= first) return [];

    const frames: SwiftFrame[] = [];
    for (let i = first; i < last; i++) {
      const hz = pitch[i];
      const conf = confidence[i];
      frames.push({
        time: (this.base + i) * SWIFT_FRAME_PERIOD,
        hz: Number.isFinite(hz) ? hz : 0,
        confidence: Number.isFinite(conf) ? conf : 0,
      });
    }
    this.emitted += frames.length;
    if (!final) {
      const keep = Math.max(0, this.emitted - SWIFT_LEFT_FRAMES) - this.base;
      if (keep > 0) {
        this.buffer = this.buffer.slice(keep * SWIFT_HOP);
        this.base += keep;
      }
    }
    return frames;
  }
}
