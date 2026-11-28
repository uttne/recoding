import { hzToMidi, noteName } from "../../../audio/notes";
import type { DetectorId, PitchPoint } from "../../../audio/engine";
import { droppedByLevel, levelDbAt, type LevelSample } from "./loudness";
import { scaleRole, type ScaleChoice, type ScaleRole } from "./scale";

export const MIDI_LOW = 30;
export const MIDI_HIGH = 108;
export const WINDOW_SECONDS = 8;
const GUTTER = 56;

const COLOR: Record<DetectorId, string> = {
  acf2: "#e6a15c",
  "acf-basic": "#f2b48a",
  swiftf0: "#7ed0cb",
  mpm: "#e6d36a",
  pyin: "#c792ea",
  crepe: "#8eb6f0",
  "basic-mono": "#f0a0b4",
  "basic-poly": "#e07a6a",
};

/** One pitch color for the performance view. Detector hues stay behind the debug switch. */
export const UNIFIED_PITCH_COLOR = "#f2b48a";

function traceColor(detector: DetectorId, provisional: boolean): string {
  if (detector === "acf-basic") return provisional ? COLOR.acf2 : COLOR["basic-mono"];
  return COLOR[detector];
}

export function pointColor(detector: DetectorId, provisional: boolean, distinguish = true): string {
  if (!distinguish) return UNIFIED_PITCH_COLOR;
  return traceColor(detector, provisional);
}

export function detectorColor(detector: DetectorId): string {
  return COLOR[detector];
}

export function detectorLimitLabel(detector: DetectorId): string {
  return LIMIT_LABEL[detector];
}

/** Top of the pitch axis. Grows when a detector ceiling sits above C8. */
export function viewMidiHigh(ranges: GraphRanges | undefined, a4: number): number {
  if (!ranges) return MIDI_HIGH;
  let high = MIDI_HIGH;
  for (const range of Object.values(ranges.byDetector)) {
    high = Math.max(high, Math.ceil(hzToMidi(range.fmax, a4) + 1));
  }
  return high;
}

/** Semitones a segment may rise or fall before the line breaks. */
function joinLimit(detector: DetectorId, previousProvisional: boolean, provisional: boolean): number {
  if (detector === "basic-mono" || detector === "basic-poly") return 0.75;
  if (detector === "acf-basic" && !previousProvisional && !provisional) return 0.75;
  return 0.5;
}

const LIMIT_LABEL: Record<DetectorId, string> = {
  acf2: "ACF2+",
  "acf-basic": "ACF→Basic",
  swiftf0: "SwiftF0",
  mpm: "MPM",
  pyin: "pYIN",
  crepe: "Tiny-CREPE",
  "basic-mono": "Basic Pitch",
  "basic-poly": "Basic Pitch",
};

export type FrequencyRange = { fmin: number; fmax: number };

export type GraphRanges = {
  active: DetectorId;
  byDetector: Record<DetectorId, FrequencyRange>;
};

export type GraphStyle = {
  /** Paint each detector, and ACF2+ versus Basic, in its own color. */
  distinguish: boolean;
  /** Dim outside the active range and draw the limit lines. */
  guides: boolean;
  /** Wash the time that a lagging detector has not confirmed. */
  pending: boolean;
  /** Chord scale for the pitch grid. Omitted means every semitone. */
  scale?: ScaleChoice;
  /** Visible MIDI range. Omitted means the full axis. */
  pitchSpan?: { low: number; high: number };
};

export type GraphFrame = {
  pendingFrom?: number | null;
  ranges?: GraphRanges;
  /** Omitted style keeps the debug drawing used by the original graphs. */
  style?: GraphStyle;
  /** dBFS. A voiced point quieter than this breaks the line. Omitted draws every voiced point. */
  levelFloor?: number;
};

/** A pitch the time-pitch line keeps. Several voices can share one timestamp. */
export type VoicePoint = {
  time: number;
  hz: number;
  midi: number;
  detector: DetectorId;
  provisional: boolean;
};

/** One continuous stroke. A provisional color change starts a second voice that shares the boundary. */
export type PitchVoice = {
  detector: DetectorId;
  provisional: boolean;
  points: VoicePoint[];
};

const VOICE_GAP_SECONDS = 0.05;

export type VoiceOptions = {
  /** Start a new stroke where ACF2+ hands over to Basic. Default keeps that split. */
  splitProvisional?: boolean;
  /** Chunk levels. With `levelFloor`, a quieter voiced point is a break, not a missing sample. */
  levels?: readonly LevelSample[];
  /** dBFS. Omitted keeps every voiced point. */
  levelFloor?: number;
};

