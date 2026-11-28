import type { DetectorId, PitchPoint } from "../../../audio/engine";
import { hzToMidi, noteName } from "../../../audio/notes";
import {
  MIDI_HIGH,
  MIDI_LOW,
  WINDOW_SECONDS,
  UNIFIED_PITCH_COLOR,
  detectorColor,
  detectorLimitLabel,
  pointColor,
  viewMidiHigh,
  type FrequencyRange,
  type GraphFrame,
} from "./graph";
import { scaleRole, type ScaleChoice } from "./scale";
import { DB_CEIL, DB_FLOOR, loudnessMarks, loudnessX, loudnessY, type LevelSample } from "./loudness";

function pixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
}

/**
 * Pitch on the horizontal axis, microphone loudness on the vertical axis.
 * Dots are the voiced pitches from the same 8 s window as the time graph.
 */
export class LoudnessGraph {
  private readonly ctx: CanvasRenderingContext2D;
  private a4 = 440;
  private midiLow = MIDI_LOW;
  private midiHigh = MIDI_HIGH;
  private distinguish = true;
  private scale: ScaleChoice = { kind: "chromatic" };

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas を初期化できません");
    this.ctx = ctx;
  }

  setA4(a4: number): void {
    this.a4 = a4;
  }

  resize(): void {
    const ratio = pixelRatio();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.canvas.width = Math.max(1, Math.floor(width * ratio));
    this.canvas.height = Math.max(1, Math.floor(height * ratio));
  }

  draw(points: PitchPoint[], levels: readonly LevelSample[], now: number, frame: GraphFrame = {}): void {
    const ranges = frame.ranges;
    const guides = frame.style?.guides !== false;
    this.distinguish = frame.style?.distinguish !== false;
    this.scale = frame.style?.scale ?? { kind: "chromatic" };
    const requested = frame.style?.pitchSpan;
    this.midiLow = requested && requested.high > requested.low ? requested.low : MIDI_LOW;
    this.midiHigh = requested && requested.high > requested.low ? requested.high : viewMidiHigh(ranges, this.a4);
    const { ctx, canvas } = this;
    const width = canvas.width;
    const height = canvas.height;
    const ratio = pixelRatio();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#211c17";
    ctx.fillRect(0, 0, width, height);

    const plotLeft = 48 * ratio;
    const plotTop = 16 * ratio;
    const plotWidth = width - plotLeft - 12 * ratio;
    const plotHeight = height - plotTop - 26 * ratio;

    ctx.font = `${12 * ratio}px "Segoe UI", "Yu Gothic UI", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    this.drawPitchGrid(plotLeft, plotTop, plotWidth, plotHeight, ratio);
    this.drawDbGrid(plotLeft, plotTop, plotWidth, plotHeight, ratio);

    if (ranges && guides) {
      const active = ranges.byDetector[ranges.active];
      this.shadeOutside(active, plotLeft, plotTop, plotWidth, plotHeight);
      this.drawLimit(active.fmin, ranges.active, "下限", "left", plotLeft, plotTop, plotWidth, plotHeight, ratio);
      this.drawLimit(active.fmax, ranges.active, "上限", "right", plotLeft, plotTop, plotWidth, plotHeight, ratio);
    }

    const marks = loudnessMarks(points, levels, now, WINDOW_SECONDS, frame.levelFloor);
    const newest = marks.length === 0 ? null : marks[marks.length - 1].time;
    const live = newest != null && now - newest <= 0.35;
    for (const mark of marks) {
      if (live && mark.time === newest) continue;
      const age = Math.min(1, Math.max(0, (now - mark.time) / WINDOW_SECONDS));
      this.drawDot(mark.hz, mark.db, mark.detector, mark.provisional, plotLeft, plotTop, plotWidth, plotHeight, ratio, {
        radius: 3.2,
        alpha: 0.22 + 0.78 * (1 - age),
      });
    }
    if (live && newest != null) {
      for (const mark of marks) {
        if (mark.time !== newest) continue;
        this.drawDot(mark.hz, mark.db, mark.detector, mark.provisional, plotLeft, plotTop, plotWidth, plotHeight, ratio, {
          radius: 5.6,
          alpha: 1,
          ring: true,
        });
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPitchGrid(left: number, top: number, width: number, height: number, ratio: number): void {
    const { ctx } = this;
    const bottom = top + height;
    for (let midi = Math.ceil(this.midiLow); midi <= Math.floor(this.midiHigh); midi++) {
      const x = loudnessX(midi, left, width, this.midiLow, this.midiHigh);
      const pitchClass = ((midi % 12) + 12) % 12;
      const labelAt = () => {
        ctx.textAlign = x < left + 18 * ratio ? "left" : x > left + width - 18 * ratio ? "right" : "center";
        ctx.textBaseline = "top";
      };
      if (this.scale.kind === "chromatic") {
        const isC = pitchClass === 0;
        const isNatural =
          pitchClass === 0 || pitchClass === 2 || pitchClass === 4 || pitchClass === 5 || pitchClass === 7 || pitchClass === 9 || pitchClass === 11;
        ctx.strokeStyle = isC ? "rgba(243,234,215,0.28)" : isNatural ? "rgba(243,234,215,0.12)" : "rgba(243,234,215,0.05)";
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        if (!isC) continue;
        const octave = Math.floor(midi / 12) - 1;
        ctx.fillStyle = "rgba(243,234,215,0.72)";
        labelAt();
        ctx.fillText(`C${octave}`, x, bottom + 6 * ratio);
        continue;
      }
      const role = scaleRole(pitchClass, this.scale);
      if (!role) continue;
      ctx.strokeStyle = role === "root" ? "rgba(243,234,215,0.55)" : role === "chord" ? "rgba(243,234,215,0.28)" : "rgba(243,234,215,0.12)";
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      if (role !== "root") continue;
      ctx.fillStyle = "rgba(243,234,215,0.86)";
      labelAt();
      ctx.fillText(noteName(midi), x, bottom + 6 * ratio);
    }
    ctx.textBaseline = "middle";
  }

  private drawDbGrid(left: number, top: number, width: number, height: number, ratio: number): void {
    const { ctx } = this;
    ctx.strokeStyle = "rgba(243,234,215,0.12)";
    ctx.fillStyle = "rgba(243,234,215,0.72)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let db = DB_CEIL; db >= DB_FLOOR; db -= 12) {
      const y = loudnessY(db, top, height);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + width, y);
      ctx.stroke();
      ctx.fillText(`${db}`, left - 8 * ratio, y);
    }
  }

  private shadeOutside(range: FrequencyRange, left: number, top: number, width: number, height: number): void {
    const xMin = this.xUnclamped(hzToMidi(range.fmin, this.a4), left, width);
    const xMax = this.xUnclamped(hzToMidi(range.fmax, this.a4), left, width);
    const right = left + width;
    this.ctx.fillStyle = "rgba(8, 6, 4, 0.72)";
    if (xMin > left) {
      const edge = Math.min(xMin, right);
      this.ctx.fillRect(left, top, Math.max(0, edge - left), height);
    }
    if (xMax < right) {
      const edge = Math.max(xMax, left);
      this.ctx.fillRect(edge, top, Math.max(0, right - edge), height);
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
    const x = this.xUnclamped(hzToMidi(hz, this.a4), left, width);
    if (x < left || x > left + width) return;
    const { ctx } = this;
    ctx.save();
    const color = this.distinguish ? detectorColor(detector) : UNIFIED_PITCH_COLOR;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 * ratio;
    ctx.setLineDash([7 * ratio, 5 * ratio]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, top + height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = `${12 * ratio}px "Segoe UI", "Yu Gothic UI", sans-serif`;
    ctx.textAlign = align === "left" ? "left" : "right";
    ctx.textBaseline = "top";
    const note = noteName(hzToMidi(hz, this.a4));
    const label = this.distinguish ? `${detectorLimitLabel(detector)} ${edge} ${note}` : `${edge} ${note}`;
    const textX = align === "left" ? x + 8 * ratio : x - 8 * ratio;
    ctx.fillText(label, textX, top + 6 * ratio);
    ctx.restore();
  }

  private drawDot(
    hz: number,
    db: number,
    detector: DetectorId,
    provisional: boolean,
    left: number,
    top: number,
    width: number,
    height: number,
    ratio: number,
    style: { radius: number; alpha: number; ring?: boolean },
  ): void {
    const x = loudnessX(hzToMidi(hz, this.a4), left, width, this.midiLow, this.midiHigh);
    const y = loudnessY(db, top, height);
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = style.alpha;
    ctx.beginPath();
    ctx.fillStyle = pointColor(detector, provisional, this.distinguish);
    ctx.arc(x, y, style.radius * ratio, 0, Math.PI * 2);
    ctx.fill();
    if (style.ring) {
      ctx.strokeStyle = "rgba(243,234,215,0.9)";
      ctx.lineWidth = 1.5 * ratio;
      ctx.stroke();
    }
    ctx.restore();
  }

  private xUnclamped(midi: number, left: number, width: number): number {
    const span = this.midiHigh - this.midiLow;
    return left + ((midi - this.midiLow) / span) * width;
  }
}
