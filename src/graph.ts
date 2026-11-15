import { hzToMidi, noteName } from "./audio/notes";
import type { DetectorId, PitchPoint } from "./audio/engine";

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

function traceColor(detector: DetectorId, provisional: boolean): string {
  if (detector === "acf-basic") return provisional ? COLOR.acf2 : COLOR["basic-mono"];
  return COLOR[detector];
}

export function pointColor(detector: DetectorId, provisional: boolean): string {
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

export type GraphFrame = {
  pendingFrom?: number | null;
  ranges?: GraphRanges;
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

/**
 * Voices for the time-pitch line. Breaks on silence, a gap over 50 ms,
 * a detector change, or a jump past the semitone limit.
 */
export function pitchVoices(points: readonly PitchPoint[], now: number, a4: number): PitchVoice[] {
  const visible = points
    .filter((point) => now - point.time <= WINDOW_SECONDS && point.time <= now)
    .sort((a, b) => a.time - b.time);
  const voices: PitchVoice[] = [];
  type Open = { time: number; midi: number; detector: DetectorId; provisional: boolean; voice: PitchVoice };
  let open: Open[] = [];
  for (const point of visible) {
    const freqs = point.pitches?.length ? point.pitches.map((pitch) => pitch.hz) : point.hz == null ? [] : [point.hz];
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
        const limit = joinLimit(point.detector, open[i].provisional, provisional);
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
        if (prev.provisional === provisional) {
          next.push({ time: point.time, midi, detector: point.detector, provisional, voice: prev.voice });
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
  midiHigh: number;
};

export function pitchPixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
}

export function pitchTimeX(time: number, now: number, left: number, width: number): number {
  return left + ((time - (now - WINDOW_SECONDS)) / WINDOW_SECONDS) * width;
}

export function pitchY(midi: number, midiHigh: number, top: number, height: number, clamp: boolean): number {
  const span = midiHigh - MIDI_LOW;
  const value = clamp ? Math.min(midiHigh, Math.max(MIDI_LOW, midi)) : midi;
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
  const pendingFrom = frame.pendingFrom ?? null;
  const ranges = frame.ranges;
  const midiHigh = viewMidiHigh(ranges, a4);
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
  const yAt = (midi: number) => pitchY(midi, midiHigh, plotTop, plotHeight, true);
  const yOpen = (midi: number) => pitchY(midi, midiHigh, plotTop, plotHeight, false);

  ctx.font = `${12 * ratio}px "Segoe UI", "Yu Gothic UI", sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineWidth = 1;

  for (let midi = MIDI_LOW; midi <= midiHigh; midi++) {
    const y = yAt(midi);
    const pitchClass = ((midi % 12) + 12) % 12;
    const isC = pitchClass === 0;
    const isNatural = pitchClass === 0 || pitchClass === 2 || pitchClass === 4 || pitchClass === 5 || pitchClass === 7 || pitchClass === 9 || pitchClass === 11;
    ctx.strokeStyle = isC ? "rgba(243,234,215,0.28)" : isNatural ? "rgba(243,234,215,0.12)" : "rgba(243,234,215,0.05)";
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotLeft + plotWidth, y);
    ctx.stroke();
    if (isC) {
      const octave = Math.floor(midi / 12) - 1;
      ctx.fillStyle = "rgba(243,234,215,0.72)";
      ctx.textAlign = "right";
      ctx.fillText(`C${octave}`, plotLeft - 8 * ratio, y);
    }
  }

  if (pendingFrom != null && pendingFrom < now && ranges) {
    const xFor = (time: number) => pitchTimeX(time, now, plotLeft, plotWidth);
    const x0 = Math.max(plotLeft, Math.min(plotLeft + plotWidth, xFor(pendingFrom)));
    const x1 = plotLeft + plotWidth;
    if (x1 > x0) {
      ctx.save();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = ranges.active === "acf-basic" ? COLOR.acf2 : COLOR[ranges.active];
      ctx.fillRect(x0, plotTop, x1 - x0, plotHeight);
      ctx.restore();
    }
  }

  if (ranges) {
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
    drawLimit(ctx, active.fmin, ranges.active, "下限", "left", plotLeft, plotTop, plotWidth, plotHeight, ratio, a4, yOpen);
    drawLimit(ctx, active.fmax, ranges.active, "上限", "right", plotLeft, plotTop, plotWidth, plotHeight, ratio, a4, yOpen);
  }

  return { ratio, plotLeft, plotTop, plotWidth, plotHeight, midiHigh };
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
): void {
  const y = yOpen(hzToMidi(hz, a4));
  if (y < top || y > top + height) return;
  ctx.save();
  ctx.strokeStyle = COLOR[detector];
  ctx.lineWidth = 1.5 * ratio;
  ctx.setLineDash([7 * ratio, 5 * ratio]);
  ctx.beginPath();
  ctx.moveTo(left, y);
  ctx.lineTo(left + width, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLOR[detector];
  ctx.font = `${12 * ratio}px "Segoe UI", "Yu Gothic UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = y + 16 * ratio > top + height ? "bottom" : "top";
  const label = `${detectorLimitLabel(detector)} ${edge} ${noteName(hzToMidi(hz, a4))}`;
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

  draw(points: PitchPoint[], now: number, frame: GraphFrame = {}): void {
    const layout = paintPitchTimeAxes(this.ctx, this.canvas.width, this.canvas.height, now, this.a4, frame);
    const { ctx } = this;
    const { ratio, plotLeft, plotTop, plotWidth, plotHeight, midiHigh } = layout;
    ctx.lineWidth = 2.4 * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const voice of pitchVoices(points, now, this.a4)) {
      ctx.beginPath();
      ctx.strokeStyle = traceColor(voice.detector, voice.provisional);
      const first = voice.points[0];
      ctx.moveTo(pitchTimeX(first.time, now, plotLeft, plotWidth), pitchY(first.midi, midiHigh, plotTop, plotHeight, true));
      for (let i = 1; i < voice.points.length; i++) {
        const point = voice.points[i];
        ctx.lineTo(
          pitchTimeX(point.time, now, plotLeft, plotWidth),
          pitchY(point.midi, midiHigh, plotTop, plotHeight, true),
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
