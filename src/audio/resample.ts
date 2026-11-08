/**
 * Streaming resampler. A one-pole low-pass runs before decimation so a
 * 48 kHz microphone does not alias into the 16 kHz SwiftF0 input.
 */
export class StreamResampler {
  private held = new Float32Array(0);
  private phase = 0;
  private lowpass = 0;

  constructor(
    readonly fromRate: number,
    readonly toRate: number,
  ) {
    if (fromRate <= 0 || toRate <= 0) throw new Error("sample rates must be positive");
  }

  push(chunk: Float32Array): Float32Array {
    if (chunk.length === 0) return new Float32Array(0);
    const filtered = this.filter(chunk);
    if (this.fromRate === this.toRate) return filtered;

    const src =
      this.held.length === 0 ? filtered : concatFloat32(this.held, filtered);
    const step = this.fromRate / this.toRate;
    const out: number[] = [];
    let position = this.phase;
    while (position + 1 < src.length) {
      const index = Math.floor(position);
      const fraction = position - index;
      out.push(src[index] * (1 - fraction) + src[index + 1] * fraction);
      position += step;
    }
    const keepFrom = Math.min(src.length, Math.floor(position));
    this.held = src.slice(keepFrom);
    this.phase = position - keepFrom;
    return Float32Array.from(out);
  }

  private filter(chunk: Float32Array): Float32Array {
    if (this.fromRate <= this.toRate) return chunk.slice();
    const cutoff = this.toRate * 0.45;
    const dt = 1 / this.fromRate;
    const alpha = dt / (dt + 1 / (2 * Math.PI * cutoff));
    const out = new Float32Array(chunk.length);
    let state = this.lowpass;
    for (let i = 0; i < chunk.length; i++) {
      state += alpha * (chunk[i] - state);
      out[i] = state;
    }
    this.lowpass = state;
    return out;
  }
}

export function concatFloat32(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** Keep the newest `max` samples after appending `chunk`. */
export function tailFloat32(current: Float32Array, chunk: Float32Array, max: number): Float32Array {
  if (chunk.length >= max) return chunk.slice(chunk.length - max);
  if (current.length + chunk.length <= max) return concatFloat32(current, chunk);
  const out = new Float32Array(max);
  const keep = max - chunk.length;
  out.set(current.subarray(current.length - keep), 0);
  out.set(chunk, keep);
  return out;
}
