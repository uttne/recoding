import { renderDownload } from "../../../audio/download";
import { int16ToFloat } from "../../../audio/pcm";
import { decodeWav } from "../../../audio/wav";
import { deleteRecording, listRecordings, readRecording, saveRecording, type RecordingFile } from "../../recording/model/recordings";
import { getFormat } from "./settings";
import { clearPlaybackSeries } from "./stage";
import { sessionPorts } from "./runtime";

let selectedId: string | null = null;
let playingId: string | null = null;
let storing = false;
let startingPlayback = false;
let downloading = false;
let files: RecordingFile[] = [];

export function getFiles(): readonly RecordingFile[] {
  return files;
}

export function getSelectedId(): string | null {
  return selectedId;
}

export function getPlayingId(): string | null {
  return playingId;
}

export function isDownloading(): boolean {
  return downloading;
}

export function isStoring(): boolean {
  return storing;
}

export function isStartingPlayback(): boolean {
  return startingPlayback;
}

export function reconcilePlayingId(playingFile: boolean): void {
  if (!playingFile && !startingPlayback) playingId = null;
}

export async function reloadRecordings(): Promise<void> {
  files = await listRecordings();
  if (selectedId && !files.some((file) => file.id === selectedId)) selectedId = null;
  sessionPorts().publish();
}

export async function storeCapture(captured: { samples: Float32Array; sampleRate: number } | null): Promise<void> {
  const { engine, publish, setStatus } = sessionPorts();
  if (!captured || captured.samples.length === 0) {
    setStatus(engine.mode === "mic" ? "マイクを聞いています" : "録音する音がありませんでした");
    publish();
    return;
  }
  storing = true;
  publish();
  setStatus("録音を保存しています");
  publish();
  try {
    const file = await saveRecording(captured.samples, captured.sampleRate);
    selectedId = file.id;
    await reloadRecordings();
    setStatus("録音を保存しました");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`録音を保存できませんでした: ${message}`);
  } finally {
    storing = false;
    publish();
  }
}

export function selectRecording(id: string): void {
  if (!files.some((file) => file.id === id)) return;
  selectedId = id;
  sessionPorts().publish();
}

export function stepRecording(delta: number): void {
  if (files.length === 0) return;
  const index = Math.max(0, files.findIndex((file) => file.id === selectedId));
  selectedId = files[(index + delta + files.length) % files.length].id;
  sessionPorts().publish();
}

export async function togglePlay(): Promise<void> {
  if (startingPlayback || storing) return;
  const { engine, publish, resetReadout, setClock, setEngagedAt, setStatus } = sessionPorts();
  if (engine.mode === "file" && playingId === selectedId) {
    engine.stop();
    publish();
    return;
  }
  if (!selectedId || engine.mode === "mic") return;
  const id = selectedId;
  const stored = await readRecording(id);
  if (!stored) {
    setStatus("録音が見つかりません");
    await reloadRecordings();
    return;
  }
  let decoded: { pcm: Int16Array; sampleRate: number };
  try {
    decoded = decodeWav(stored.wav);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`再生できませんでした: ${message}`);
    publish();
    return;
  }
  if (engine.mode === "file") engine.stop();
  startingPlayback = true;
  playingId = id;
  publish();
  clearPlaybackSeries();
  resetReadout();
  setClock(0);
  setEngagedAt(0);
  try {
    await engine.play(int16ToFloat(decoded.pcm), decoded.sampleRate);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`再生できませんでした: ${message}`);
  } finally {
    startingPlayback = false;
    publish();
  }
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

export async function downloadSelected(): Promise<void> {
  if (!selectedId || downloading) return;
  const { publish, setStatus } = sessionPorts();
  const id = selectedId;
  const chosen = getFormat();
  downloading = true;
  publish();
  setStatus("変換しています");
  publish();
  try {
    const stored = await readRecording(id);
    if (!stored) {
      setStatus("録音が見つかりません");
      await reloadRecordings();
      return;
    }
    const decoded = decodeWav(stored.wav);
    const bytes = await renderDownload(chosen, decoded.pcm, decoded.sampleRate);
    const mime = chosen === "mp3" ? "audio/mpeg" : chosen === "flac" ? "audio/flac" : "audio/wav";
    downloadBytes(bytes, `${stored.name}.${chosen}`, mime);
    setStatus("ダウンロードしました");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`ダウンロードできませんでした: ${message}`);
  } finally {
    downloading = false;
    publish();
  }
}

export async function removeSelected(): Promise<void> {
  if (!selectedId || storing) return;
  const { engine, publish, setStatus } = sessionPorts();
  const id = selectedId;
  if (!window.confirm("この録音を削除しますか？")) return;
  try {
    if (playingId === id && engine.mode === "file") engine.stop();
    await deleteRecording(id);
    if (selectedId === id) selectedId = null;
    await reloadRecordings();
    setStatus("録音を削除しました");
    publish();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`削除できませんでした: ${message}`);
    publish();
  }
}
