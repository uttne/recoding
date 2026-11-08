import * as ort from "onnxruntime-web/wasm";
import {
  BASIC_AUDIO_SAMPLES,
  BASIC_CONTOUR_BINS,
  BASIC_FRAMES,
  BASIC_NOTE_BINS,
  type BasicWorkerRequest,
} from "./basicpitch";

type WorkerScope = {
  location: Location;
  onmessage: ((event: MessageEvent<BasicWorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;
const INPUT = "serving_default_input_2:0";
const NOTE = "StatefulPartitionedCall:1";
const CONTOUR = "StatefulPartitionedCall:0";

function assetUrl(path: string): string {
  const base = new URL(import.meta.env.BASE_URL, scope.location.origin);
  return new URL(path, base).href;
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function openSession(): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = assetUrl("ort/");
  const pending = ort.InferenceSession.create(assetUrl("models/nmp.onnx"), {
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

scope.onmessage = (event: MessageEvent<BasicWorkerRequest>) => {
  void handle(event.data);
};

async function handle(message: BasicWorkerRequest): Promise<void> {
  try {
    const session = await openSession();
    if (message.type === "load") {
      scope.postMessage({ type: "ready" });
      return;
    }
    if (message.audio.length !== BASIC_AUDIO_SAMPLES) {
      throw new Error("Basic Pitch の窓長が 43844 ではありません");
    }
    const started = performance.now();
    const output = await session.run({
      [INPUT]: new ort.Tensor("float32", message.audio, [1, BASIC_AUDIO_SAMPLES, 1]),
    });
    const elapsedMs = performance.now() - started;
    const noteTensor = output[NOTE];
    const contourTensor = output[CONTOUR];
    if (!noteTensor || !contourTensor) throw new Error("Basic Pitch の出力テンソルがありません");
    const note = asFloat32(noteTensor.data);
    const contour = asFloat32(contourTensor.data);
    if (note.length !== BASIC_FRAMES * BASIC_NOTE_BINS || contour.length !== BASIC_FRAMES * BASIC_CONTOUR_BINS) {
      throw new Error("Basic Pitch の出力の形が違います");
    }
    scope.postMessage({ type: "result", id: message.id, note, contour, elapsedMs }, [note.buffer, contour.buffer]);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (message.type === "infer") scope.postMessage({ type: "error", id: message.id, message: text });
    else scope.postMessage({ type: "error", message: text });
  }
}
