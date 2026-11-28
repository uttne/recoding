import type { AudioFormat } from "../../../audio/encode";
import { PitchEngine, type DetectorId, type MicChoice, type PitchPoint } from "../../../audio/engine";
import { centsOff, hzToMidi, noteName } from "../../../audio/notes";
import { droppedByLevel } from "../../pitch/model/loudness";
import type { RecordingFile } from "../../recording/model/recordings";
import type { PitchAxisMode } from "../../pitch/model/pitch-axis";
import {
  getFiles,
  getPlayingId,
  getSelectedId,
  isDownloading,
  isStartingPlayback,
  isStoring,
  reconcilePlayingId,
  reloadRecordings,
  storeCapture,
} from "./recording";
import { bindRuntime } from "./runtime";
import {
  basicMonoCeiling,
  ceilingChoices,
  getA4,
  getAxisHigh,
  getAxisLow,
  getAxisMode,
  getAxisOctaves,
  getDistinguish,
  getFormat,
  getGuides,
  getLevelFloor,
  getMicId,
  getMics,
  getPending,
  getScaleId,
  getView,
  refreshMics,
  restoreSettings,
  setLevelFloor as storeLevelFloor,
} from "./settings";
import { clearGraphPoints, graphPoints, pitchLevelDb, pointCount, pushLevel, pushPoint, revisePoints } from "./stage";
import type { CeilingId, ViewId } from "./preferences";

export type { PitchAxisMode };
export type { CeilingId, ViewId };

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
  canStep: boolean;
  downloading: boolean;
  downloadDisabled: boolean;
  removeDisabled: boolean;
  format: AudioFormat;
  detector: DetectorId;
  a4: number;
  levelFloor: number;
  ceilings: Record<CeilingId, number>;
  view: ViewId;
  distinguish: boolean;
  guides: boolean;
  pending: boolean;
  scaleId: string;
  axisMode: PitchAxisMode;
  axisLow: number;
  axisHigh: number;
  axisOctaves: number;
  micId: string;
  mics: readonly MicChoice[];
  csvDisabled: boolean;
};

export {
  CEILING_FIELDS,
  DEFAULT_AXIS_HIGH,
  DEFAULT_AXIS_LOW,
  refreshMics,
  resetFixedAxis,
  setA4,
  setAxisHigh,
  setAxisLow,
  setAxisMode,
  setAxisOctaves,
  setCeiling,
  setDetector,
  setDistinguish,
  setFormat,
  setGuides,
  setMic,
  setPending,
  setScale,
  setView,
} from "./settings";

export { downloadSelected, removeSelected, selectRecording, stepRecording, togglePlay } from "./recording";

export { mountStage } from "./stage";

const SCORED = new Set<DetectorId>(["swiftf0", "mpm", "pyin", "crepe", "basic-mono", "basic-poly"]);

let clock = 0;
let engagedAt = 0;
let armingMic = false;
let armingRecord = false;
let lastPoint: PitchPoint | null = null;
let note = "–";
let hzLabel = "— Hz";
let centsLabel = "— cent";
let confidenceLabel = "—";
let chord = false;
let statusText = "マイクを開始すると、音程が右から流れます。";
let meter: HTMLElement | null = null;

const listeners = new Set<() => void>();
let snapshot: Snapshot | null = null;

function build(): Snapshot {
  const playing = engine.mode === "file";
  const recording = engine.recording;
  const busy = isStoring() || armingMic || armingRecord;
  const selectedId = getSelectedId();
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
    recordDisabled: busy || isStartingPlayback(),
    recordLabel: recording ? "録音を停止" : "録音を開始",
    playDisabled: isStoring() || isStartingPlayback() || (!playing && (engine.mode === "mic" || selectedId == null)),
    playLabel: playing ? "再生を停止" : "再生",
    files: getFiles(),
    selectedId,
    playingId: playing ? getPlayingId() : null,
    canStep: getFiles().length > 1,
    downloading: isDownloading(),
    downloadDisabled: isDownloading() || selectedId == null,
    removeDisabled: isStoring() || selectedId == null,
    format: getFormat(),
    detector: engine.detector,
    a4: getA4(),
    levelFloor: getLevelFloor(),
    ceilings: ceilingChoices(),
    view: getView(),
    distinguish: getDistinguish(),
    guides: getGuides(),
    pending: getPending(),
    scaleId: getScaleId(),
    axisMode: getAxisMode(),
    axisLow: getAxisLow(),
    axisHigh: getAxisHigh(),
    axisOctaves: getAxisOctaves(),
    micId: getMicId(),
    mics: getMics(),
    csvDisabled: pointCount() === 0,
  };
}

