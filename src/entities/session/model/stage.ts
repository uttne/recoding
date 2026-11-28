import { reviseHybrid, type RevisionFrame } from "../../../audio/acf-basic";
import type { DetectorId, PitchPoint } from "../../../audio/engine";
import { hzToMidi } from "../../../audio/notes";
import { MIDI_LOW, PitchGraph, WINDOW_SECONDS, viewMidiHigh } from "../../pitch/model/graph";
import { LoudnessGraph } from "../../pitch/model/loudness-graph";
import type { LevelSample } from "../../pitch/model/loudness";
import { clampFixedSpan, easePitchSpan, followPitchSpan, type PitchSpan } from "../../pitch/model/pitch-axis";
import { RibbonGraph } from "../../pitch/model/ribbon-graph";
import { sessionPorts } from "./runtime";
import {
  getA4,
  getAxisHigh,
  getAxisLow,
  getAxisMode,
  getAxisOctaves,
  getDistinguish,
  getGuides,
  getPending,
  getScale,
  ranges,
} from "./settings";

const LAGGING = new Set<DetectorId>(["acf-basic", "swiftf0", "pyin", "crepe", "basic-mono", "basic-poly"]);

const points: PitchPoint[] = [];
const levels: LevelSample[] = [];
const confirmed = new Map<DetectorId, number>();
let followTarget: PitchSpan | null = null;
let followShown: PitchSpan | null = null;
let followAt = 0;

function trimPoints(): void {
  if (points.length > 200_000) points.splice(0, points.length - 180_000);
}

export function pointCount(): number {
  return points.length;
}

export function graphPoints(): readonly PitchPoint[] {
  return points;
}

export function pushPoint(point: PitchPoint): void {
  points.push(point);
  if (!(point.detector === "acf-basic" && point.provisional)) confirmed.set(point.detector, point.time);
  trimPoints();
}

export function revisePoints(frames: readonly RevisionFrame[], basicFmax: number): void {
  const revised = reviseHybrid(points, frames, basicFmax, (point): PitchPoint => ({
    time: point.time,
    hz: point.hz,
    confidence: point.confidence,
    detector: "acf-basic",
    provisional: point.provisional,
  }));
  points.length = 0;
  points.push(...revised);
  const until = frames.reduce((max, frame) => Math.max(max, frame.time), Number.NEGATIVE_INFINITY);
  if (until > Number.NEGATIVE_INFINITY) confirmed.set("acf-basic", until);
  trimPoints();
}

export function pushLevel(time: number, rms: number): void {
  levels.push({ time, rms });
  const cutoff = time - WINDOW_SECONDS - 1;
  let drop = 0;
  while (drop < levels.length && levels[drop].time < cutoff) drop++;
  if (drop > 0) levels.splice(0, drop);
}

export function clearGraphPoints(): void {
  points.length = 0;
  confirmed.clear();
}

export function clearPlaybackSeries(): void {
  points.length = 0;
  levels.length = 0;
  confirmed.clear();
}

export function resetFollow(): void {
  followTarget = null;
  followShown = null;
  followAt = 0;
}

function pendingFrom(): number | null {
  const { engine, getEngagedAt } = sessionPorts();
  if (!engine.running || !LAGGING.has(engine.detector)) return null;
  const at = confirmed.get(engine.detector);
  const engagedAt = getEngagedAt();
  if (at == null || at < engagedAt) return engagedAt;
  return at;
}

function pitchBounds(): PitchSpan {
  return { low: MIDI_LOW, high: viewMidiHigh(ranges(), getA4()) };
}

function latestMidi(now: number): number | null {
  const cutoff = now - WINDOW_SECONDS;
  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i];
    if (point.time < cutoff) break;
    if (point.hz != null && point.hz > 0) return hzToMidi(point.hz, getA4());
  }
  return null;
}

function visiblePitchSpan(now: number): PitchSpan | undefined {
  const bounds = pitchBounds();
  const axisMode = getAxisMode();
  if (axisMode === "full") return undefined;
  if (axisMode === "fixed") return clampFixedSpan(getAxisLow(), getAxisHigh(), bounds);
  const target = followPitchSpan(followTarget, latestMidi(now), getAxisOctaves() * 12, bounds);
  const dt = followAt > 0 ? (performance.now() - followAt) / 1000 : 0;
  followTarget = target;
  followShown = easePitchSpan(followShown, target, dt);
  followAt = performance.now();
  return followShown;
}

export function mountStage(root: HTMLElement, canvases: {
  pitch: HTMLCanvasElement;
  ribbon: HTMLCanvasElement;
  loudness: HTMLCanvasElement;
}): () => void {
  const pitch = new PitchGraph(canvases.pitch);
  const ribbon = new RibbonGraph(canvases.ribbon);
  const loudness = new LoudnessGraph(canvases.loudness);
  const resize = () => {
    pitch.resize();
    ribbon.resize();
    loudness.resize();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(root);
  let frame = 0;
  const paint = () => {
    const now = Math.max(sessionPorts().getClock(), points.at(-1)?.time ?? 0);
    const pitchSpan = visiblePitchSpan(now);
    const graphFrame = {
      pendingFrom: getPending() ? pendingFrom() : null,
      ranges: ranges(),
      style: {
        distinguish: getDistinguish(),
        guides: getGuides(),
        pending: getPending(),
        scale: getScale(),
        ...(pitchSpan ? { pitchSpan } : {}),
      },
    };
    const a4 = getA4();
    pitch.setA4(a4);
    ribbon.setA4(a4);
    loudness.setA4(a4);
    pitch.draw(points, now, graphFrame);
    ribbon.draw(points, levels, now, graphFrame);
    loudness.draw(points, levels, now, graphFrame);
    frame = requestAnimationFrame(paint);
  };
  frame = requestAnimationFrame(paint);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
  };
}
