import "./style.css";
import { reviseHybrid } from "./audio/acf-basic";
import { ACF_FMAX_HZ, ACF_FMIN_HZ } from "./audio/acf2";
import { BASIC_FMAX_HZ, BASIC_FMIN_HZ } from "./audio/basicpitch";
import { CREPE_FMAX_HZ, CREPE_FMIN_HZ } from "./audio/crepe";
import { PitchEngine, type DetectorId, type PitchPoint } from "./audio/engine";
import { MPM_FMAX_HZ, MPM_FMIN_HZ } from "./audio/mpm";
import { centsOff, hzToMidi, noteName } from "./audio/notes";
import { PYIN_FMAX_HZ, PYIN_FMIN_HZ } from "./audio/pyin";
import { SWIFT_FMAX, SWIFT_FMIN } from "./audio/swiftf0";
import { PitchGraph, WINDOW_SECONDS, type FrequencyRange, type GraphRanges } from "./graph";
import { LoudnessGraph } from "./loudness-graph";
import type { LevelSample } from "./loudness";

const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const note = document.querySelector<HTMLDivElement>("#note")!;
const hzLabel = document.querySelector<HTMLSpanElement>("#hz")!;
const centsLabel = document.querySelector<HTMLSpanElement>("#cents")!;
const confidenceLabel = document.querySelector<HTMLSpanElement>("#confidence")!;
const level = document.querySelector<HTMLSpanElement>("#level")!;
const canvas = document.querySelector<HTMLCanvasElement>("#graph")!;
const loudnessCanvas = document.querySelector<HTMLCanvasElement>("#loudness")!;
const a4Input = document.querySelector<HTMLInputElement>("#a4")!;
const csvButton = document.querySelector<HTMLButtonElement>("#csv")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const detectorInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="detector"]')];

const LAGGING = new Set<DetectorId>(["acf-basic", "swiftf0", "pyin", "crepe", "basic-mono", "basic-poly"]);
const SCORED = new Set<DetectorId>(["swiftf0", "mpm", "pyin", "crepe", "basic-mono", "basic-poly"]);

type CeilingId = Exclude<DetectorId, "acf-basic">;

const limitInputs: Record<CeilingId, HTMLInputElement> = {
  acf2: document.querySelector<HTMLInputElement>("#acf-fmax")!,
  swiftf0: document.querySelector<HTMLInputElement>("#swift-fmax")!,
  mpm: document.querySelector<HTMLInputElement>("#mpm-fmax")!,
  pyin: document.querySelector<HTMLInputElement>("#pyin-fmax")!,
  crepe: document.querySelector<HTMLInputElement>("#crepe-fmax")!,
  "basic-mono": document.querySelector<HTMLInputElement>("#basic-fmax")!,
  "basic-poly": document.querySelector<HTMLInputElement>("#basic-fmax")!,
};

const floors: Record<DetectorId, number> = {
  acf2: ACF_FMIN_HZ,
  "acf-basic": BASIC_FMIN_HZ,
  swiftf0: SWIFT_FMIN,
  mpm: MPM_FMIN_HZ,
  pyin: PYIN_FMIN_HZ,
  crepe: CREPE_FMIN_HZ,
  "basic-mono": BASIC_FMIN_HZ,
  "basic-poly": BASIC_FMIN_HZ,
};

const graph = new PitchGraph(canvas);
const loudness = new LoudnessGraph(loudnessCanvas);
const points: PitchPoint[] = [];
const levels: LevelSample[] = [];
const confirmed = new Map<DetectorId, number>();
let clock = 0;
let engagedAt = 0;
let a4 = 440;

function trimPoints(): void {
  if (points.length > 200_000) points.splice(0, points.length - 180_000);
  csvButton.disabled = points.length === 0;
}

const engine = new PitchEngine({
  onPoint(point) {
    points.push(point);
    if (!(point.detector === "acf-basic" && point.provisional)) confirmed.set(point.detector, point.time);
    trimPoints();
    updateReadout(point);
  },
  onRevise(frames) {
    const basicFmax = ceilings["basic-mono"];
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
  },
  onClock(time) {
    clock = time;
  },
  onLevel(rms) {
    level.style.width = `${Math.min(100, rms * 280)}%`;
    levels.push({ time: clock, rms });
    const cutoff = clock - WINDOW_SECONDS - 1;
    let drop = 0;
    while (drop < levels.length && levels[drop].time < cutoff) drop++;
    if (drop > 0) levels.splice(0, drop);
  },
  onStatus(message) {
    status.textContent = message;
  },
});

const ceilings: Record<DetectorId, number> = {
  acf2: ACF_FMAX_HZ,
  "acf-basic": Math.max(ACF_FMAX_HZ, BASIC_FMAX_HZ),
  swiftf0: SWIFT_FMAX,
  mpm: MPM_FMAX_HZ,
  pyin: PYIN_FMAX_HZ,
  crepe: CREPE_FMAX_HZ,
  "basic-mono": BASIC_FMAX_HZ,
  "basic-poly": BASIC_FMAX_HZ,
};

