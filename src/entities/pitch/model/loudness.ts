import type { DetectorId, PitchPoint } from "../../../audio/engine";

export type LevelSample = { time: number; rms: number };

/** Full scale is 0 dBFS. Quieter than this is not drawn. */
export const DB_FLOOR = -60;
export const DB_CEIL = 0;
/** A pitch point uses the chunk RMS nearest its time, within this gap. */
export const LEVEL_TOLERANCE = 0.05;

export function rmsToDb(rms: number): number | null {
  if (!(rms > 0) || !Number.isFinite(rms)) return null;
  const db = 20 * Math.log10(rms);
  return Number.isFinite(db) ? db : null;
}

/** dBFS of the chunk nearest `time`, or null when none is close enough. */
export function levelDbAt(levels: readonly LevelSample[], time: number): number | null {
  const rms = levelNear(levels, time);
  if (rms == null) return null;
  return rmsToDb(rms);
}

/** True at the floor and above. A missing level is not loud enough. */
export function keepsLevel(db: number | null, floor: number): boolean {
  return db != null && db >= floor;
}

/**
 * A voiced point the level gate takes off the graphs.
 * No floor leaves every point. Silence from the detector is not this gate.
 */
export function droppedByLevel(point: PitchPoint, db: number | null, floor: number | undefined): boolean {
  if (floor == null || !Number.isFinite(floor)) return false;
  const voiced = (point.pitches != null && point.pitches.length > 0) || (point.hz != null && point.hz > 0);
  if (!voiced) return false;
  return !keepsLevel(db, floor);
}

/** `levels` must be sorted by time. Returns null when nothing is close enough. */
export function levelNear(levels: readonly LevelSample[], time: number, tolerance = LEVEL_TOLERANCE): number | null {
  const count = levels.length;
  if (count === 0) return null;
  let lo = 0;
  let hi = count - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (levels[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  let best = lo;
  if (lo > 0 && Math.abs(levels[lo - 1].time - time) <= Math.abs(levels[lo].time - time)) best = lo - 1;
  if (Math.abs(levels[best].time - time) > tolerance) return null;
  return levels[best].rms;
}

export type LoudnessMark = {
  hz: number;
  db: number;
  time: number;
  detector: DetectorId;
  provisional: boolean;
};

/**
 * Voiced pitches in the recent window, each paired with the microphone RMS
 * at that time. A chord shares one loudness, because the input has one level.
 */
export function loudnessMarks(
  points: readonly PitchPoint[],
  levels: readonly LevelSample[],
  now: number,
  windowSeconds: number,
  levelFloor?: number,
): LoudnessMark[] {
  const marks: LoudnessMark[] = [];
  for (const point of points) {
    if (point.time > now || now - point.time > windowSeconds) continue;
    const freqs = point.pitches?.length ? point.pitches.map((pitch) => pitch.hz) : point.hz == null ? [] : [point.hz];
    if (freqs.length === 0) continue;
    const rms = levelNear(levels, point.time);
    if (rms == null) continue;
    const db = rmsToDb(rms);
    if (db == null || db < DB_FLOOR || droppedByLevel(point, db, levelFloor)) continue;
    for (const hz of freqs) {
      if (!(hz > 0)) continue;
      marks.push({
        hz,
        db,
        time: point.time,
        detector: point.detector,
        provisional: point.provisional === true,
      });
    }
  }
  marks.sort((a, b) => a.time - b.time);
  return marks;
}

export function loudnessX(midi: number, left: number, width: number, midiLow: number, midiHigh: number): number {
  const span = midiHigh - midiLow;
  const clamped = Math.min(midiHigh, Math.max(midiLow, midi));
  return left + ((clamped - midiLow) / span) * width;
}

export function loudnessY(db: number, top: number, height: number, floor = DB_FLOOR, ceil = DB_CEIL): number {
  const span = ceil - floor;
  const clamped = Math.min(ceil, Math.max(floor, db));
  return top + ((ceil - clamped) / span) * height;
}
