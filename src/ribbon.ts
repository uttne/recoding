import type { DetectorId, PitchPoint } from "./audio/engine";
import { pitchVoices, type VoiceOptions } from "./graph";
import { levelNear, rmsToDb, type LevelSample } from "./loudness";

/** At or below this level the pitch line is only its core. */
export const HALO_DB_QUIET = -48;
/** At or above this level the halo is fully spread. */
export const HALO_DB_LOUD = -12;
/** How far a full-level halo extends past the core, in CSS pixels. */
export const HALO_MAX_PX = 12;
export const CORE_PX = 2;
export const HALO_LAYERS = 4;
/** The newest fraction of a second stays fully opaque. */
export const RIBBON_LIVE_SECONDS = 0.3;
export const RIBBON_REST_ALPHA = 0.9;
/** Loudest core color, as a mix toward white. The halo keeps the detector hue. */
export const CORE_WHITE_MIX = 0.25;
/**
 * Half-width of the loudness median along one voice.
 * The full window is about 58 ms, the same span as Basic Pitch's five-frame median.
 */
export const LOUDNESS_MEDIAN_HALF = 0.029;

/** 0 at −48 dB and below, 1 at −12 dB and above. */
export function loudnessGain(db: number): number {
  if (!Number.isFinite(db)) return 0;
  const span = HALO_DB_LOUD - HALO_DB_QUIET;
  return Math.min(1, Math.max(0, (db - HALO_DB_QUIET) / span));
}

/**
 * Median loudness along one voice. The window stops at a missing level
 * and at samples farther than `half` seconds, so a gap is not filled in.
 * `samples` must be sorted by time.
 */
export function medianLoudness(
  samples: readonly { time: number; db: number | null }[],
  half = LOUDNESS_MEDIAN_HALF,
): Array<number | null> {
  const out: Array<number | null> = [];
  for (let index = 0; index < samples.length; index++) {
    if (samples[index].db == null) {
      out.push(null);
      continue;
    }
    let lo = index;
    let hi = index;
    while (lo > 0 && samples[lo - 1].db != null && samples[index].time - samples[lo - 1].time <= half) lo--;
    while (hi + 1 < samples.length && samples[hi + 1].db != null && samples[hi + 1].time - samples[index].time <= half) hi++;
    const window: number[] = [];
    for (let cursor = lo; cursor <= hi; cursor++) window.push(samples[cursor].db as number);
    window.sort((a, b) => a - b);
    const mid = Math.floor(window.length / 2);
    out.push(window.length % 2 === 1 ? window[mid] : (window[mid - 1] + window[mid]) / 2);
  }
  return out;
}

export function mixWhite(color: string, amount: number): string {
  const mix = Math.min(1, Math.max(0, amount));
  if (mix === 0) return color;
  const hex = color.startsWith("#") ? color.slice(1) : color;
  const value = Number.parseInt(hex, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const mixed = channels.map((channel) => Math.round(channel + (255 - channel) * mix));
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}

/** How far this halo layer extends from the pitch line. Outer layer is `layers`. */
export function haloRadius(gain: number, layer: number, layers = HALO_LAYERS, ratio = 1): number {
  const t = layer / layers;
  return HALO_MAX_PX * gain * t * ratio;
}

/** Outer layer is faintest. `base` is 1 for the live edge and lower for the settled line. */
export function haloAlpha(base: number, layer: number, layers = HALO_LAYERS): number {
  const t = layer / layers;
  return base * (0.18 + 0.45 * (1 - t));
}

export type RibbonVertex = {
  time: number;
  midi: number;
  gain: number;
};

/** One stretch of a voice whose opacity is constant. Loudness still varies per vertex. */
export type RibbonRun = {
  detector: DetectorId;
  provisional: boolean;
  alpha: number;
  vertices: RibbonVertex[];
};

/**
 * Voices already joined like the time-pitch line. Loudness is the median along
 * that voice, then kept on each vertex so the width can change continuously.
 */
export function ribbonRuns(
  points: readonly PitchPoint[],
  levels: readonly LevelSample[],
  now: number,
  a4: number,
  options: VoiceOptions = {},
): RibbonRun[] {
  const runs: RibbonRun[] = [];
  for (const voice of pitchVoices(points, now, a4, options)) {
    if (voice.points.length < 2) continue;
    const smoothed = medianLoudness(
      voice.points.map((point) => {
        const rms = levelNear(levels, point.time);
        return { time: point.time, db: rms == null ? null : rmsToDb(rms) };
      }),
    );
    const vertices = voice.points.map((point, index) => ({
      time: point.time,
      midi: point.midi,
      gain: smoothed[index] == null ? 0 : loudnessGain(smoothed[index]),
    }));
    let run: RibbonRun | null = null;
    for (let index = 1; index < vertices.length; index++) {
      const alpha = now - vertices[index].time <= RIBBON_LIVE_SECONDS ? 1 : RIBBON_REST_ALPHA;
      if (run && run.alpha === alpha) {
        run.vertices.push(vertices[index]);
        continue;
      }
      run = {
        detector: voice.detector,
        provisional: voice.provisional,
        alpha,
        vertices: [vertices[index - 1], vertices[index]],
      };
      runs.push(run);
    }
  }
  return runs;
}

/** Linear samples of pitch and loudness. Short gaps stay inside one voice; breaks are not filled. */
export function densifyRibbon(vertices: readonly RibbonVertex[], step = 0.008): RibbonVertex[] {
  if (vertices.length === 0) return [];
  const out: RibbonVertex[] = [vertices[0]];
  for (let index = 1; index < vertices.length; index++) {
    const previous = vertices[index - 1];
    const next = vertices[index];
    const pieces = Math.max(1, Math.ceil((next.time - previous.time) / step));
    for (let piece = 1; piece <= pieces; piece++) {
      const t = piece / pieces;
      out.push({
        time: previous.time + (next.time - previous.time) * t,
        midi: previous.midi + (next.midi - previous.midi) * t,
        gain: previous.gain + (next.gain - previous.gain) * t,
      });
    }
  }
  return out;
}

export type RibbonPlot = { x: number; y: number; radius: number };

/** Left and right edges of a variable-width band. Radius is the half-width at that point. */
export function ribbonOffsets(points: readonly RibbonPlot[]): { left: Array<{ x: number; y: number }>; right: Array<{ x: number; y: number }> } {
  const left: Array<{ x: number; y: number }> = [];
  const right: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length; index++) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    let dx = next.x - previous.x;
    let dy = next.y - previous.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) {
      dx = 1;
      dy = 0;
    } else {
      dx /= length;
      dy /= length;
    }
    const point = points[index];
    const nx = -dy * point.radius;
    const ny = dx * point.radius;
    left.push({ x: point.x + nx, y: point.y + ny });
    right.push({ x: point.x - nx, y: point.y - ny });
  }
  return { left, right };
}
