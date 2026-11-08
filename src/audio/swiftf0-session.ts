import * as ort from "onnxruntime-web/wasm";
import { SWIFT_FMAX, SWIFT_FMIN, type SwiftInference } from "./swiftf0";

let sessionPromise: Promise<ort.InferenceSession> | null = null;
let configured = false;

function configureRuntime(): void {
  if (configured) return;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;
  configured = true;
}

export function loadSwiftSession(): Promise<ort.InferenceSession> {
  if (sessionPromise) return sessionPromise;
  configureRuntime();
  const pending = ort.InferenceSession.create(`${import.meta.env.BASE_URL}models/swift-f0.onnx`, {
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
  if (data instanceof Float64Array) return data;
  return Float64Array.from(data as ArrayLike<number>);
}

function asFloat32(data: ort.Tensor["data"]): Float32Array {
  if (data instanceof Float32Array) return new Float32Array(data);
  return Float32Array.from(data as ArrayLike<number>);
}

export async function inferSwift(audio: Float32Array): Promise<SwiftInference> {
  const session = await loadSwiftSession();
  const output = await session.run({
    audio: new ort.Tensor("float32", audio, [1, audio.length]),
    fmin: new ort.Tensor("float32", Float32Array.of(SWIFT_FMIN), []),
    fmax: new ort.Tensor("float32", Float32Array.of(SWIFT_FMAX), []),
  });
  const pitch = output.pitch;
  const confidence = output.confidence;
  if (!pitch || !confidence) throw new Error("SwiftF0 の出力テンソルがありません");
  return { pitch: asFloat64(pitch.data), confidence: asFloat32(confidence.data) };
}
