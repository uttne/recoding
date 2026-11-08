import { type CrepeInferFn, type CrepeWorkerResponse } from "./crepe";

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let readyResolve: (() => void) | null = null;
let readyReject: ((error: Error) => void) | null = null;
let nextId = 0;
let lastElapsedLog = 0;

const pending = new Map<number, { resolve: (value: Float32Array) => void; reject: (error: Error) => void }>();

function noteElapsed(elapsedMs: number): void {
  const now = performance.now();
  if (now - lastElapsedLog < 1000) return;
  lastElapsedLog = now;
  console.info(`Tiny-CREPE inference ${elapsedMs.toFixed(1)} ms`);
}

function rejectReady(error: Error): void {
  readyReject?.(error);
  readyResolve = null;
  readyReject = null;
  ready = null;
  for (const item of pending.values()) item.reject(error);
  pending.clear();
}

function handleMessage(message: CrepeWorkerResponse): void {
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
    item?.resolve(message.probabilities);
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
  const created = new Worker(new URL("./crepe.worker.ts", import.meta.url), { type: "module" });
  created.onmessage = (event: MessageEvent<CrepeWorkerResponse>) => {
    handleMessage(event.data);
  };
  created.onerror = (event) => {
    rejectReady(new Error(event.message || "Tiny-CREPE のワーカーを開始できませんでした"));
  };
  worker = created;
  return created;
}

export function loadCrepeSession(): Promise<void> {
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

export const inferCrepe: CrepeInferFn = (frames, rows) =>
  loadCrepeSession().then(
    () =>
      new Promise((resolve, reject) => {
        const id = ++nextId;
        const copy = new Float32Array(frames);
        pending.set(id, { resolve, reject });
        getWorker().postMessage({ type: "infer", id, audio: copy, rows }, [copy.buffer]);
      }),
  );