/**
 * Voices for the time-pitch line. Breaks on silence, a level below `levelFloor`, a gap over 50 ms,
 * a detector change, or a jump past the semitone limit.
 * With `splitProvisional: false`, an ACF2+→Basic handoff stays one stroke and uses the wider join.
 */
export function pitchVoices(
  points: readonly PitchPoint[],
  now: number,
  a4: number,
  options: VoiceOptions = {},
): PitchVoice[] {
  const split = options.splitProvisional !== false;
  const visible = points
    .filter((point) => now - point.time <= WINDOW_SECONDS && point.time <= now)
    .sort((a, b) => a.time - b.time);
  const voices: PitchVoice[] = [];
  type Open = { time: number; midi: number; detector: DetectorId; provisional: boolean; voice: PitchVoice };
  let open: Open[] = [];
  for (const point of visible) {
    const db = options.levels ? levelDbAt(options.levels, point.time) : null;
    const freqs = droppedByLevel(point, db, options.levelFloor)
      ? []
      : point.pitches?.length
        ? point.pitches.map((pitch) => pitch.hz)
        : point.hz == null
          ? []
          : [point.hz];
    if (freqs.length === 0) {
      open = [];
      continue;
    }
    const provisional = point.provisional === true;
    const used = new Set<number>();
    const next: Open[] = [];
    for (const hz of freqs) {
      const midi = hzToMidi(hz, a4);
      let best = -1;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let i = 0; i < open.length; i++) {
        if (used.has(i) || open[i].detector !== point.detector || point.time - open[i].time > VOICE_GAP_SECONDS) continue;
        const limit = joinLimit(
          point.detector,
          split ? open[i].provisional : false,
          split ? provisional : false,
        );
        const dist = Math.abs(midi - open[i].midi);
        if (dist <= limit && dist <= bestDist) {
          best = i;
          bestDist = dist;
        }
      }
      const vertex: VoicePoint = { time: point.time, hz, midi, detector: point.detector, provisional };
      if (best >= 0) {
        used.add(best);
        const prev = open[best];
        const previous = prev.voice.points[prev.voice.points.length - 1];
        prev.voice.points.push(vertex);
        if (!split || prev.provisional === provisional) {
          next.push({ time: point.time, midi, detector: point.detector, provisional: prev.provisional, voice: prev.voice });
        } else {
          const voice: PitchVoice = { detector: point.detector, provisional, points: [{ ...previous }, vertex] };
          voices.push(voice);
          next.push({ time: point.time, midi, detector: point.detector, provisional, voice });
        }
      } else {
        const voice: PitchVoice = { detector: point.detector, provisional, points: [vertex] };
        voices.push(voice);
        next.push({ time: point.time, midi, detector: point.detector, provisional, voice });
      }
    }
    open = next;
  }
  return voices;
}

export type PitchTimeLayout = {
  ratio: number;
  plotLeft: number;
  plotTop: number;
  plotWidth: number;
  plotHeight: number;
  midiLow: number;
  midiHigh: number;
};

/** Sung pitch stroke in CSS pixels. Thicker than every pitch-grid tier. */
export const PITCH_TRACE_CSS = 3.4;

/**
 * Pitch-grid stroke in CSS pixels, before `devicePixelRatio`.
 * The steps stay far enough apart that each tier keeps its own pixel width
 * on a 1.25x display, and the sung trace stays thicker than the main line.
 * Main is C, or the scale root. Middle is another white key, or a chord tone.
 * Guide is a black key, or any other scale degree.
 */
export const PITCH_GRID_CSS = {
  main: 2.5,
  middle: 1.7,
  guide: 1,
} as const;

export type PitchGridTier = keyof typeof PITCH_GRID_CSS;

const CHROMATIC_GRID_COLOR: Record<PitchGridTier, string> = {
  main: "rgba(243,234,215,0.28)",
  middle: "rgba(243,234,215,0.12)",
  guide: "rgba(243,234,215,0.05)",
};

const SCALE_GRID_COLOR: Record<PitchGridTier, string> = {
  main: "rgba(243,234,215,0.55)",
  middle: "rgba(243,234,215,0.28)",
  guide: "rgba(243,234,215,0.12)",
};

const WHITE_KEY_PITCH_CLASS = new Set([2, 4, 5, 7, 9, 11]);

/** C is the heavy line. The other white keys sit between C and the black keys. */
export function chromaticGridTier(pitchClass: number): PitchGridTier {
  const pc = ((pitchClass % 12) + 12) % 12;
  if (pc === 0) return "main";
  if (WHITE_KEY_PITCH_CLASS.has(pc)) return "middle";
  return "guide";
}

