import { BASIC_FFT_HOP, BASIC_SAMPLE_RATE } from "./basicpitch";

/**
 * Half a Basic Pitch frame. A provisional ACF2+ point is revised only when a
 * Basic Pitch frame lands at least this close, so trimmed edges and skipped
 * windows stay on the live trace.
 */
export const REVISION_RADIUS = BASIC_FFT_HOP / BASIC_SAMPLE_RATE / 2;

export type RevisionFrame = {
  time: number;
  hz: number | null;
  confidence: number;
};

type HybridPoint = {
  time: number;
  hz: number | null;
  confidence: number;
  provisional?: boolean;
};

/**
 * Replace provisional ACF2+ points with Basic Pitch mono frames.
 * A frame with a pitch wins. A silent frame keeps a provisional point only
 * when that point is above `basicFmax`, and leaves that point provisional so
 * the trace keeps the ACF2+ color. Points farther than {@link REVISION_RADIUS}
 * from every frame stay provisional.
 */
export function reviseHybrid<T extends HybridPoint>(
  points: readonly T[],
  frames: readonly RevisionFrame[],
  basicFmax: number,
  stamp: (point: RevisionFrame & { provisional: boolean }) => T,
): T[] {
  const ordered = frames.filter((frame) => Number.isFinite(frame.time)).sort((a, b) => a.time - b.time);
  if (ordered.length === 0) return [...points];

  const ceiling = Number.isFinite(basicFmax) && basicFmax > 0 ? basicFmax : Number.POSITIVE_INFINITY;
  const limit = REVISION_RADIUS + 1e-4;
  const assigned = new Map<number, T[]>();
  const claimed = new Set<T>();

  for (const point of points) {
    if (!point.provisional) continue;
    let best = -1;
    let bestDist = limit;
    for (let i = 0; i < ordered.length; i++) {
      const dist = Math.abs(point.time - ordered[i].time);
      if (dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    }
    if (best < 0) continue;
    const bucket = assigned.get(best);
    if (bucket) bucket.push(point);
    else assigned.set(best, [point]);
    claimed.add(point);
  }

  const inserted: T[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const frame = ordered[i];
    const nearby = assigned.get(i) ?? [];
    if (frame.hz != null) {
      inserted.push(stamp({ time: frame.time, hz: frame.hz, confidence: frame.confidence, provisional: false }));
      continue;
    }
    const high = nearby.filter((point) => point.hz != null && point.hz > ceiling);
    if (high.length === 0) {
      if (nearby.length > 0) {
        inserted.push(stamp({ time: frame.time, hz: null, confidence: frame.confidence, provisional: false }));
      }
      continue;
    }
    high.sort((a, b) => Math.abs(a.time - frame.time) - Math.abs(b.time - frame.time));
    const pick = high[0];
    inserted.push(stamp({ time: pick.time, hz: pick.hz, confidence: pick.confidence, provisional: true }));
  }

  return [...points.filter((point) => !claimed.has(point)), ...inserted];
}
