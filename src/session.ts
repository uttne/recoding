import { reviseHybrid } from "./audio/acf-basic";
import { ACF_FMAX_HZ, ACF_FMIN_HZ } from "./audio/acf2";
import { BASIC_FMAX_HZ, BASIC_FMIN_HZ } from "./audio/basicpitch";
import { CREPE_FMAX_HZ, CREPE_FMIN_HZ } from "./audio/crepe";
import { renderDownload } from "./audio/download";
import type { AudioFormat } from "./audio/encode";
import { PitchEngine, type DetectorId, type PitchPoint } from "./audio/engine";
import { int16ToFloat } from "./audio/pcm";
import { MPM_FMAX_HZ, MPM_FMIN_HZ } from "./audio/mpm";
import { centsOff, hzToMidi, noteName } from "./audio/notes";
import { PYIN_FMAX_HZ, PYIN_FMIN_HZ } from "./audio/pyin";
import { SWIFT_FMAX, SWIFT_FMIN } from "./audio/swiftf0";
import { decodeWav } from "./audio/wav";
import { PitchGraph, WINDOW_SECONDS, type FrequencyRange, type GraphRanges } from "./graph";
import { LoudnessGraph } from "./loudness-graph";
import type { LevelSample } from "./loudness";
import { deleteRecording, listRecordings, readRecording, saveRecording, type RecordingFile } from "./recordings";
import { RibbonGraph } from "./ribbon-graph";

export type ViewId = "pitch" | "ribbon" | "loudness";
export type CeilingId = Exclude<DetectorId, "acf-basic" | "basic-poly">;

export const DETECTORS: { id: DetectorId; label: string }[] = [
  { id: "acf-basic", label: "ACF2+ → Basic" },
  { id: "acf2", label: "ACF2+" },
  { id: "mpm", label: "MPM" },
  { id: "pyin", label: "pYIN" },
  { id: "swiftf0", label: "SwiftF0" },
  { id: "crepe", label: "Tiny-CREPE" },
  { id: "basic-mono", label: "Basic Pitch 単音" },
  { id: "basic-poly", label: "Basic Pitch 重音" },
];

export const CEILING_FIELDS: { id: CeilingId; label: string; min: number; max: number }[] = [
  { id: "acf2", label: "ACF2+", min: 100, max: 8000 },
  { id: "swiftf0", label: "SwiftF0", min: 100, max: 8000 },
  { id: "mpm", label: "MPM", min: 100, max: 8000 },
  { id: "pyin", label: "pYIN", min: 100, max: 8000 },
  { id: "crepe", label: "Tiny-CREPE", min: 100, max: 2100 },
  { id: "basic-mono", label: "Basic Pitch", min: 100, max: 4500 },
];

export type Snapshot = {
  status: string;
  note: string;
  hz: string;
  cents: string;
  confidence: string;
  chord: boolean;
  mode: "idle" | "mic" | "file";
  recording: boolean;
  micDisabled: boolean;
  micLabel: string;
  recordDisabled: boolean;
  recordLabel: string;
  playDisabled: boolean;
  playLabel: string;
  files: readonly RecordingFile[];
  selectedId: string | null;
  playingId: string | null;
  selectedName: string;
  selectedLength: string;
  canStep: boolean;
  downloading: boolean;
  downloadDisabled: boolean;
  removeDisabled: boolean;
  format: AudioFormat;
  detector: DetectorId;
  a4: number;
  ceilings: Record<CeilingId, number>;
  view: ViewId;
  distinguish: boolean;
  guides: boolean;
  pending: boolean;
  csvDisabled: boolean;
};

const LAGGING = new Set<DetectorId>(["acf-basic", "swiftf0", "pyin", "crepe", "basic-mono", "basic-poly"]);
const SCORED = new Set<DetectorId>(["swiftf0", "mpm", "pyin", "crepe", "basic-mono", "basic-poly"]);

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

