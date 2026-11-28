import type { PitchPoint } from "./audio/engine";
import {
  paintPitchTimeAxes,
  pitchPixelRatio,
  pitchTimeX,
  pitchY,
  pointColor,
  type GraphFrame,
} from "./graph";
import type { LevelSample } from "./loudness";
import {
  CORE_PX,
  CORE_WHITE_MIX,
  HALO_LAYERS,
  densifyRibbon,
  haloAlpha,
  haloRadius,
  mixWhite,
  ribbonOffsets,
  ribbonRuns,
} from "./ribbon";

/**
 * Time on the horizontal axis and pitch on the vertical axis, matching the
 * pitch graph. Loudness is a soft halo around a thin core, not a second axis.
 */
export class RibbonGraph {
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

  draw(points: PitchPoint[], levels: readonly LevelSample[], now: number, frame: GraphFrame = {}): void {
    const distinguish = frame.style?.distinguish !== false;
    const layout = paintPitchTimeAxes(this.ctx, this.canvas.width, this.canvas.height, now, this.a4, frame);
    const { ctx } = this;
    const runs = ribbonRuns(points, levels, now, this.a4, { splitProvisional: distinguish });
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([]);
    for (const run of runs) {
      const color = pointColor(run.detector, run.provisional, distinguish);
      const plotted = densifyRibbon(run.vertices).map((vertex) => ({
        x: pitchTimeX(vertex.time, now, layout.plotLeft, layout.plotWidth),
        y: pitchY(vertex.midi, layout.midiLow, layout.midiHigh, layout.plotTop, layout.plotHeight, true),
        gain: vertex.gain,
      }));
      for (let layer = HALO_LAYERS; layer >= 1; layer--) {
        const radius = (gain: number) => haloRadius(gain, layer, HALO_LAYERS, layout.ratio);
        if (plotted.every((point) => radius(point.gain) < 0.4)) continue;
        const edges = ribbonOffsets(plotted.map((point) => ({ x: point.x, y: point.y, radius: radius(point.gain) })));
        ctx.beginPath();
        ctx.moveTo(edges.left[0].x, edges.left[0].y);
        for (let index = 1; index < edges.left.length; index++) ctx.lineTo(edges.left[index].x, edges.left[index].y);
        for (let index = edges.right.length - 1; index >= 0; index--) ctx.lineTo(edges.right[index].x, edges.right[index].y);
        ctx.closePath();
        ctx.globalAlpha = haloAlpha(run.alpha, layer);
        ctx.fillStyle = color;
        ctx.fill();
      }
      const mean = run.vertices.reduce((sum, vertex) => sum + vertex.gain, 0) / run.vertices.length;
      this.strokeCore(plotted, CORE_PX * layout.ratio, run.alpha, mixWhite(color, CORE_WHITE_MIX * mean));
    }

    const playhead = layout.plotLeft + layout.plotWidth;
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(243,234,215,0.35)";
    ctx.lineWidth = layout.ratio;
    ctx.beginPath();
    ctx.moveTo(playhead, layout.plotTop);
    ctx.lineTo(playhead, layout.plotTop + layout.plotHeight);
    ctx.stroke();
  }

  private strokeCore(points: Array<{ x: number; y: number }>, width: number, alpha: number, color: string): void {
    if (points.length < 2) return;
    const { ctx } = this;
    ctx.beginPath();
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.moveTo(points[0].x, points[0].y);
    for (let index = 1; index < points.length; index++) ctx.lineTo(points[index].x, points[index].y);
    ctx.stroke();
  }
}
