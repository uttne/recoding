import * as ort from "onnxruntime-web/wasm";
import { SWIFT_FMAX, SWIFT_FMIN, type SwiftWorkerRequest } from "./swiftf0";

type WorkerScope = {
  location: Location;
  onmessage: ((event: MessageEvent<SwiftWorkerRequest>) => void) | null;
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
  const pending = ort.InferenceSession.create(assetUrl("models/swift-f0.onnx"), {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  });
  sessionPromise = pending;
  pending.catch(() => {
    if (sessionPromise === pending) sessionPromise = null;
  });
  return pending;
}

function asFloat64(data: ort.Tensor["data"]): Float64Array {
  if (data instanceof Float64Array) return Float64Array.from(data);
  return Float64Array.from(data as ArrayLike<number>);
}

function asFloat32(data: ort.Tensor["data"]): Float32Array {
  if (data instanceof Float32Array) return Float32Array.from(data);
  return Float32Array.from(data as ArrayLike<number>);
}

scope.onmessage = (event: MessageEvent<SwiftWorkerRequest>) => {
  const message = event.data;
  void handle(message);
};

async function handle(message: SwiftWorkerRequest): Promise<void> {
  try {
    const session = await openSession();
    if (message.type === "load") {
      scope.postMessage({ type: "ready" });
      return;
    }
    const started = performance.now();
    const output = await session.run({
      audio: new ort.Tensor("float32", message.audio, [1, message.audio.length]),
      fmin: new ort.Tensor("float32", Float32Array.of(SWIFT_FMIN), []),
      fmax: new ort.Tensor("float32", Float32Array.of(message.fmax > SWIFT_FMIN ? message.fmax : SWIFT_FMAX), []),
    });
    const elapsedMs = performance.now() - started;
    const pitchTensor = output.pitch;
    const confidenceTensor = output.confidence;
    if (!pitchTensor || !confidenceTensor) throw new Error("SwiftF0 の出力テンソルがありません");
    const pitch = asFloat64(pitchTensor.data);
    const confidence = asFloat32(confidenceTensor.data);
    scope.postMessage({ type: "result", id: message.id, pitch, confidence, elapsedMs }, [pitch.buffer, confidence.buffer]);
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    if (message.type === "infer") scope.postMessage({ type: "error", id: message.id, message: text });
    else scope.postMessage({ type: "error", message: text });
  }
}
