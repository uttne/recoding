/**
 * ACF2+ pitch detector, the autocorrelation used by pitchreader and merged
 * into Chris Wilson's PitchDetect from dalatant's 2016 proposal.
 * Returns the fundamental frequency in Hz, or -1 when the frame is silent
 * or no period can be estimated.
 */
export function acf2Plus(buf: Float32Array, sampleRate: number): number {
  const size0 = buf.length;
  if (size0 < 8 || sampleRate <= 0) return -1;

  let energy = 0;
  for (let i = 0; i < size0; i++) energy += buf[i] * buf[i];
  const rms = Math.sqrt(energy / size0);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = size0 - 1;
  const threshold = 0.2;
  for (let i = 0; i < size0 / 2; i++) {
    if (Math.abs(buf[i]) < threshold) {
      r1 = i;
      break;
    }
  }
  for (let i = 1; i < size0 / 2; i++) {
    if (Math.abs(buf[size0 - i]) < threshold) {
      r2 = size0 - i;
      break;
    }
  }
  if (r2 - r1 < 8) return -1;

  const sliced = buf.subarray(r1, r2);
  const size = sliced.length;
  const correlation = new Float32Array(size);
  for (let tau = 0; tau < size; tau++) {
    let sum = 0;
    const end = size - tau;
    for (let i = 0; i < end; i++) sum += sliced[i] * sliced[i + tau];
    correlation[tau] = sum;
  }

  let dip = 0;
  while (dip + 1 < size && correlation[dip] > correlation[dip + 1]) dip++;

  let maxValue = -Infinity;
  let maxLag = -1;
  for (let tau = dip; tau < size; tau++) {
    if (correlation[tau] > maxValue) {
      maxValue = correlation[tau];
      maxLag = tau;
    }
  }
  if (maxLag <= 0 || maxLag >= size - 1) return -1;

  const left = correlation[maxLag - 1];
  const center = correlation[maxLag];
  const right = correlation[maxLag + 1];
  const a = (left + right - 2 * center) / 2;
  const b = (right - left) / 2;
  let period = maxLag;
  if (a !== 0) period = maxLag - b / (2 * a);
  if (!(period > 1)) return -1;

  const hz = sampleRate / period;
  if (!Number.isFinite(hz) || hz <= 0) return -1;
  return hz;
}

/** About 50 ms, rounded to a power of two. Matches a 2048-sample window at 48 kHz. */
export function acfWindowSize(sampleRate: number): number {
  const target = Math.max(256, sampleRate * 0.05);
  const pow = 2 ** Math.round(Math.log2(target));
  return Math.min(4096, Math.max(1024, pow));
}