function publish(): void {
  reconcilePlayingId(engine.mode === "file");
  snapshot = build();
  for (const listener of listeners) listener();
}

function resetReadout(): void {
  lastPoint = null;
  chord = false;
  note = "–";
  hzLabel = "— Hz";
  centsLabel = "— cent";
  confidenceLabel = "—";
}

function present(point: PitchPoint): PitchPoint {
  if (!droppedByLevel(point, pitchLevelDb(point), getLevelFloor())) return point;
  return { time: point.time, hz: null, confidence: point.confidence, detector: point.detector };
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
    note = point.pitches.map((pitch) => noteName(hzToMidi(pitch.hz, getA4()))).join(" ");
    hzLabel = `${point.pitches.map((pitch) => pitch.hz.toFixed(0)).join(" · ")} Hz`;
    centsLabel = `${point.pitches.length} 音`;
  } else {
    const midi = hzToMidi(point.hz, getA4());
    const cents = centsOff(midi);
    note = noteName(midi);
    hzLabel = `${point.hz.toFixed(1)} Hz`;
    centsLabel = `${cents > 0 ? "+" : ""}${cents} cent`;
  }
  confidenceLabel = SCORED.has(point.detector) ? `信頼度 ${point.confidence.toFixed(2)}` : "有音";
}

const engine = new PitchEngine({
  onPoint(point) {
    pushPoint(point);
    lastPoint = point;
    updateReadout(present(point));
    publish();
  },
  onRevise(frames) {
    revisePoints(frames, basicMonoCeiling());
    publish();
  },
  onClock(time) {
    clock = time;
  },
  onLevel(rms) {
    if (meter) meter.style.transform = `scaleX(${Math.min(1, rms * 2.8)})`;
    pushLevel(clock, rms);
  },
  onStatus(message) {
    statusText = message;
    publish();
  },
});

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Snapshot {
  return snapshot ?? build();
}

export function bindMeter(element: HTMLElement | null): void {
  meter = element;
}

export async function toggleMic(): Promise<void> {
  if (isStoring() || armingMic || armingRecord || engine.recording) return;
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
    await refreshMics();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `マイクを開始できませんでした: ${message}`;
  } finally {
    armingMic = false;
    publish();
  }
}

export async function toggleRecord(): Promise<void> {
  if (isStoring() || armingMic || armingRecord || isStartingPlayback()) return;
  if (engine.recording) {
    await storeCapture(engine.takeRecording());
    return;
  }
  armingRecord = true;
  publish();
  try {
    if (engine.mode === "file") engine.stop();
    if (engine.mode !== "mic") {
      await engine.start();
      await refreshMics();
    }
    engine.startRecording();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    statusText = `録音を開始できませんでした: ${message}`;
  } finally {
    armingRecord = false;
    publish();
  }
}

export function clearGraph(): void {
  clearGraphPoints();
  resetReadout();
  publish();
}

export function setLevelFloor(next: number): void {
  if (!storeLevelFloor(next)) return;
  if (lastPoint) updateReadout(present(lastPoint));
  publish();
}

export function saveCsv(): void {
  const lines = ["time_s,detector,pitch_hz,midi,note,confidence,voiced"];
  const floor = getLevelFloor();
  for (const point of graphPoints()) {
    if (droppedByLevel(point, pitchLevelDb(point), floor)) continue;
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
      const midi = hzToMidi(event.hz, getA4());
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

bindRuntime({
  engine,
  publish,
  getClock: () => clock,
  setClock: (time) => {
    clock = time;
  },
  getEngagedAt: () => engagedAt,
  setEngagedAt: (time) => {
    engagedAt = time;
  },
  setStatus: (message) => {
    statusText = message;
  },
  resetReadout,
  setArmingMic: (value) => {
    armingMic = value;
  },
});
restoreSettings();
snapshot = build();
engine.preloadModel();
if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
  navigator.mediaDevices.addEventListener("devicechange", () => {
    void refreshMics();
  });
}
void refreshMics();
void reloadRecordings().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  statusText = `保存した録音を読めませんでした: ${message}`;
  publish();
});