/** Root, chord tone, then the remaining scale degree. Same weights as the chromatic grid. */
export function scaleGridTier(role: ScaleRole): PitchGridTier {
  if (role === "root") return "main";
  if (role === "chord") return "middle";
  return "guide";
}

export function pitchGridStroke(
  tier: PitchGridTier,
  kind: "chromatic" | "scale",
  ratio: number,
): { lineWidth: number; strokeStyle: string } {
  return {
    lineWidth: PITCH_GRID_CSS[tier] * ratio,
    strokeStyle: (kind === "chromatic" ? CHROMATIC_GRID_COLOR : SCALE_GRID_COLOR)[tier],
  };
}

export function pitchPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
}

export function pitchTimeX(time: number, now: number, left: number, width: number): number {
  return left + ((time - (now - WINDOW_SECONDS)) / WINDOW_SECONDS) * width;
}

export function pitchY(midi: number, midiLow: number, midiHigh: number, top: number, height: number, clamp: boolean): number {
  const span = midiHigh - midiLow;
  const value = clamp ? Math.min(midiHigh, Math.max(midiLow, midi)) : midi;
  return top + ((midiHigh - value) / span) * height;
}

/** Grid, unconfirmed band, and detector limits shared by the time-pitch canvases. */
export function paintPitchTimeAxes(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  now: number,
  a4: number,
  frame: GraphFrame = {},
): PitchTimeLayout {
  const pendingFrom = frame.style?.pending === false ? null : (frame.pendingFrom ?? null);
  const ranges = frame.ranges;
  const showGuides = frame.style?.guides !== false;
  const distinguish = frame.style?.distinguish !== false;
  const fullHigh = viewMidiHigh(ranges, a4);
  const requested = frame.style?.pitchSpan;
  const midiLow = requested && requested.high > requested.low ? requested.low : MIDI_LOW;
  const midiHigh = requested && requested.high > requested.low ? requested.high : fullHigh;
  const ratio = pitchPixelRatio();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#211c17";
  ctx.fillRect(0, 0, width, height);

  const plotLeft = GUTTER * ratio;
  const plotWidth = width - plotLeft - 12 * ratio;
  const plotTop = 16 * ratio;
  const plotHeight = height - 28 * ratio;
  const yAt = (midi: number) => pitchY(midi, midiLow, midiHigh, plotTop, plotHeight, true);
  const yOpen = (midi: number) => pitchY(midi, midiLow, midiHigh, plotTop, plotHeight, false);

  ctx.font = `${12 * ratio}px "Segoe UI", "Yu Gothic UI", sans-serif`;
  ctx.textBaseline = "middle";

  const scale = frame.style?.scale ?? { kind: "chromatic" as const };
  for (let midi = Math.ceil(midiLow); midi <= Math.floor(midiHigh); midi++) {
    const y = yAt(midi);
    const pitchClass = ((midi % 12) + 12) % 12;
    if (scale.kind === "chromatic") {
      const tier = chromaticGridTier(pitchClass);
      const stroke = pitchGridStroke(tier, "chromatic", ratio);
      ctx.lineWidth = stroke.lineWidth;
      ctx.strokeStyle = stroke.strokeStyle;
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotLeft + plotWidth, y);
      ctx.stroke();
      if (tier === "main") {
        const octave = Math.floor(midi / 12) - 1;
        ctx.fillStyle = "rgba(243,234,215,0.72)";
        ctx.textAlign = "right";
        ctx.fillText(`C${octave}`, plotLeft - 8 * ratio, y);
      }
      continue;
    }
    const role = scaleRole(pitchClass, scale);
    if (!role) continue;
    const stroke = pitchGridStroke(scaleGridTier(role), "scale", ratio);
    ctx.lineWidth = stroke.lineWidth;
    ctx.strokeStyle = stroke.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotLeft + plotWidth, y);
    ctx.stroke();
    if (role !== "root") continue;
    ctx.fillStyle = "rgba(243,234,215,0.86)";
    ctx.textAlign = "right";
    ctx.fillText(noteName(midi), plotLeft - 8 * ratio, y);
  }

  if (pendingFrom != null && pendingFrom < now && ranges) {
    const xFor = (time: number) => pitchTimeX(time, now, plotLeft, plotWidth);
    const x0 = Math.max(plotLeft, Math.min(plotLeft + plotWidth, xFor(pendingFrom)));
    const x1 = plotLeft + plotWidth;
    if (x1 > x0) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = distinguish ? (ranges.active === "acf-basic" ? COLOR.acf2 : COLOR[ranges.active]) : UNIFIED_PITCH_COLOR;
      ctx.fillRect(x0, plotTop, x1 - x0, plotHeight);
      ctx.restore();
    }
  }

  if (ranges && showGuides) {
    const active = ranges.byDetector[ranges.active];
    const yMax = yOpen(hzToMidi(active.fmax, a4));
    const yMin = yOpen(hzToMidi(active.fmin, a4));
    const bottom = plotTop + plotHeight;
    ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
    if (yMax > plotTop) {
      const edge = Math.min(yMax, bottom);
      ctx.fillRect(plotLeft, plotTop, plotWidth, edge - plotTop);
    }
    if (yMin < bottom) {
      const edge = Math.max(yMin, plotTop);
      ctx.fillRect(plotLeft, edge, plotWidth, bottom - edge);
    }
    drawLimit(ctx, active.fmin, ranges.active, "下限", "left", plotLeft, plotTop, plotWidth, plotHeight, ratio, a4, yOpen, distinguish);
    drawLimit(ctx, active.fmax, ranges.active, "上限", "right", plotLeft, plotTop, plotWidth, plotHeight, ratio, a4, yOpen, distinguish);
  }

  return { ratio, plotLeft, plotTop, plotWidth, plotHeight, midiLow, midiHigh };
}

