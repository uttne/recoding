import { type SwiftInference, type SwiftWorkerResponse } from "./swiftf0";

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((error: Error) => void) | null = null;
let nextId = 0;
let lastElapsedLog = 0;

const pending = new Map<number, { resolve: (value: SwiftInference) => void; reject: (error: Error) => void }>();

function noteElapsed(elapsedMs: number): void {
  const now = performance.now();
  if (now - lastElapsedLog < 1000) return;
  lastElapsedLog = now;
  console.info(`SwiftF0 inference ${elapsedMs.toFixed(1)} ms`);
}

function rejectReady(error: Error): void {
  readyReject?.(error);
  readyResolve = null;
  readyReject = null;
  ready = null;
  for (const item of pending.values()) item.reject(error);
  pending.clear();
}

function handleMessage(message: SwiftWorkerResponse): void {
  if (message.type === "ready") {
    readyResolve?.();
    readyResolve = null;
    readyReject = null;
    return;
  }
  if (message.type === "result") {
    const item = pending.get(message.id);
    pending.delete(message.id);
    noteElapsed(message.elapsedMs);
    item?.resolve({ pitch: message.pitch, confidence: message.confidence });
    return;
  }
  const error = new Error(message.message);
  if (message.id != null) {
    const item = pending.get(message.id);
    pending.delete(message.id);
    item?.reject(error);
    return;
  }
  rejectReady(error);
}

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./swiftf0.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<SwiftWorkerResponse>) => {
    handleMessage(event.data);
  };
  created.onerror = (event) => {
    rejectReady(new Error(event.message || "SwiftF0 のワーカーを開始できませんでした"));
  };
  worker = created;
  return created;
}

export function loadSwiftSession(): Promise<void> {
  if (ready) return ready;
  const pendingReady = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });
  ready = pendingReady;
  pendingReady.catch(() => {
    if (ready === pendingReady) ready = null;
  });
  getWorker().postMessage({ type: "load" });
  return pendingReady;
}

export function inferSwift(audio: Float32Array, fmax: number): Promise<SwiftInference> {
  return loadSwiftSession().then(
    () =>
      new Promise((resolve, reject) => {
        const id = ++nextId;
        // The stream reads this buffer again for the silence gate, so transfer a copy.
        const copy = new Float32Array(audio);
        pending.set(id, { resolve, reject });
        getWorker().postMessage({ type: "infer", id, audio: copy, fmax }, [copy.buffer]);
      }),
  );
}
