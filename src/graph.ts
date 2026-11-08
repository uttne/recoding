import { hzToMidi, noteName } from "./audio/notes";
import type { DetectorId, PitchPoint } from "./audio/engine";

const MIDI_LOW = 30;
const MIDI_HIGH = 108;
const WINDOW_SECONDS = 8;
const GUTTER = 56;

const COLOR: Record<DetectorId, string> = {
  acf2: "#e6a15c",
  swiftf0: "#7ed0cb",
  mpm: "#e6d36a",
  pyin: "#c792ea",
  crepe: "#8eb6f0",
  "basic-mono": "#f0a0b4",
  "basic-poly": "#e07a6a",
};

const LIMIT_LABEL: Record<DetectorId, string> = {
  acf2: "ACF2+",
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

export class PitchGraph {
  private readonly ctx: CanvasRenderingContext2D;
  private a4 = 440;
  private midiHigh = MIDI_HIGH;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas を初期化できません");
    this.ctx = ctx;
  }

  setA4(a4: number): void {
    this.a4 = a4;
  }

  resize(): void {
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(width * ratio));
    this.canvas.height = Math.max(1, Math.floor(height * ratio));
  }

  draw(points: PitchPoint[], now: number, frame: GraphFrame = {}): void {
    const pendingFrom = frame.pendingFrom ?? null;
    const ranges = frame.ranges;
    const tops = ranges ? Object.values(ranges.byDetector).map((range) => hzToMidi(range.fmax, this.a4)) : [];
    this.midiHigh = Math.max(MIDI_HIGH, ...tops.map((midi) => Math.ceil(midi + 1)));
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#211c17";
    ctx.fillRect(0, 0, width, height);

    const ratio = window.devicePixelRatio || 1;
    const gutter = GUTTER * ratio;
    const plotLeft = gutter;
    const plotWidth = width - gutter - 12 * ratio;
    const plotTop = 16 * ratio;
    const plotHeight = height - 28 * ratio;

    ctx.font = `${12 * ratio}px "Segoe UI", "Yu Gothic UI", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;

    for (let midi = MIDI_LOW; midi <= this.midiHigh; midi++) {
      const y = this.yAt(midi, plotTop, plotHeight);
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
      const start = now - WINDOW_SECONDS;
      const xFor = (time: number) => plotLeft + ((time - start) / WINDOW_SECONDS) * plotWidth;
      const x0 = Math.max(plotLeft, Math.min(plotLeft + plotWidth, xFor(pendingFrom)));
      const x1 = plotLeft + plotWidth;
      if (x1 > x0) {
        ctx.save();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = COLOR[ranges.active];
        ctx.fillRect(x0, plotTop, x1 - x0, plotHeight);
        ctx.restore();
      }
    }

    if (ranges) {
      const active = ranges.byDetector[ranges.active];
      this.shadeOutside(active, plotLeft, plotTop, plotWidth, plotHeight);
      this.drawLimit(active.fmin, ranges.active, "下限", "left", plotLeft, plotTop, plotWidth, plotHeight, ratio);
      this.drawLimit(active.fmax, ranges.active, "上限", "right", plotLeft, plotTop, plotWidth, plotHeight, ratio);
    }

    const visible = points
      .filter((point) => now - point.time <= WINDOW_SECONDS && point.time <= now)
      .sort((a, b) => a.time - b.time);
    ctx.lineWidth = 2.4 * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    this.drawVoices(visible, now, plotLeft, plotTop, plotWidth, plotHeight);

    const playhead = plotLeft + plotWidth;
    ctx.strokeStyle = "rgba(243,234,215,0.35)";
    ctx.lineWidth = ratio;
    ctx.beginPath();
    ctx.moveTo(playhead, plotTop);
    ctx.lineTo(playhead, plotTop + plotHeight);
    ctx.stroke();
  }

  private drawVoices(
    visible: PitchPoint[],
    now: number,
    plotLeft: number,
    plotTop: number,
    plotWidth: number,
    plotHeight: number,
  ): void {
    const maxGap = (0.05 / WINDOW_SECONDS) * plotWidth;
    type Line = { detector: DetectorId; xs: number[]; ys: number[] };
    type Open = { x: number; midi: number; detector: DetectorId; line: Line };
    const lines: Line[] = [];
    let open: Open[] = [];
    for (const point of visible) {
      const freqs = point.pitches?.length ? point.pitches.map((pitch) => pitch.hz) : point.hz == null ? [] : [point.hz];
      const x = plotLeft + ((point.time - (now - WINDOW_SECONDS)) / WINDOW_SECONDS) * plotWidth;
      if (freqs.length === 0) {
        open = [];
        continue;
      }
      const limit = point.detector === "basic-mono" || point.detector === "basic-poly" ? 0.75 : 0.5;
      const used = new Set<number>();
      const next: Open[] = [];
      for (const hz of freqs) {
        const midi = hzToMidi(hz, this.a4);
        let best = -1;
        let bestDist = limit;
        for (let i = 0; i < open.length; i++) {
          if (used.has(i) || open[i].detector !== point.detector || x - open[i].x > maxGap) continue;
          const dist = Math.abs(midi - open[i].midi);
          if (dist <= bestDist) {
            best = i;
            bestDist = dist;
          }
        }
        const y = this.yAt(midi, plotTop, plotHeight);
        if (best >= 0) {
          used.add(best);
          const line = open[best].line;
          line.xs.push(x);
          line.ys.push(y);
          next.push({ x, midi, detector: point.detector, line });
        } else {
          const line: Line = { detector: point.detector, xs: [x], ys: [y] };
          lines.push(line);
          next.push({ x, midi, detector: point.detector, line });
        }
      }
      open = next;
    }
    const { ctx } = this;
    for (const line of lines) {
      ctx.beginPath();
      ctx.strokeStyle = COLOR[line.detector];
      ctx.moveTo(line.xs[0], line.ys[0]);
      for (let i = 1; i < line.xs.length; i++) ctx.lineTo(line.xs[i], line.ys[i]);
      ctx.stroke();
    }
  }

  private shadeOutside(range: FrequencyRange, left: number, top: number, width: number, height: number): void {
    const yMax = this.yUnclamped(hzToMidi(range.fmax, this.a4), top, height);
    const yMin = this.yUnclamped(hzToMidi(range.fmin, this.a4), top, height);
    const bottom = top + height;
    this.ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
    if (yMax > top) {
      const edge = Math.min(yMax, bottom);
      this.ctx.fillRect(left, top, width, edge - top);
    }
    if (yMin < bottom) {
      const edge = Math.max(yMin, top);
      this.ctx.fillRect(left, edge, width, bottom - edge);
    }
  }

  private drawLimit(
    hz: number,
    detector: DetectorId,
    edge: "下限" | "上限",
    align: "left" | "right",
    left: number,
    top: number,
    width: number,
    height: number,
    ratio: number,
  ): void {
    const y = this.yUnclamped(hzToMidi(hz, this.a4), top, height);
    if (y < top || y > top + height) return;
    const { ctx } = this;
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
    const label = `${LIMIT_LABEL[detector]} ${edge} ${noteName(hzToMidi(hz, this.a4))}`;
    const x = align === "left" ? left + 10 * ratio : left + width - 10 * ratio;
    const textY = ctx.textBaseline === "top" ? y + 5 * ratio : y - 5 * ratio;
    ctx.fillText(label, x, textY);
    ctx.restore();
  }

  private yUnclamped(midi: number, top: number, height: number): number {
    const span = this.midiHigh - MIDI_LOW;
    return top + ((this.midiHigh - midi) / span) * height;
  }

  private yAt(midi: number, top: number, height: number): number {
    const clamped = Math.min(this.midiHigh, Math.max(MIDI_LOW, midi));
    return this.yUnclamped(clamped, top, height);
  }
}
