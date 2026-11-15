import type { AudioFormat, EncodeJob } from "./encode";
import { encodeWav } from "./wav";

type EncodeResponse = {
  id: number;
  bytes?: Uint8Array;
  message?: string;
};

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (bytes: Uint8Array) => void; reject: (error: Error) => void }>();

function failPending(error: Error): void {
  for (const job of pending.values()) job.reject(error);
  pending.clear();
}

function encoderWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./encode.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<EncodeResponse>) => {
    const job = pending.get(event.data.id);
    if (!job) return;
    pending.delete(event.data.id);
    if (event.data.bytes) job.resolve(event.data.bytes);
    else job.reject(new Error(event.data.message ?? "変換に失敗しました"));
  };
  created.onerror = () => {
    failPending(new Error("変換プロセスを開始できませんでした"));
    created.terminate();
    if (worker === created) worker = null;
  };
  worker = created;
  return created;
}

function encodeInWorker(format: EncodeJob["format"], pcm: Int16Array, sampleRate: number): Promise<Uint8Array> {
  const id = ++nextId;
  const copy = new Int16Array(pcm);
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    encoderWorker().postMessage({ id, format, pcm: copy, sampleRate } satisfies EncodeJob, [copy.buffer]);
  });
}

/** WAV is already PCM. FLAC and MP3 are encoded off the main thread, and on it if that worker cannot start. */
export async function renderDownload(format: AudioFormat, pcm: Int16Array, sampleRate: number): Promise<Uint8Array> {
  if (format === "wav") return encodeWav(pcm, sampleRate);
  try {
    return await encodeInWorker(format, pcm, sampleRate);
  } catch {
    const { encodeAudio } = await import("./encode");
    return encodeAudio(format, pcm, sampleRate);
  }
}
