import { Mp3Encoder } from "@breezystack/lamejs";
import { int16ToFloat, floatToInt16 } from "./pcm";
import { StreamResampler } from "./resample";

export type AudioFormat = "wav" | "flac" | "mp3";

export type EncodeJob = {
  id: number;
  format: Exclude<AudioFormat, "wav">;
  pcm: Int16Array;
  sampleRate: number;
};

const MP3_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]);
const MP3_KBPS = 192;
const FLAC_LEVEL = 5;

type FlacLibrary = {
  isReady(): boolean;
  onready: (() => void) | undefined;
  create_libflac_encoder(
    sampleRate: number,
    channels: number,
    bitsPerSample: number,
    compression: number,
    totalSamples?: number,
    verify?: boolean,
  ): number;
  init_encoder_stream(encoder: number, onWrite: (data: Uint8Array) => void): number;
  FLAC__stream_encoder_process_interleaved(encoder: number, buffer: Int32Array, samples: number): boolean;
  FLAC__stream_encoder_finish(encoder: number): boolean;
  FLAC__stream_encoder_delete(encoder: number): void;
};

let loadingFlac: Promise<FlacLibrary> | null = null;

function asFlac(imported: { default?: FlacLibrary } & FlacLibrary): FlacLibrary {
  const flac = typeof imported.isReady === "function" ? imported : imported.default;
  if (!flac) throw new Error("FLAC エンコーダを読み込めませんでした");
  return flac;
}

function whenReady(flac: FlacLibrary): Promise<FlacLibrary> {
  if (flac.isReady()) return Promise.resolve(flac);
  return new Promise((resolve) => {
    flac.onready = () => resolve(flac);
  });
}

/** The browser worker uses libflac's wasm build. Vitest installs `__loadFlacForTests` before calling this. */
function loadFlac(): Promise<FlacLibrary> {
  const hook = (globalThis as { __loadFlacForTests?: () => Promise<FlacLibrary> }).__loadFlacForTests;
  if (!loadingFlac) {
    const pending = hook ? hook() : loadFlacInBrowser();
    loadingFlac = pending.catch((error: unknown) => {
      loadingFlac = null;
      throw error;
    });
  }
  return loadingFlac;
}

async function loadFlacInBrowser(): Promise<FlacLibrary> {
  const imported = (await import("libflacjs/dist/libflac.wasm.js")) as { default?: FlacLibrary } & FlacLibrary;
  return whenReady(asFlac(imported));
}

function resampleForMp3(pcm: Int16Array, sampleRate: number): { pcm: Int16Array; sampleRate: number } {
  if (MP3_RATES.has(sampleRate)) return { pcm, sampleRate };
  const floats = new StreamResampler(sampleRate, 48_000).push(int16ToFloat(pcm));
  return { pcm: floatToInt16(floats), sampleRate: 48_000 };
}

/**
 * LAME's JavaScript port returns a view of a buffer it reuses on the next call.
 * Copy each block before encoding the next one.
 */
function encodeMp3(pcm: Int16Array, sampleRate: number): Uint8Array {
  const prepared = resampleForMp3(pcm, sampleRate);
  const encoder = new Mp3Encoder(1, prepared.sampleRate, MP3_KBPS);
  const parts: Uint8Array[] = [];
  const block = 1152;
  for (let offset = 0; offset < prepared.pcm.length; offset += block) {
    const frame = encoder.encodeBuffer(prepared.pcm.subarray(offset, offset + block));
    if (frame.length > 0) parts.push(new Uint8Array(frame));
  }
  const tail = encoder.flush();
  if (tail.length > 0) parts.push(new Uint8Array(tail));
  return concatBytes(parts);
}

async function encodeFlac(pcm: Int16Array, sampleRate: number): Promise<Uint8Array> {
  const flac = await loadFlac();
  const wide = new Int32Array(pcm.length);
  wide.set(pcm);
  const encoder = flac.create_libflac_encoder(sampleRate, 1, 16, FLAC_LEVEL, pcm.length, false);
  if (encoder === 0) throw new Error("FLAC に変換できませんでした");
  const parts: Uint8Array[] = [];
  try {
    const ready = flac.init_encoder_stream(encoder, (data) => {
      parts.push(Uint8Array.from(data));
    });
    const encoded = ready === 0 && flac.FLAC__stream_encoder_process_interleaved(encoder, wide, wide.length);
    const finished = encoded && flac.FLAC__stream_encoder_finish(encoder);
    if (!finished) throw new Error("FLAC に変換できませんでした");
    return concatBytes(parts);
  } finally {
    flac.FLAC__stream_encoder_delete(encoder);
  }
}

export async function encodeAudio(format: Exclude<AudioFormat, "wav">, pcm: Int16Array, sampleRate: number): Promise<Uint8Array> {
  if (sampleRate <= 0) throw new Error("サンプルレートが不正です");
  if (format === "mp3") return encodeMp3(pcm, sampleRate);
  return encodeFlac(pcm, sampleRate);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