function updateReadout(point: PitchPoint): void {
  const chord = point.pitches != null && point.pitches.length > 1;
  note.classList.toggle("chord", chord);
  if (point.hz == null) {
    note.textContent = "–";
    hzLabel.textContent = "— Hz";
    centsLabel.textContent = "— cent";
    confidenceLabel.textContent = SCORED.has(point.detector) ? `信頼度 ${point.confidence.toFixed(2)}` : "無音";
    return;
  }
  if (chord && point.pitches) {
    note.textContent = point.pitches.map((pitch) => noteName(hzToMidi(pitch.hz, a4))).join(" ");
    hzLabel.textContent = `${point.pitches.map((pitch) => pitch.hz.toFixed(0)).join(" · ")} Hz`;
    centsLabel.textContent = `${point.pitches.length} 音`;
  } else {
    const midi = hzToMidi(point.hz, a4);
    const cents = centsOff(midi);
    note.textContent = noteName(midi);
    hzLabel.textContent = `${point.hz.toFixed(1)} Hz`;
    centsLabel.textContent = `${cents > 0 ? "+" : ""}${cents} cent`;
  }
  confidenceLabel.textContent = SCORED.has(point.detector) ? `信頼度 ${point.confidence.toFixed(2)}` : "ACF2+";
}

function pendingFrom(): number | null {
  if (!engine.running || !LAGGING.has(engine.detector)) return null;
  const at = confirmed.get(engine.detector);
  if (at == null || at < engagedAt) return engagedAt;
  return at;
}

function ranges(): GraphRanges {
  const byDetector = {} as Record<DetectorId, FrequencyRange>;
  for (const id of Object.keys(ceilings) as DetectorId[]) {
    byDetector[id] = { fmin: floors[id], fmax: ceilings[id] };
  }
  return { active: engine.detector, byDetector };
}

function paint(): void {
  const now = Math.max(clock, points.at(-1)?.time ?? 0);
  const frame = { pendingFrom: pendingFrom(), ranges: ranges() };
  graph.draw(points, now, frame);
  loudness.draw(points, levels, now, frame);
  requestAnimationFrame(paint);
}

function commitLimit(input: HTMLInputElement, current: number): number {
  const value = Number(input.value);
  const min = Number(input.min);
  const max = Number(input.max);
  if (!Number.isFinite(value) || value < min || value > max) {
    input.value = String(Math.round(current));
    return current;
  }
  input.value = String(value);
  return value;
}

function applyCeilings(): void {
  engine.acfFmax = ceilings.acf2;
  ceilings["acf-basic"] = Math.max(ceilings.acf2, ceilings["basic-mono"]);
  engine.swiftFmax = ceilings.swiftf0;
  engine.mpmFmax = ceilings.mpm;
  engine.pyinFmax = ceilings.pyin;
  engine.crepeFmax = ceilings.crepe;
  engine.basicFmax = ceilings["basic-mono"];
  ceilings["basic-poly"] = ceilings["basic-mono"];
}

toggle.addEventListener("click", async () => {
  if (engine.running) {
    engine.stop();
    toggle.textContent = "マイクを開始";
    toggle.dataset.live = "false";
    return;
  }
  toggle.disabled = true;
  try {
    await engine.start();
    toggle.textContent = "停止";
    toggle.dataset.live = "true";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `マイクを開始できませんでした: ${message}`;
  } finally {
    toggle.disabled = false;
  }
});

for (const input of detectorInputs) {
  input.addEventListener("change", () => {
    if (!input.checked) return;
    engagedAt = clock;
    engine.detector = input.value as DetectorId;
    engine.preloadModel();
  });
}

for (const [id, input] of Object.entries(limitInputs) as [CeilingId, HTMLInputElement][]) {
  if (id === "basic-poly") continue;
  input.value = String(Math.round(ceilings[id]));
  input.addEventListener("change", () => {
    const next = commitLimit(input, ceilings[id]);
    ceilings[id] = next;
    if (id === "basic-mono") ceilings["basic-poly"] = next;
    applyCeilings();
  });
}

a4Input.addEventListener("change", () => {
  const value = Number(a4Input.value);
  if (!Number.isFinite(value) || value < 415 || value > 466) {
    a4Input.value = String(a4);
    return;
  }
  a4 = value;
  graph.setA4(a4);
  loudness.setA4(a4);
});

clearButton.addEventListener("click", () => {
  points.length = 0;
  confirmed.clear();
  csvButton.disabled = true;
  note.classList.remove("chord");
  note.textContent = "–";
  hzLabel.textContent = "— Hz";
  centsLabel.textContent = "— cent";
  confidenceLabel.textContent = "—";
});

csvButton.addEventListener("click", () => {
  const lines = ["time_s,detector,pitch_hz,midi,note,confidence,voiced"];
  for (const point of points) {
    const events = point.pitches?.length
      ? point.pitches
      : point.hz == null
        ? []
        : [{ hz: point.hz, confidence: point.confidence }];
    if (events.length === 0) {
      lines.push(`${point.time.toFixed(4)},${point.detector},,,${point.confidence.toFixed(3)},false`);
      continue;
    }
    for (const event of events) {
      const midi = hzToMidi(event.hz, a4);
      lines.push(
        [
          point.time.toFixed(4),
          point.detector,
          event.hz.toFixed(2),
          midi.toFixed(3),
          noteName(midi),
          event.confidence.toFixed(3),
          "true",
        ].join(","),
      );
    }
  }
  const blob = new Blob([`\uFEFF${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pitch.csv";
  anchor.click();
  URL.revokeObjectURL(url);
});

applyCeilings();
graph.resize();
loudness.resize();
window.addEventListener("resize", () => {
  graph.resize();
  loudness.resize();
});
engine.preloadModel();
requestAnimationFrame(paint);
