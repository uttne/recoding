import "./style.css";
import { reviseHybrid } from "./audio/acf-basic";
import { ACF_FMAX_HZ, ACF_FMIN_HZ } from "./audio/acf2";
import { BASIC_FMAX_HZ, BASIC_FMIN_HZ } from "./audio/basicpitch";
import { CREPE_FMAX_HZ, CREPE_FMIN_HZ } from "./audio/crepe";
import { renderDownload } from "./audio/download";
import type { AudioFormat } from "./audio/encode";
import { PitchEngine, type DetectorId, type PitchPoint } from "./audio/engine";
import { int16ToFloat } from "./audio/pcm";
import { decodeWav } from "./audio/wav";
import { MPM_FMAX_HZ, MPM_FMIN_HZ } from "./audio/mpm";
import { centsOff, hzToMidi, noteName } from "./audio/notes";
import { PYIN_FMAX_HZ, PYIN_FMIN_HZ } from "./audio/pyin";
import { SWIFT_FMAX, SWIFT_FMIN } from "./audio/swiftf0";
import { PitchGraph, WINDOW_SECONDS, type FrequencyRange, type GraphRanges } from "./graph";
import { LoudnessGraph } from "./loudness-graph";
import type { LevelSample } from "./loudness";
import { deleteRecording, listRecordings, readRecording, saveRecording, type RecordingFile } from "./recordings";
import { RibbonGraph } from "./ribbon-graph";

const toggle = document.querySelector<HTMLButtonElement>("#toggle")!;
const recordButton = document.querySelector<HTMLButtonElement>("#record")!;
const status = document.querySelector<HTMLParagraphElement>("#status")!;
const note = document.querySelector<HTMLDivElement>("#note")!;
const hzLabel = document.querySelector<HTMLSpanElement>("#hz")!;
const centsLabel = document.querySelector<HTMLSpanElement>("#cents")!;
const confidenceLabel = document.querySelector<HTMLSpanElement>("#confidence")!;
const level = document.querySelector<HTMLSpanElement>("#level")!;
const canvas = document.querySelector<HTMLCanvasElement>("#graph")!;
const loudnessCanvas = document.querySelector<HTMLCanvasElement>("#loudness")!;
const ribbonCanvas = document.querySelector<HTMLCanvasElement>("#ribbon")!;
const a4Input = document.querySelector<HTMLInputElement>("#a4")!;
const csvButton = document.querySelector<HTMLButtonElement>("#csv")!;
const clearButton = document.querySelector<HTMLButtonElement>("#clear")!;
const playButton = document.querySelector<HTMLButtonElement>("#play")!;
const downloadButton = document.querySelector<HTMLButtonElement>("#download")!;
const removeButton = document.querySelector<HTMLButtonElement>("#remove")!;
const formatSelect = document.querySelector<HTMLSelectElement>("#audio-format")!;
const recordingsList = document.querySelector<HTMLUListElement>("#recordings")!;
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
const ribbon = new RibbonGraph(ribbonCanvas);
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
    refreshLibrary();
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
  ribbon.draw(points, levels, now, frame);
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

let selectedId: string | null = null;
let playingId: string | null = null;
let storing = false;
let armingMic = false;
let armingRecord = false;
let startingPlayback = false;
let downloading = false;

