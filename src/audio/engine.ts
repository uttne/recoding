import { acf2Plus, acfWindowSize } from "./acf2";
import { StreamResampler } from "./resample";
import { inferSwift, loadSwiftSession } from "./swiftf0-session";
import { SWIFT_SAMPLE_RATE, SwiftF0Stream, type SwiftFrame } from "./swiftf0";

export type DetectorId = "acf2" | "swiftf0";

export type PitchPoint = {
  time: number;
  hz: number | null;
  confidence: number;
  detector: DetectorId;
};

type Handlers = {
  onPoint: (point: PitchPoint) => void;
  onClock: (time: number) => void;
  onLevel: (rms: number) => void;
  onStatus: (message: string) => void;
};

class RingBuffer {
  private readonly data: Float32Array;
  private write = 0;
  filled = 0;

  constructor(capacity: number) {
    this.data = new Float32Array(capacity);
  }

  push(chunk: Float32Array): void {
    for (let i = 0; i < chunk.length; i++) {
      this.data[this.write] = chunk[i];
      this.write = (this.write + 1) % this.data.length;
      if (this.filled < this.data.length) this.filled++;
    }
  }

  latest(length: number): Float32Array | null {
    if (this.filled < length) return null;
    const out = new Float32Array(length);
    let start = this.write - length;
    if (start < 0) start += this.data.length;
    for (let i = 0; i < length; i++) out[i] = this.data[(start + i) % this.data.length];
    return out;
  }
}

export class PitchEngine {
  detector: DetectorId = "acf2";
  private context: AudioContext | null = null;
  private media: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private ring = new RingBuffer(8192);
  private samples = 0;
  private lastAcfTime = -1;
  private resampler: StreamResampler | null = null;
  private swift: SwiftF0Stream | null = null;
  private swiftOrigin = 0;
  private modelReady = false;
  private modelLoading = false;
  private modelError: string | null = null;
  running = false;

  constructor(private readonly handlers: Handlers) {}

  get time(): number {
    return this.context ? this.samples / this.context.sampleRate : 0;
  }

  preloadModel(): void {
    void this.prepareModel();
  }

  private async prepareModel(): Promise<void> {
    if (this.modelReady || this.modelError || this.modelLoading) return;
    this.modelLoading = true;
    this.handlers.onStatus("SwiftF0 のモデルを読み込んでいます");
    try {
      await loadSwiftSession();
      this.modelReady = true;
      this.handlers.onStatus(this.running ? "録音中" : "準備できました");
      this.attachSwift();
    } catch (error) {
      this.modelError = error instanceof Error ? error.message : String(error);
      this.handlers.onStatus(`SwiftF0 を読み込めませんでした: ${this.modelError}`);
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    const supported = navigator.mediaDevices.getSupportedConstraints();
    const audio = supported.autoGainControl
      ? { echoCancellation: false, noiseSuppression: true, autoGainControl: true }
      : true;
    const mediaPromise = navigator.mediaDevices.getUserMedia({ audio, video: false });
    const AudioCtx = window.AudioContext;
    try {
      this.context = new AudioCtx({ sampleRate: SWIFT_SAMPLE_RATE });
    } catch {
      this.context = new AudioCtx();
    }
    try {
      this.media = await mediaPromise;
      if (this.context.state === "suspended") await this.context.resume();
      await this.context.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);
    } catch (error) {
      this.media?.getTracks().forEach((track) => track.stop());
      this.media = null;
      await this.context.close();
      this.context = null;
      throw error;
    }
    const source = this.context.createMediaStreamSource(this.media);
    this.worklet = new AudioWorkletNode(this.context, "capture");
    this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer | Float32Array>) => {
      const chunk = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
      this.onChunk(chunk);
    };
    const mute = this.context.createGain();
    mute.gain.value = 0;
    source.connect(this.worklet);
    this.worklet.connect(mute);
    mute.connect(this.context.destination);
    this.running = true;
    this.lastAcfTime = -1;
    this.ring = new RingBuffer(8192);
    this.attachSwift();
    this.handlers.onStatus(this.modelReady ? "録音中" : "録音中。SwiftF0 はモデルの読み込み後に使えます");
    void this.prepareModel();
  }

  stop(): void {
    this.running = false;
    this.worklet?.disconnect();
    this.worklet = null;
    this.media?.getTracks().forEach((track) => track.stop());
    this.media = null;
    void this.context?.close();
    this.context = null;
    void this.swift?.flush();
    this.swift = null;
    this.resampler = null;
    this.handlers.onLevel(0);
    this.handlers.onStatus("停止しました");
  }

  private attachSwift(): void {
    if (!this.running || !this.modelReady || !this.context || this.swift) return;
    this.resampler = new StreamResampler(this.context.sampleRate, SWIFT_SAMPLE_RATE);
    this.swiftOrigin = this.samples / this.context.sampleRate;
    this.swift = new SwiftF0Stream(
      inferSwift,
      (frames) => this.onSwiftFrames(frames),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.handlers.onStatus(`SwiftF0 の推論に失敗しました: ${message}`);
      },
    );
  }

  private onChunk(chunk: Float32Array): void {
    if (!this.context) return;
    this.ring.push(chunk);
    this.samples += chunk.length;
    const sampleRate = this.context.sampleRate;
    const time = this.samples / sampleRate;
    this.handlers.onClock(time);
    this.handlers.onLevel(rms(chunk));

    if (this.detector === "acf2" && time - this.lastAcfTime >= 0.016) {
      const frame = this.ring.latest(acfWindowSize(sampleRate));
      if (frame) {
        this.lastAcfTime = time;
        const hz = acf2Plus(frame, sampleRate);
        this.handlers.onPoint({
          time,
          hz: hz > 0 ? hz : null,
          confidence: hz > 0 ? 1 : 0,
          detector: "acf2",
        });
      }
    }

    if (this.swift && this.resampler) this.swift.push(this.resampler.push(chunk));
  }

  private onSwiftFrames(frames: SwiftFrame[]): void {
    if (this.detector !== "swiftf0") return;
    for (const frame of frames) {
      const voiced = frame.confidence >= 0.5 && frame.hz > 0;
      this.handlers.onPoint({
        time: this.swiftOrigin + frame.time,
        hz: voiced ? frame.hz : null,
        confidence: frame.confidence,
        detector: "swiftf0",
      });
    }
  }
}

function rms(chunk: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < chunk.length; i++) energy += chunk[i] * chunk[i];
  return Math.sqrt(energy / Math.max(1, chunk.length));
}
