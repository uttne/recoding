import "./style.css";
import { PitchEngine, type DetectorId, type PitchPoint } from "./audio/engine";
import { centsOff, hzToMidi, noteName } from "./audio/notes";
import { PitchGraph } from "./graph";

const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const note = document.querySelector<HTMLDivElement>("#note")!;
const hzLabel = document.querySelector<HTMLSpanElement>("#hz")!;
const centsLabel = document.querySelector<HTMLSpanElement>("#cents")!;
const confidenceLabel = document.querySelector<HTMLSpanElement>("#confidence")!;
const level = document.querySelector<HTMLSpanElement>("#level")!;
const canvas = document.querySelector<HTMLCanvasElement>("#graph")!;
const a4Input = document.querySelector<HTMLInputElement>("#a4")!;
const csvButton = document.querySelector<HTMLButtonElement>("#csv")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const detectorInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="detector"]')];

const graph = new PitchGraph(canvas);
const points: PitchPoint[] = [];
let clock = 0;
let a4 = 440;

const engine = new PitchEngine({
  onPoint(point) {
    points.push(point);
    if (points.length > 200_000) points.splice(0, points.length - 180_000);
    csvButton.disabled = points.length === 0;
    updateReadout(point);
  },
  onClock(time) {
    clock = time;
  },
  onLevel(rms) {
    level.style.width = `${Math.min(100, rms * 280)}%`;
  },
  onStatus(message) {
    status.textContent = message;
  },
});

function updateReadout(point: PitchPoint): void {
  if (point.hz == null) {
    note.textContent = "–";
    hzLabel.textContent = "— Hz";
    centsLabel.textContent = "— cent";
    confidenceLabel.textContent = point.detector === "swiftf0" ? `信頼度 ${point.confidence.toFixed(2)}` : "無音";
    return;
  }
  const midi = hzToMidi(point.hz, a4);
  const cents = centsOff(midi);
  note.textContent = noteName(midi);
  hzLabel.textContent = `${point.hz.toFixed(1)} Hz`;
  centsLabel.textContent = `${cents > 0 ? "+" : ""}${cents} cent`;
  confidenceLabel.textContent = point.detector === "swiftf0" ? `信頼度 ${point.confidence.toFixed(2)}` : "ACF2+";
}

function paint(): void {
  graph.draw(points, Math.max(clock, points.at(-1)?.time ?? 0));
  requestAnimationFrame(paint);
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
    engine.detector = input.value as DetectorId;
    if (input.value === "swiftf0") engine.preloadModel();
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
});

clearButton.addEventListener("click", () => {
  points.length = 0;
  csvButton.disabled = true;
  note.textContent = "–";
  hzLabel.textContent = "— Hz";
  centsLabel.textContent = "— cent";
  confidenceLabel.textContent = "—";
});

csvButton.addEventListener("click", () => {
  const lines = ["time_s,detector,pitch_hz,midi,note,confidence,voiced"];
  for (const point of points) {
    if (point.hz == null) {
      lines.push(`${point.time.toFixed(4)},${point.detector},,,${point.confidence.toFixed(3)},false`);
      continue;
    }
    const midi = hzToMidi(point.hz, a4);
    lines.push(
      [
        point.time.toFixed(4),
        point.detector,
        point.hz.toFixed(2),
        midi.toFixed(3),
        noteName(midi),
        point.confidence.toFixed(3),
        "true",
      ].join(","),
    );
  }
  const blob = new Blob([`\uFEFF${lines.join("\n")}\n`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pitch.csv";
  anchor.click();
  URL.revokeObjectURL(url);
});

graph.resize();
window.addEventListener("resize", () => graph.resize());
engine.preloadModel();
requestAnimationFrame(paint);