function formatDuration(frames: number, sampleRate: number): string {
  const total = Math.max(0, Math.round(frames / Math.max(1, sampleRate)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function selectedFormat(): AudioFormat {
  if (formatSelect.value === "flac" || formatSelect.value === "mp3") return formatSelect.value;
  return "wav";
}

function refreshLibrary(): void {
  const playing = engine.mode === "file";
  const recording = engine.recording;
  if (!playing && !startingPlayback) playingId = null;
  const busy = storing || armingMic || armingRecord;
  toggle.disabled = busy || recording;
  toggle.textContent = engine.mode === "mic" ? "停止" : "マイクを開始";
  toggle.dataset.live = engine.mode === "mic" ? "true" : "false";
  recordButton.disabled = busy || startingPlayback;
  recordButton.textContent = recording ? "録音を停止" : "録音を開始";
  recordButton.dataset.live = recording ? "true" : "false";
  recordButton.setAttribute("aria-pressed", String(recording));
  playButton.disabled = storing || startingPlayback || (!playing && (engine.mode === "mic" || selectedId == null));
  playButton.textContent = playing ? "停止" : "再生";
  playButton.dataset.live = playing ? "true" : "false";
  downloadButton.disabled = downloading || selectedId == null;
  removeButton.disabled = storing || selectedId == null;
  for (const button of recordingsList.querySelectorAll("button")) {
    if (button.dataset.id === playingId) button.dataset.playing = "true";
    else delete button.dataset.playing;
  }
}

function renderRecordings(files: readonly RecordingFile[]): void {
  recordingsList.replaceChildren();
  if (selectedId && !files.some((file) => file.id === selectedId)) selectedId = null;
  if (files.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "録音はまだありません。録音を停止するとここに残ります。";
    recordingsList.append(item);
    refreshLibrary();
    return;
  }
  for (const file of files) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.id = file.id;
    button.setAttribute("aria-pressed", String(file.id === selectedId));
    if (file.id === playingId) button.dataset.playing = "true";
    const name = document.createElement("span");
    name.className = "recording-name";
    name.textContent = file.name;
    const length = document.createElement("span");
    length.className = "recording-length";
    length.textContent = formatDuration(file.frames, file.sampleRate);
    button.append(name, length);
    button.addEventListener("click", () => {
      selectedId = file.id;
      for (const other of recordingsList.querySelectorAll("button")) {
        other.setAttribute("aria-pressed", String(other.dataset.id === selectedId));
      }
      refreshLibrary();
    });
    item.append(button);
    recordingsList.append(item);
  }
  refreshLibrary();
}

async function reloadRecordings(): Promise<void> {
  renderRecordings(await listRecordings());
}

async function storeCapture(captured: { samples: Float32Array; sampleRate: number } | null): Promise<void> {
  if (!captured || captured.samples.length === 0) {
    status.textContent = engine.mode === "mic" ? "マイクを聞いています" : "録音する音がありませんでした";
    refreshLibrary();
    return;
  }
  storing = true;
  refreshLibrary();
  status.textContent = "録音を保存しています";
  try {
    const file = await saveRecording(captured.samples, captured.sampleRate);
    selectedId = file.id;
    await reloadRecordings();
    status.textContent = "録音を保存しました";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `録音を保存できませんでした: ${message}`;
  } finally {
    storing = false;
    refreshLibrary();
  }
}

function resetReadout(): void {
  note.classList.remove("chord");
  note.textContent = "–";
  hzLabel.textContent = "— Hz";
  centsLabel.textContent = "— cent";
  confidenceLabel.textContent = "—";
}

function downloadBytes(bytes: Uint8Array, filename: string, mime: string): void {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

toggle.addEventListener("click", async () => {
  if (storing || armingMic || armingRecord || engine.recording) return;
  if (engine.mode === "mic") {
    engine.stop();
    refreshLibrary();
    return;
  }
  armingMic = true;
  toggle.disabled = true;
  try {
    if (engine.mode === "file") engine.stop();
    await engine.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `マイクを開始できませんでした: ${message}`;
  } finally {
    armingMic = false;
    refreshLibrary();
  }
});

recordButton.addEventListener("click", async () => {
  if (storing || armingMic || armingRecord || startingPlayback) return;
  if (engine.recording) {
    await storeCapture(engine.takeRecording());
    return;
  }
  armingRecord = true;
  recordButton.disabled = true;
  try {
    if (engine.mode === "file") engine.stop();
    if (engine.mode !== "mic") await engine.start();
    engine.startRecording();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `録音を開始できませんでした: ${message}`;
  } finally {
    armingRecord = false;
    refreshLibrary();
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
  ribbon.setA4(a4);
});

clearButton.addEventListener("click", () => {
  points.length = 0;
  confirmed.clear();
  csvButton.disabled = true;
  resetReadout();
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

playButton.addEventListener("click", async () => {
  if (startingPlayback || storing) return;
  if (engine.mode === "file") {
    engine.stop();
    refreshLibrary();
    return;
  }
  if (!selectedId || engine.mode === "mic") return;
  const id = selectedId;
  const stored = await readRecording(id);
  if (!stored) {
    status.textContent = "録音が見つかりません";
    await reloadRecordings();
    return;
  }
  let decoded: { pcm: Int16Array; sampleRate: number };
  try {
    decoded = decodeWav(stored.wav);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `再生できませんでした: ${message}`;
    return;
  }
  startingPlayback = true;
  playingId = id;
  refreshLibrary();
  points.length = 0;
  levels.length = 0;
  confirmed.clear();
  csvButton.disabled = true;
  resetReadout();
  clock = 0;
  engagedAt = 0;
  try {
    await engine.play(int16ToFloat(decoded.pcm), decoded.sampleRate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `再生できませんでした: ${message}`;
  } finally {
    startingPlayback = false;
    refreshLibrary();
  }
});

downloadButton.addEventListener("click", async () => {
  if (!selectedId || downloading) return;
  const id = selectedId;
  const format = selectedFormat();
  downloading = true;
  refreshLibrary();
  status.textContent = "変換しています";
  try {
    const stored = await readRecording(id);
    if (!stored) {
      status.textContent = "録音が見つかりません";
      await reloadRecordings();
      return;
    }
    const decoded = decodeWav(stored.wav);
    const bytes = await renderDownload(format, decoded.pcm, decoded.sampleRate);
    const mime = format === "mp3" ? "audio/mpeg" : format === "flac" ? "audio/flac" : "audio/wav";
    downloadBytes(bytes, `${stored.name}.${format}`, mime);
    status.textContent = "ダウンロードしました";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `ダウンロードできませんでした: ${message}`;
  } finally {
    downloading = false;
    refreshLibrary();
  }
});

removeButton.addEventListener("click", async () => {
  if (!selectedId || storing) return;
  const id = selectedId;
  if (!window.confirm("この録音を削除しますか？")) return;
  try {
    if (playingId === id && engine.mode === "file") engine.stop();
    await deleteRecording(id);
    if (selectedId === id) selectedId = null;
    await reloadRecordings();
    status.textContent = "録音を削除しました";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    status.textContent = `削除できませんでした: ${message}`;
  }
});

applyCeilings();
graph.resize();
loudness.resize();
ribbon.resize();
window.addEventListener("resize", () => {
  graph.resize();
  loudness.resize();
  ribbon.resize();
});
engine.preloadModel();
void reloadRecordings().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  status.textContent = `保存した録音を読めませんでした: ${message}`;
});
requestAnimationFrame(paint);
