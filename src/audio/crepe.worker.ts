import * as ort from "onnxruntime-web/wasm";
import { CREPE_BINS, CREPE_FRAME, type CrepeWorkerRequest } from "./crepe";

type WorkerScope = {
  location: Location;
  onmessage: ((event: MessageEvent<CrepeWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

function assetUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, scope.location.origin);
  return new URL(path, base).href;
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function openSession(): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = assetUrl("ort/");
  const pending = ort.InferenceSession.create(assetUrl("models/crepe-tiny.onnx"), {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  sessionPromise = pending;
  pending.catch(() => {
    if (sessionPromise === pending) sessionPromise = null;
  });
  return pending;
}

function asFloat32(data: ort.Tensor["data"]): Float32Array {
  if (data instanceof Float32Array) return Float32Array.from(data);
  return Float32Array.from(data as ArrayLike<number>);
}

scope.onmessage = (event: MessageEvent<CrepeWorkerRequest>) => {
  void handle(event.data);
};

async function handle(message: CrepeWorkerRequest): Promise<void> {
  try {
    const session = await openSession();
    if (message.type === "load") {
      scope.postMessage({ type: "ready" });
      return;
    }
    if (message.rows < 1 || message.audio.length !== message.rows * CREPE_FRAME) {
      throw new Error("Tiny-CREPE のフレーム長が 1024 ではありません");
    }
    const started = performance.now();
    const output = await session.run({
      frames: new ort.Tensor("float32", message.audio, [message.rows, CREPE_FRAME]),
    });
    const elapsedMs = performance.now() - started;
    const tensor = output.probabilities;
    if (!tensor) throw new Error("Tiny-CREPE の出力テンソルがありません");
    const probabilities = asFloat32(tensor.data);
    if (probabilities.length !== message.rows * CREPE_BINS) {
      throw new Error("Tiny-CREPE のビン数が 360 ではありません");
    }
    scope.postMessage({ type: "result", id: message.id, probabilities, elapsedMs }, [probabilities.buffer]);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (message.type === "infer") scope.postMessage({ type: "error", id: message.id, message: text });
    else scope.postMessage({ type: "error", message: text });
  }
}
