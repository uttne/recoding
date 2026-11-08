import { Macleod } from "pitchfinder";

/**
 * McLeod Pitch Method via pitchfinder's Macleod detector.
 * The library hard-codes an 80 Hz floor (`LOWER_PITCH_CUTOFF`).
 * `cutoff` 0.93 is the Tartini setting: the first NSDF peak at least
 * 93% as strong as the highest one, which prefers the fundamental.
 */
export const MPM_FMIN_HZ = 80;
export const MPM_FMAX_HZ = 4500;
export const MPM_CUTOFF = 0.93;
const SILENCE_RMS = 0.01;

export type MpmReading = { hz: number | null; confidence: number };

export function mpmWindowSize(sampleRate: number): number {
  const periods = Math.ceil((2 * sampleRate) / MPM_FMIN_HZ);
  let size = 1024;
  while (size < periods && size < 4096) size *= 2;
  return size;
}

export function createMpm(sampleRate: number, bufferSize = mpmWindowSize(sampleRate)) {
  const detect = Macleod({ sampleRate, bufferSize, cutoff: MPM_CUTOFF });
  return {
    bufferSize,
    estimate(frame: Float32Array, fmax = MPM_FMAX_HZ): MpmReading {
      if (frame.length !== bufferSize) {
        throw new Error(`MPM の窓長は ${bufferSize} です`);
      }
      if (rms(frame) < SILENCE_RMS) return { hz: null, confidence: 0 };
      return interpretMpm(detect(frame), fmax);
    },
  };
}

export function interpretMpm(result: { freq: number; probability: number }, fmax: number): MpmReading {
  const confidence = Number.isFinite(result.probability) ? Math.min(1, Math.max(0, result.probability)) : 0;
  const ceiling = Number.isFinite(fmax) && fmax > MPM_FMIN_HZ ? fmax : MPM_FMAX_HZ;
  if (!Number.isFinite(result.freq) || result.freq < MPM_FMIN_HZ || result.freq > ceiling) {
    return { hz: null, confidence };
  }
  return { hz: result.freq, confidence };
}

function rms(frame: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  return Math.sqrt(energy / Math.max(1, frame.length));
}
