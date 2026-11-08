import { track, type TrackWriter } from "@audio/pitch-pyin";

/** pYIN defaults from @audio/pitch-pyin (Mauch & Dixon 2014, librosa's parameters). */
export const PYIN_FMIN_HZ = 50;
export const PYIN_FMAX_HZ = 2000;

export type PyinFrame = {
  /** Seconds since this stream was created, on the stream's own sample clock. */
  time: number;
  hz: number | null;
  confidence: number;
};

/**
 * Live pYIN. `track()` confirms a frame when every Viterbi path agrees on it.
 * On a steady tone that is about 0.2–0.4 s behind the microphone; the returned
 * `time` is the frame time, not the moment it was confirmed.
 * Raising the ceiling starts a new tracker. The unconfirmed tail is dropped.
 */
export class PyinStream {
  private write: TrackWriter | null = null;
  private ceiling = 0;
  private origin = 0;
  private consumed = 0;

  constructor(
    private readonly sampleRate: number,
    private readonly fmax: () => number,
    private readonly onFrames: (frames: PyinFrame[]) => void,
  ) {}

  push(chunk: Float32Array): void {
    if (chunk.length === 0) return;
    const ceiling = this.usableCeiling(this.fmax());
    if (!this.write || ceiling !== this.ceiling) {
      this.origin += this.consumed / this.sampleRate;
      this.consumed = 0;
      this.ceiling = ceiling;
      this.write = track({ fs: this.sampleRate, minFreq: PYIN_FMIN_HZ, maxFreq: ceiling });
    }
    this.consumed += chunk.length;
    const decided = this.write(chunk);
    if (decided.f0.length === 0) return;
    const frames: PyinFrame[] = [];
    for (let i = 0; i < decided.f0.length; i++) {
      const hz = decided.f0[i];
      const voiced = decided.voiced[i] === 1 && hz > 0;
      frames.push({
        time: this.origin + decided.times[i],
        hz: voiced ? hz : null,
        confidence: decided.prob[i],
      });
    }
    this.onFrames(frames);
  }

  private usableCeiling(fmax: number): number {
    return Number.isFinite(fmax) && fmax > PYIN_FMIN_HZ ? fmax : PYIN_FMAX_HZ;
  }
}