function drawLimit(
  ctx: CanvasRenderingContext2D,
  hz: number,
  detector: DetectorId,
  edge: "下限" | "上限",
  align: "left" | "right",
  left: number,
  top: number,
  width: number,
  height: number,
  ratio: number,
  a4: number,
  yOpen: (midi: number) => number,
  distinguish: boolean,
): void {
  const y = yOpen(hzToMidi(hz, a4));
  if (y < top || y > top + height) return;
  const color = distinguish ? COLOR[detector] : UNIFIED_PITCH_COLOR;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5 * ratio;
  ctx.setLineDash([7 * ratio, 5 * ratio]);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(left + width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  ctx.font = `${12 * ratio}px "Segoe UI", "Yu Gothic UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = y + 16 * ratio > top + height ? "bottom" : "top";
  const note = noteName(hzToMidi(hz, a4));
  const label = distinguish ? `${detectorLimitLabel(detector)} ${edge} ${note}` : `${edge} ${note}`;
  const x = align === "left" ? left + 10 * ratio : left + width - 10 * ratio;
  const textY = ctx.textBaseline === "top" ? y + 5 * ratio : y - 5 * ratio;
  ctx.fillText(label, x, textY);
  ctx.restore();
}

export class PitchGraph {
  private readonly ctx: CanvasRenderingContext2D;
  private a4 = 440;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas を初期化できません");
    this.ctx = ctx;
  }

  setA4(a4: number): void {
    this.a4 = a4;
  }

  resize(): void {
    const ratio = pitchPixelRatio();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(width * ratio));
    this.canvas.height = Math.max(1, Math.floor(height * ratio));
  }

  draw(points: PitchPoint[], now: number, frame: GraphFrame = {}, levels: readonly LevelSample[] = []): void {
    const layout = paintPitchTimeAxes(this.ctx, this.canvas.width, this.canvas.height, now, this.a4, frame);
    const { ctx } = this;
    const { ratio, plotLeft, plotTop, plotWidth, plotHeight, midiLow, midiHigh } = layout;
    ctx.lineWidth = PITCH_TRACE_CSS * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const distinguish = frame.style?.distinguish !== false;
    for (const voice of pitchVoices(points, now, this.a4, {
      splitProvisional: distinguish,
      levels,
      levelFloor: frame.levelFloor,
    })) {
      ctx.beginPath();
      ctx.strokeStyle = pointColor(voice.detector, voice.provisional, distinguish);
      const first = voice.points[0];
      ctx.moveTo(pitchTimeX(first.time, now, plotLeft, plotWidth), pitchY(first.midi, midiLow, midiHigh, plotTop, plotHeight, true));
      for (let i = 1; i < voice.points.length; i++) {
        const point = voice.points[i];
        ctx.lineTo(
          pitchTimeX(point.time, now, plotLeft, plotWidth),
          pitchY(point.midi, midiLow, midiHigh, plotTop, plotHeight, true),
        );
      }
      ctx.stroke();
    }

    const playhead = plotLeft + plotWidth;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgba(243,234,215,0.35)";
    ctx.lineWidth = ratio;
    ctx.beginPath();
    ctx.moveTo(playhead, plotTop);
    ctx.lineTo(playhead, plotTop + plotHeight);
    ctx.stroke();
  }
}