const points: PitchPoint[] = [];
const levels: LevelSample[] = [];
const confirmed = new Map<DetectorId, number>();
let clock = 0;
let engagedAt = 0;
let a4 = 440;
let view: ViewId = "pitch";
let distinguish = false;
let guides = true;
let pending = false;
let selectedId: string | null = null;
let playingId: string | null = null;
let storing = false;
let armingMic = false;
let armingRecord = false;
let startingPlayback = false;
let downloading = false;
let files: RecordingFile[] = [];
let format: AudioFormat = "wav";
let note = "–";
let hzLabel = "— Hz";
let centsLabel = "— cent";
let confidenceLabel = "—";
let chord = false;
let statusText = "マイクを開始すると、音程が右から流れます。";
let meter: HTMLElement | null = null;

const listeners = new Set<() => void>();

function formatDuration(frames: number, sampleRate: number): string {
  const total = Math.max(0, Math.round(frames / Math.max(1, sampleRate)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function selectedFile(): RecordingFile | undefined {
  return files.find((file) => file.id === selectedId);
}

function build(): Snapshot {
  const playing = engine.mode === "file";
  const recording = engine.recording;
  const busy = storing || armingMic || armingRecord;
  const selected = selectedFile();
  return {
    status: statusText,
    note,
    hz: hzLabel,
    cents: centsLabel,
    confidence: confidenceLabel,
    chord,
    mode: engine.mode,
    recording,
    micDisabled: busy || recording,
    micLabel: engine.mode === "mic" ? "マイクを停止" : "マイクを開始",
    recordDisabled: busy || startingPlayback,
    recordLabel: recording ? "録音を停止" : "録音を開始",
    playDisabled: storing || startingPlayback || (!playing && (engine.mode === "mic" || selectedId == null)),
    playLabel: playing ? "再生を停止" : "再生",
    files,
    selectedId,
    playingId: playing ? playingId : null,
    selectedName: selected?.name ?? "録音はまだありません",
    selectedLength: selected ? formatDuration(selected.frames, selected.sampleRate) : "",
    canStep: files.length > 1,
    downloading,
    downloadDisabled: downloading || selectedId == null,
    removeDisabled: storing || selectedId == null,
    format,
    detector: engine.detector,
    a4,
    ceilings: {
      acf2: ceilings.acf2,
      swiftf0: ceilings.swiftf0,
      mpm: ceilings.mpm,
      pyin: ceilings.pyin,
      crepe: ceilings.crepe,
      "basic-mono": ceilings["basic-mono"],
    },
    view,
    distinguish,
    guides,
    pending,
    csvDisabled: points.length === 0,
  };
}

let snapshot: Snapshot = {
  status: statusText,
  note,
  hz: hzLabel,
  cents: centsLabel,
  confidence: confidenceLabel,
  chord,
  mode: "idle" as const,
  recording: false,
  micDisabled: false,
  micLabel: "マイクを開始",
  recordDisabled: false,
  recordLabel: "録音を開始",
  playDisabled: true,
  playLabel: "再生",
  files: [] as readonly RecordingFile[],
  selectedId: null,
  playingId: null,
  selectedName: "録音はまだありません",
  selectedLength: "",
  canStep: false,
  downloading: false,
  downloadDisabled: true,
  removeDisabled: true,
  format,
  detector: "acf-basic" as DetectorId,
  a4,
  ceilings: {
    acf2: ceilings.acf2,
    swiftf0: ceilings.swiftf0,
    mpm: ceilings.mpm,
    pyin: ceilings.pyin,
    crepe: ceilings.crepe,
    "basic-mono": ceilings["basic-mono"],
  },
  view,
  distinguish,
  guides,
  pending,
  csvDisabled: true,
};

function publish(): void {
  if (engine.mode !== "file" && !startingPlayback) playingId = null;
  snapshot = build();
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Snapshot {
  return snapshot;
}

function trimPoints(): void {
  if (points.length > 200_000) points.splice(0, points.length - 180_000);
}

function updateReadout(point: PitchPoint): void {
  chord = point.pitches != null && point.pitches.length > 1;
  if (point.hz == null) {
    note = "–";
    hzLabel = "— Hz";
    centsLabel = "— cent";
    confidenceLabel = SCORED.has(point.detector) ? `信頼度 ${point.confidence.toFixed(2)}` : "無音";
    return;
  }
  if (chord && point.pitches) {
    note = point.pitches.map((pitch) => noteName(hzToMidi(pitch.hz, a4))).join(" ");
    hzLabel = `${point.pitches.map((pitch) => pitch.hz.toFixed(0)).join(" · ")} Hz`;
    centsLabel = `${point.pitches.length} 音`;
  } else {
    const midi = hzToMidi(point.hz, a4);
    const cents = centsOff(midi);
    note = noteName(midi);
    hzLabel = `${point.hz.toFixed(1)} Hz`;
    centsLabel = `${cents > 0 ? "+" : ""}${cents} cent`;
  }
  confidenceLabel = SCORED.has(point.detector) ? `信頼度 ${point.confidence.toFixed(2)}` : "有音";
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

function resetReadout(): void {
  chord = false;
  note = "–";
  hzLabel = "— Hz";
  centsLabel = "— cent";
  confidenceLabel = "—";
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

const engine = new PitchEngine({
  onPoint(point) {
    points.push(point);
    if (!(point.detector === "acf-basic" && point.provisional)) confirmed.set(point.detector, point.time);
    trimPoints();
    updateReadout(point);
    publish();
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
    publish();
  },
  onClock(time) {
    clock = time;
  },
  onLevel(rms) {
    if (meter) meter.style.transform = `scaleX(${Math.min(1, rms * 2.8)})`;
    levels.push({ time: clock, rms });
    const cutoff = clock - WINDOW_SECONDS - 1;
    let drop = 0;
    while (drop < levels.length && levels[drop].time < cutoff) drop++;
    if (drop > 0) levels.splice(0, drop);
  },
  onStatus(message) {
    statusText = message;
    publish();
  },
});

async function reloadRecordings(): Promise<void> {
  files = await listRecordings();
  if (selectedId && !files.some((file) => file.id === selectedId)) selectedId = null;
  publish();
}

async function storeCapture(captured: { samples: Float32Array; sampleRate: number } | null): Promise<void> {
  if (!captured || captured.samples.length === 0) {
    statusText = engine.mode === "mic" ? "マイクを聞いています" : "録音する音がありませんでした";
    publish();
    return;
  }
  storing = true;
  publish();
  statusText = "録音を保存しています";
  publish();
  try {
    const file = await saveRecording(captured.samples, captured.sampleRate);
    selectedId = file.id;
    await reloadRecordings();
    statusText = "録音を保存しました";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `録音を保存できませんでした: ${message}`;
  } finally {
    storing = false;
    publish();
  }
}

export function bindMeter(element: HTMLElement | null): void {
  meter = element;
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
    const now = Math.max(clock, points.at(-1)?.time ?? 0);
    const graphFrame = {
      pendingFrom: pending ? pendingFrom() : null,
      ranges: ranges(),
      style: { distinguish, guides, pending },
    };
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

export async function toggleMic(): Promise<void> {
  if (storing || armingMic || armingRecord || engine.recording) return;
  if (engine.mode === "mic") {
    engine.stop();
    publish();
    return;
  }
  armingMic = true;
  publish();
  try {
    if (engine.mode === "file") engine.stop();
    await engine.start();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `マイクを開始できませんでした: ${message}`;
  } finally {
    armingMic = false;
    publish();
  }
}

export async function toggleRecord(): Promise<void> {
  if (storing || armingMic || armingRecord || startingPlayback) return;
  if (engine.recording) {
    await storeCapture(engine.takeRecording());
    return;
  }
  armingRecord = true;
  publish();
  try {
    if (engine.mode === "file") engine.stop();
    if (engine.mode !== "mic") await engine.start();
    engine.startRecording();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `録音を開始できませんでした: ${message}`;
  } finally {
    armingRecord = false;
    publish();
  }
}

export function selectRecording(id: string): void {
  if (!files.some((file) => file.id === id)) return;
  selectedId = id;
  publish();
}

export function stepRecording(delta: number): void {
  if (files.length === 0) return;
  const index = Math.max(0, files.findIndex((file) => file.id === selectedId));
  selectedId = files[(index + delta + files.length) % files.length].id;
  publish();
}

export async function togglePlay(): Promise<void> {
  if (startingPlayback || storing) return;
  if (engine.mode === "file" && playingId === selectedId) {
    engine.stop();
    publish();
    return;
  }
  if (!selectedId || engine.mode === "mic") return;
  const id = selectedId;
  const stored = await readRecording(id);
  if (!stored) {
    statusText = "録音が見つかりません";
    await reloadRecordings();
    return;
  }
  let decoded: { pcm: Int16Array; sampleRate: number };
  try {
    decoded = decodeWav(stored.wav);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `再生できませんでした: ${message}`;
    publish();
    return;
  }
  if (engine.mode === "file") engine.stop();
  startingPlayback = true;
  playingId = id;
  publish();
  points.length = 0;
  levels.length = 0;
  confirmed.clear();
  resetReadout();
  clock = 0;
  engagedAt = 0;
  try {
    await engine.play(int16ToFloat(decoded.pcm), decoded.sampleRate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `再生できませんでした: ${message}`;
  } finally {
    startingPlayback = false;
    publish();
  }
}

export async function downloadSelected(): Promise<void> {
  if (!selectedId || downloading) return;
  const id = selectedId;
  const chosen = format;
  downloading = true;
  publish();
  statusText = "変換しています";
  publish();
  try {
    const stored = await readRecording(id);
    if (!stored) {
      statusText = "録音が見つかりません";
      await reloadRecordings();
      return;
    }
    const decoded = decodeWav(stored.wav);
    const bytes = await renderDownload(chosen, decoded.pcm, decoded.sampleRate);
    const mime = chosen === "mp3" ? "audio/mpeg" : chosen === "flac" ? "audio/flac" : "audio/wav";
    downloadBytes(bytes, `${stored.name}.${chosen}`, mime);
    statusText = "ダウンロードしました";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `ダウンロードできませんでした: ${message}`;
  } finally {
    downloading = false;
    publish();
  }
}

export async function removeSelected(): Promise<void> {
  if (!selectedId || storing) return;
  const id = selectedId;
  if (!window.confirm("この録音を削除しますか？")) return;
  try {
    if (playingId === id && engine.mode === "file") engine.stop();
    await deleteRecording(id);
    if (selectedId === id) selectedId = null;
    await reloadRecordings();
    statusText = "録音を削除しました";
    publish();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `削除できませんでした: ${message}`;
    publish();
  }
}

export function setView(next: ViewId): void {
  view = next;
  publish();
}

export function setFormat(next: AudioFormat): void {
  format = next;
  publish();
}

export function setDetector(next: DetectorId): void {
  engagedAt = clock;
  engine.detector = next;
  engine.preloadModel();
  publish();
}

export function setA4(next: number): void {
  if (!Number.isFinite(next) || next < 415 || next > 466) return;
  a4 = next;
  publish();
}

export function setCeiling(id: CeilingId, next: number): void {
  const field = CEILING_FIELDS.find((item) => item.id === id);
  if (!field || !Number.isFinite(next) || next < field.min || next > field.max) return;
  ceilings[id] = next;
  if (id === "basic-mono") ceilings["basic-poly"] = next;
  applyCeilings();
  publish();
}

export function setDistinguish(next: boolean): void {
  distinguish = next;
  publish();
}

export function setGuides(next: boolean): void {
  guides = next;
  publish();
}

export function setPending(next: boolean): void {
  pending = next;
  publish();
}

export function clearGraph(): void {
  points.length = 0;
  confirmed.clear();
  resetReadout();
  publish();
}

export function saveCsv(): void {
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
}

engine.detector = "acf-basic";
applyCeilings();
snapshot = build();
engine.preloadModel();
void reloadRecordings().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  statusText = `保存した録音を読めませんでした: ${message}`;
  publish();
});
