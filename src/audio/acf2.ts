/** Lowest frequency searched, in Hz. */
const FMIN_HZ = 50;
/** Highest frequency searched. Aligned with SwiftF0's upper bound. */
const FMAX_HZ = 2100;
/** Shortest local peak at least this fraction of the best normalized peak wins. */
const PEAK_RATIO = 0.9;
/** Normalized peak divided by lag 0. Below this the frame is unvoiced. */
const CLARITY_MIN = 0.3;

/**
 * ACF2+ pitch detector. The RMS gate, edge trim, and parabolic interpolation
 * follow dalatant's PitchDetect proposal. The searched lag is limited to
 * 50–2100 Hz. Peak heights are compared after dividing by the overlap count,
 * so a short lag is not preferred just because more products contribute.
 * The lag itself stays on a peak of the raw sum: normalizing before the
 * search moved an 82.41 Hz peak at 48 kHz from lag 582 to 588.
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
  const raw = new Float32Array(size);
  for (let tau = 0; tau < size; tau++) {
    let sum = 0;
    const overlap = size - tau;
    for (let i = 0; i < overlap; i++) sum += sliced[i] * sliced[i + tau];
    raw[tau] = sum;
  }
  if (!(raw[0] > 0)) return -1;

  let dip = 0;
  while (dip + 1 < size && raw[dip] > raw[dip + 1]) dip++;

  const minLag = Math.max(dip, Math.ceil(sampleRate / FMAX_HZ));
  const maxLag = Math.min(size - 2, Math.floor(sampleRate / FMIN_HZ));
  if (minLag > maxLag) return -1;

  const height = (tau: number) => raw[tau] / (size - tau);
  let maxValue = -Infinity;
  let rawMaxAt = -1;
  let rawMax = -Infinity;
  for (let tau = minLag; tau <= maxLag; tau++) {
    const value = height(tau);
    if (value > maxValue) maxValue = value;
    if (raw[tau] > rawMax) {
      rawMax = raw[tau];
      rawMaxAt = tau;
    }
  }
  if (rawMaxAt <= 0) return -1;

  const peakThreshold = PEAK_RATIO * maxValue;
  let chosen = -1;
  for (let tau = Math.max(minLag, 1); tau <= maxLag; tau++) {
    if (height(tau) < peakThreshold) continue;
    if (raw[tau] >= raw[tau - 1] && raw[tau] >= raw[tau + 1]) {
      chosen = tau;
      break;
    }
  }
  if (chosen < 0) chosen = rawMaxAt;
  if (chosen <= 0 || chosen >= size - 1) return -1;
  if (height(chosen) / height(0) < CLARITY_MIN) return -1;

  const left = raw[chosen - 1];
  const center = raw[chosen];
  const right = raw[chosen + 1];
  const a = (left + right - 2 * center) / 2;
  const b = (right - left) / 2;
  let period = chosen;
  if (a !== 0) period = chosen - b / (2 * a);
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
