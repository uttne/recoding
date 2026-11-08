import { hzToMidi } from "./audio/notes";
import type { DetectorId, PitchPoint } from "./audio/engine";

const MIDI_LOW = 30;
const MIDI_HIGH = 108;
const WINDOW_SECONDS = 8;
const GUTTER = 56;

const COLOR: Record<DetectorId, string> = {
  acf2: "#e6a15c",
  swiftf0: "#7ed0cb",
};

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
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(width * ratio));
    this.canvas.height = Math.max(1, Math.floor(height * ratio));
  }

  draw(points: PitchPoint[], now: number): void {
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

    for (let midi = MIDI_LOW; midi <= MIDI_HIGH; midi++) {
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

    const visible = points
      .filter((point) => now - point.time <= WINDOW_SECONDS && point.time <= now)
      .sort((a, b) => a.time - b.time);
    ctx.lineWidth = 2.4 * ratio;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    let penDown = false;
    let previous: { x: number; midi: number; detector: DetectorId } | null = null;
    for (const point of visible) {
      if (point.hz == null) {
        if (penDown) ctx.stroke();
        penDown = false;
        previous = null;
        continue;
      }
      const midi = hzToMidi(point.hz, this.a4);
      const x = plotLeft + ((point.time - (now - WINDOW_SECONDS)) / WINDOW_SECONDS) * plotWidth;
      const y = this.yAt(midi, plotTop, plotHeight);
      const jump = previous != null && Math.abs(midi - previous.midi) > 0.5;
      const gap = previous != null && x - previous.x > (0.05 / WINDOW_SECONDS) * plotWidth;
      const switched = previous != null && previous.detector !== point.detector;
      if (!penDown || jump || gap || switched) {
        if (penDown) ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = COLOR[point.detector];
        ctx.moveTo(x, y);
        penDown = true;
      } else {
        ctx.lineTo(x, y);
      }
      previous = { x, midi, detector: point.detector };
    }
    if (penDown) ctx.stroke();

    const playhead = plotLeft + plotWidth;
    ctx.strokeStyle = "rgba(243,234,215,0.35)";
    ctx.lineWidth = ratio;
    ctx.beginPath();
    ctx.moveTo(playhead, plotTop);
    ctx.lineTo(playhead, plotTop + plotHeight);
    ctx.stroke();
  }

  private yAt(midi: number, top: number, height: number): number {
    const clamped = Math.min(MIDI_HIGH, Math.max(MIDI_LOW, midi));
    const span = MIDI_HIGH - MIDI_LOW;
    return top + ((MIDI_HIGH - clamped) / span) * height;
  }
}
