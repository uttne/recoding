export type PitchSpan = { low: number; high: number };

export type PitchAxisMode = "full" | "fixed" | "follow";

/** The fixed range stays at least an octave tall. */
export const PITCH_AXIS_MIN_SEMITONES = 12;
/** Scroll only after the note enters this fraction of the window from an edge. */
const FOLLOW_ENTER = 0.22;
/** After a scroll, leave the note this far from that edge so vibrato does not immediately scroll again. */
const FOLLOW_REST = 0.38;

export function clampFixedSpan(low: number, high: number, bounds: PitchSpan): PitchSpan {
  const floor = Math.min(bounds.low, bounds.high);
  const ceil = Math.max(bounds.low, bounds.high);
  const minSpan = Math.min(PITCH_AXIS_MIN_SEMITONES, ceil - floor);
  let lo = Math.min(ceil, Math.max(floor, Math.min(low, high)));
  let hi = Math.max(floor, Math.min(ceil, Math.max(low, high)));
  if (hi - lo < minSpan) {
    hi = Math.min(ceil, lo + minSpan);
    lo = Math.max(floor, hi - minSpan);
  }
  return { low: lo, high: hi };
}

/**
 * A window of fixed height that keeps `focus` on screen.
 * It stays put while the note is away from the edges, and when it does move
 * it leaves room on that side instead of putting the note in the center.
 * No focus keeps the previous window.
 */
export function followPitchSpan(
  previous: PitchSpan | null,
  focus: number | null,
  semitones: number,
  bounds: PitchSpan,
): PitchSpan {
  const room = bounds.high - bounds.low;
  const span = Math.min(room, Math.max(Math.min(PITCH_AXIS_MIN_SEMITONES, room), semitones));
  if (focus == null) {
    if (previous) return fitWindow(previous, span, bounds);
    return clampWindow((bounds.low + bounds.high) / 2 - span / 2, span, bounds);
  }
  if (!previous) return clampWindow(focus - span / 2, span, bounds);
  const current = fitWindow(previous, span, bounds);
  const enter = span * FOLLOW_ENTER;
  const rest = span * FOLLOW_REST;
  if (focus > current.high - enter) return clampWindow(focus + rest - span, span, bounds);
  if (focus < current.low + enter) return clampWindow(focus - rest, span, bounds);
  return current;
}

/** Glide toward the target. A long gap snaps, so a hidden tab does not crawl back. */
export function easePitchSpan(current: PitchSpan | null, target: PitchSpan, dt: number): PitchSpan {
  if (!current || !(dt > 0) || dt > 0.5) return target;
  const t = 1 - Math.exp(-dt / 0.2);
  const low = current.low + (target.low - current.low) * t;
  const high = current.high + (target.high - current.high) * t;
  if (Math.abs(low - target.low) < 0.02 && Math.abs(high - target.high) < 0.02) return target;
  return { low, high };
}

function fitWindow(previous: PitchSpan, span: number, bounds: PitchSpan): PitchSpan {
  if (Math.abs(previous.high - previous.low - span) < 1e-6) return clampWindow(previous.low, span, bounds);
  const center = (previous.low + previous.high) / 2;
  return clampWindow(center - span / 2, span, bounds);
}

function clampWindow(low: number, span: number, bounds: PitchSpan): PitchSpan {
  let lo = low;
  let hi = low + span;
  if (lo < bounds.low) {
    lo = bounds.low;
    hi = lo + span;
  }
  if (hi > bounds.high) {
    hi = bounds.high;
    lo = hi - span;
  }
  return { low: lo, high: hi };
}
