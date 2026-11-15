import { type RevisionFrame } from "./acf-basic";
import { ACF_FMAX_HZ, acf2Plus, acfWindowSize } from "./acf2";
import {
  BASIC_FMAX_HZ,
  BasicPitchStream,
  type BasicFrame,
  type BasicMode,
} from "./basicpitch";
import { inferBasic, loadBasicSession } from "./basicpitch-session";
import { CREPE_FMAX_HZ, CrepeStream, type CrepeFrame } from "./crepe";
import { inferCrepe, loadCrepeSession } from "./crepe-session";
import { createMpm, MPM_FMAX_HZ, mpmWindowSize } from "./mpm";
import { PYIN_FMAX_HZ, PyinStream, type PyinFrame } from "./pyin";
import { joinFloat32 } from "./pcm";
import { StreamResampler } from "./resample";
import { inferSwift, loadSwiftSession } from "./swiftf0-session";
import { SWIFT_FMAX, SWIFT_SAMPLE_RATE, SwiftF0Stream, type SwiftFrame } from "./swiftf0";

export type DetectorId = "acf2" | "acf-basic" | "swiftf0" | "mpm" | "pyin" | "crepe" | "basic-mono" | "basic-poly";

/**
 * Ask the browser not to change the captured level. Each flag is set only when
 * the browser lists it, because an unknown constraint can reject the microphone.
 * `true` means no override, so the browser keeps its default.
 */
export function rawMicConstraints(supported: MediaTrackSupportedConstraints): MediaTrackConstraints | true {
  const audio: MediaTrackConstraints = {};
  if (supported.echoCancellation) audio.echoCancellation = false;
  if (supported.noiseSuppression) audio.noiseSuppression = false;
  if (supported.autoGainControl) audio.autoGainControl = false;
  return Object.keys(audio).length > 0 ? audio : true;
}

function isOverconstrained(error: unknown): boolean {
  return error instanceof DOMException && error.name === "OverconstrainedError";
}

/** Prefer an unprocessed mic. If the device cannot disable processing, open it with the browser default. */
async function openRawMic(audio: MediaTrackConstraints | true): Promise<MediaStream> {
  try {
    const media = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    if (audio !== true) {
      const track = media.getAudioTracks()[0];
      if (track) {
        try {
          await track.applyConstraints(audio);
        } catch {
          // The stream stays open. The device kept its own processing.
        }
      }
    }
    return media;
  } catch (error) {
    if (audio === true || !isOverconstrained(error)) throw error;
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

export type PitchEvent = {
  hz: number;
  confidence: number;
};

export type PitchPoint = {
  time: number;
  hz: number | null;
  confidence: number;
  detector: DetectorId;
  /** Loudest first. Present for Basic Pitch 重音 when at least one note is active. */
  pitches?: readonly PitchEvent[];
  /** ACF2+→Basic only. True until a Basic Pitch frame replaces this point. */
  provisional?: boolean;
};

type Handlers = {
  onPoint: (point: PitchPoint) => void;
  /** Basic Pitch frames that replace the provisional ACF2+ trace. */
  onRevise: (frames: RevisionFrame[]) => void;
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
  acfFmax = ACF_FMAX_HZ;
  swiftFmax = SWIFT_FMAX;
  mpmFmax = MPM_FMAX_HZ;
  pyinFmax = PYIN_FMAX_HZ;
  crepeFmax = CREPE_FMAX_HZ;
  basicFmax = BASIC_FMAX_HZ;
  private detectorId: DetectorId = "acf2";
  private context: AudioContext | null = null;
  private media: MediaStream | null = null;
  private worklet: AudioWorkletNode | null = null;
  private ring = new RingBuffer(8192);
  private samples = 0;
  private lastAcfTime = -1;
  private lastMpmTime = -1;
  private mpm: ReturnType<typeof createMpm> | null = null;
  private mpmRate = 0;
  private resampler: StreamResampler | null = null;
  private swift: SwiftF0Stream | null = null;
  private swiftOrigin = 0;
  private pyin: PyinStream | null = null;
  private pyinOrigin = 0;
  private crepe: CrepeStream | null = null;
  private basic: BasicPitchStream | null = null;
  private swiftReady = false;
  private swiftLoading = false;
  private swiftError: string | null = null;
  private crepeReady = false;
  private crepeLoading = false;
  private crepeError: string | null = null;
  private basicReady = false;
  private basicLoading = false;
  private basicError: string | null = null;
  private source: "idle" | "mic" | "file" = "idle";
  private captureChunks: Float32Array[] | null = null;
  private playback: AudioBufferSourceNode | null = null;
  private playbackEnded = false;
  /** Bumped when a mic or file session starts, so a late result from the previous one is ignored. */
  private analysisToken = 0;
  running = false;

  get mode(): "idle" | "mic" | "file" {
    return this.source;
  }

  constructor(private readonly handlers: Handlers) {}

  get detector(): DetectorId {
    return this.detectorId;
  }

  set detector(value: DetectorId) {
    this.detectorId = value;
    this.sync();
  }

  get time(): number {
    return this.context ? this.samples / this.context.sampleRate : 0;
  }

  preloadModel(): void {
    void this.prepareSwift();
    if (this.detectorId === "crepe") void this.prepareCrepe();
    if (this.usesBasic) void this.prepareBasic();
  }

  async start(): Promise<void> {
    if (this.running) return;
    const audio = rawMicConstraints(navigator.mediaDevices.getSupportedConstraints());
    const AudioCtx = window.AudioContext;
    this.context = new AudioCtx();
    try {
      this.media = await openRawMic(audio);
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
    this.bindWorklet();
    const mute = this.context.createGain();
    mute.gain.value = 0;
    source.connect(this.worklet);
    this.worklet.connect(mute);
    mute.connect(this.context.destination);
    this.analysisToken += 1;
    this.running = true;
    this.source = "mic";
    this.captureChunks = null;
    this.lastAcfTime = -1;
    this.lastMpmTime = -1;
    this.ring = new RingBuffer(8192);
    this.mpm = null;
    this.openStreams();
    this.handlers.onStatus(this.runningStatus());
    this.preloadModel();
  }

  get recording(): boolean {
    return this.captureChunks !== null;
  }

  /** Start a take. The microphone must already be open. A second call keeps the current take. */
  startRecording(): void {
    if (this.source !== "mic") throw new Error("マイクを開始してから録音します");
    if (this.captureChunks) return;
    this.captureChunks = [];
    this.handlers.onStatus(this.runningStatus());
  }

  /** Copy of the mic audio since startRecording. Clears the buffer and leaves the microphone open. */
  takeRecording(): { samples: Float32Array; sampleRate: number } | null {
    const chunks = this.captureChunks;
    const sampleRate = this.context?.sampleRate ?? 0;
    this.captureChunks = null;
    if (!chunks || chunks.length === 0 || sampleRate <= 0) return null;
    return { samples: joinFloat32(chunks), sampleRate };
  }

  /**
   * Play stored samples out loud and analyse them with the same path as the microphone.
   * The sample clock restarts at zero. Callers should clear the drawn points first.
   */
  async play(samples: Float32Array, sampleRate: number): Promise<void> {
    if (this.source === "mic") throw new Error("マイクを停止してから再生します");
    if (samples.length === 0 || sampleRate <= 0) throw new Error("再生する音がありません");
    if (this.running) this.stop(true);
    this.analysisToken += 1;
    const AudioCtx = window.AudioContext;
    try {
      this.context = new AudioCtx({ sampleRate });
    } catch {
      this.context = new AudioCtx();
    }
    try {
      if (this.context.state === "suspended") await this.context.resume();
      await this.context.audioWorklet.addModule(`${import.meta.env.BASE_URL}capture-worklet.js`);
      const buffer = this.context.createBuffer(1, samples.length, sampleRate);
      buffer.getChannelData(0).set(samples);
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      this.worklet = new AudioWorkletNode(this.context, "capture");
      this.bindWorklet();
      const mute = this.context.createGain();
      mute.gain.value = 0;
      source.connect(this.context.destination);
      source.connect(this.worklet);
      this.worklet.connect(mute);
      mute.connect(this.context.destination);
      this.samples = 0;
      this.lastAcfTime = -1;
      this.lastMpmTime = -1;
      this.ring = new RingBuffer(8192);
      this.mpm = null;
      this.captureChunks = null;
      this.running = true;
      this.source = "file";
      this.playback = source;
      this.openStreams();
      source.onended = () => {
        if (this.playback !== source) return;
        this.playbackEnded = true;
        this.stop();
      };
      source.start();
      this.handlers.onStatus(this.runningStatus());
      this.preloadModel();
    } catch (error) {
      this.stop(true);
      throw error;
    }
  }

  stop(silent = false): void {
    const finishedFile = this.source === "file" && this.playbackEnded;
    this.playbackEnded = false;
    this.running = false;
    this.source = "idle";
    this.captureChunks = null;
    const playback = this.playback;
    this.playback = null;
    if (playback) {
      try {
        playback.stop();
      } catch {
        // The buffer already reached its end.
      }
    }
    this.worklet?.disconnect();
    this.worklet = null;
    this.media?.getTracks().forEach((track) => track.stop());
    this.media = null;
    void this.context?.close();
    this.context = null;
    void this.swift?.flush();
    this.swift = null;
    this.resampler = null;
    this.pyin = null;
    this.crepe?.setEnabled(false);
    this.basic?.setEnabled(false);
    this.crepe = null;
    this.basic = null;
    this.mpm = null;
    this.handlers.onLevel(0);
    if (!silent) this.handlers.onStatus(finishedFile ? "再生が終わりました" : "停止しました");
  }

  private bindWorklet(): void {
    if (!this.worklet) return;
    this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer | Float32Array>) => {
      const chunk = event.data instanceof Float32Array ? event.data : new Float32Array(event.data);
      this.onChunk(chunk);
    };
  }

  private get isBasic(): boolean {
    return this.detectorId === "basic-mono" || this.detectorId === "basic-poly";
  }

  private get usesBasic(): boolean {
    return this.isBasic || this.detectorId === "acf-basic";
  }

  private basicMode(): BasicMode {
    return this.detectorId === "basic-poly" ? "poly" : "mono";
  }

  private activeStatus(): string {
    if (this.source === "file") return "再生中";
    if (this.captureChunks) return "録音中";
    return "マイクを聞いています";
  }

  private runningStatus(): string {
    const lead = this.activeStatus();
    if (this.detectorId === "swiftf0" && !this.swiftReady) return `${lead}。SwiftF0 はモデルの読み込み後に使えます`;
    if (this.detectorId === "crepe" && !this.crepeReady) return `${lead}。Tiny-CREPE はモデルの読み込み後に使えます`;
    if (this.detectorId === "acf-basic" && !this.basicReady) return `${lead}。右端は ACF2+ です。過去の置き換えはモデルの読み込み後です`;
    if (this.isBasic && !this.basicReady) return `${lead}。Basic Pitch はモデルの読み込み後に使えます`;
    return lead;
  }

  private announce(model: "swiftf0" | "crepe" | "basic"): boolean {
    if (model === "crepe") return this.detectorId === "crepe";
    if (model === "basic") return this.usesBasic;
    return this.detectorId !== "crepe" && !this.usesBasic;
  }

  private async prepareSwift(): Promise<void> {
    if (this.swiftReady || this.swiftError || this.swiftLoading) return;
    this.swiftLoading = true;
    if (this.announce("swiftf0")) this.handlers.onStatus("SwiftF0 のモデルを読み込んでいます");
    try {
      await loadSwiftSession();
      this.swiftReady = true;
      if (this.announce("swiftf0")) this.handlers.onStatus(this.running ? this.activeStatus() : "準備できました");
      this.attachSwift();
    } catch (error) {
      this.swiftError = error instanceof Error ? error.message : String(error);
      if (this.announce("swiftf0")) this.handlers.onStatus(`SwiftF0 を読み込めませんでした: ${this.swiftError}`);
    }
  }

  private async prepareCrepe(): Promise<void> {
    if (this.crepeReady || this.crepeError || this.crepeLoading) return;
    this.crepeLoading = true;
    if (this.announce("crepe")) this.handlers.onStatus("Tiny-CREPE のモデルを読み込んでいます");
    try {
      await loadCrepeSession();
      this.crepeReady = true;
      if (this.announce("crepe")) this.handlers.onStatus(this.running ? this.activeStatus() : "準備できました");
      this.sync();
    } catch (error) {
      this.crepeError = error instanceof Error ? error.message : String(error);
      if (this.announce("crepe")) this.handlers.onStatus(`Tiny-CREPE を読み込めませんでした: ${this.crepeError}`);
    }
  }

  private async prepareBasic(): Promise<void> {
    if (this.basicReady || this.basicError || this.basicLoading) return;
    this.basicLoading = true;
    if (this.announce("basic")) this.handlers.onStatus("Basic Pitch のモデルを読み込んでいます");
    try {
      await loadBasicSession();
      this.basicReady = true;
      if (this.announce("basic")) this.handlers.onStatus(this.running ? this.activeStatus() : "準備できました");
      this.sync();
    } catch (error) {
      this.basicError = error instanceof Error ? error.message : String(error);
      if (this.announce("basic")) this.handlers.onStatus(`Basic Pitch を読み込めませんでした: ${this.basicError}`);
    }
  }

  private openStreams(): void {
    if (!this.context) return;
    const token = this.analysisToken;
    const rate = this.context.sampleRate;
    this.crepe = new CrepeStream(
      rate,
      inferCrepe,
      (frames) => {
        if (token !== this.analysisToken) return;
        this.onCrepe(frames);
      },
      (error) => this.fail("Tiny-CREPE", error),
      () => this.crepeFmax,
    );
    this.basic = new BasicPitchStream(
      rate,
      inferBasic,
      (frames) => {
        if (token !== this.analysisToken) return;
        this.onBasic(frames);
      },
      (error) => this.fail("Basic Pitch", error),
      () => this.basicMode(),
      () => this.basicFmax,
    );
    this.sync();
  }

  private sync(): void {
    this.crepe?.setEnabled(this.running && this.detectorId === "crepe" && this.crepeReady);
    this.basic?.setEnabled(this.running && this.usesBasic && this.basicReady);
    if (this.detectorId === "pyin") this.ensurePyin();
    else this.pyin = null;
    if (this.detectorId === "swiftf0") this.attachSwift();
  }

  private ensurePyin(): void {
    if (!this.running || !this.context || this.pyin) return;
    const token = this.analysisToken;
    this.pyinOrigin = this.time;
    this.pyin = new PyinStream(this.context.sampleRate, () => this.pyinFmax, (frames) => {
      if (token !== this.analysisToken) return;
      this.onPyin(frames);
    });
  }

  private attachSwift(): void {
    if (!this.running || !this.swiftReady || !this.context || this.swift) return;
    const token = this.analysisToken;
    this.resampler = new StreamResampler(this.context.sampleRate, SWIFT_SAMPLE_RATE);
    this.swiftOrigin = this.samples / this.context.sampleRate;
    this.swift = new SwiftF0Stream(
      (audio) => inferSwift(audio, this.swiftFmax),
      (frames) => {
        if (token !== this.analysisToken) return;
        this.onSwiftFrames(frames);
      },
      (error) => this.fail("SwiftF0", error),
    );
  }

  private fail(name: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.handlers.onStatus(`${name} の推論に失敗しました: ${message}`);
  }

  private onChunk(chunk: Float32Array): void {
    if (!this.context) return;
    if (this.captureChunks) this.captureChunks.push(new Float32Array(chunk));
    this.ring.push(chunk);
    this.samples += chunk.length;
    const sampleRate = this.context.sampleRate;
    const time = this.samples / sampleRate;
    this.handlers.onClock(time);
    this.handlers.onLevel(rms(chunk));

    if ((this.detectorId === "acf2" || this.detectorId === "acf-basic") && time - this.lastAcfTime >= 0.016) {
      const frame = this.ring.latest(acfWindowSize(sampleRate));
      if (frame) {
        this.lastAcfTime = time;
        const hz = acf2Plus(frame, sampleRate, this.acfFmax);
        this.handlers.onPoint({
          time,
          hz: hz > 0 ? hz : null,
          confidence: hz > 0 ? 1 : 0,
          detector: this.detectorId,
          provisional: this.detectorId === "acf-basic" ? true : undefined,
        });
      }
    }

    if (this.detectorId === "mpm" && time - this.lastMpmTime >= 0.016) {
      const size = this.mpm?.bufferSize ?? mpmWindowSize(sampleRate);
      const frame = this.ring.latest(size);
      if (frame) {
        this.lastMpmTime = time;
        if (!this.mpm || this.mpmRate !== sampleRate || this.mpm.bufferSize !== frame.length) {
          this.mpm = createMpm(sampleRate, frame.length);
          this.mpmRate = sampleRate;
        }
        const reading = this.mpm.estimate(frame, this.mpmFmax);
        this.handlers.onPoint({
          time,
          hz: reading.hz,
          confidence: reading.confidence,
          detector: "mpm",
        });
      }
    }

    if (this.pyin && this.detectorId === "pyin") this.pyin.push(chunk);
    if (this.swift && this.resampler) this.swift.push(this.resampler.push(chunk));
    this.crepe?.push(chunk);
    this.basic?.push(chunk);
  }

  private onSwiftFrames(frames: SwiftFrame[]): void {
    if (this.detectorId !== "swiftf0") return;
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

  private onPyin(frames: PyinFrame[]): void {
    if (this.detectorId !== "pyin") return;
    for (const frame of frames) {
      this.handlers.onPoint({
        time: this.pyinOrigin + frame.time,
        hz: frame.hz,
        confidence: frame.confidence,
        detector: "pyin",
      });
    }
  }

  private onCrepe(frames: CrepeFrame[]): void {
    if (this.detectorId !== "crepe") return;
    for (const frame of frames) {
      this.handlers.onPoint({
        time: frame.time,
        hz: frame.hz,
        confidence: frame.confidence,
        detector: "crepe",
      });
    }
  }

  private onBasic(frames: BasicFrame[]): void {
    if (this.detectorId === "acf-basic") {
      this.handlers.onRevise(
        frames.map((frame) => {
          const primary = frame.pitches[0];
          return {
            time: frame.time,
            hz: primary ? primary.hz : null,
            confidence: primary ? primary.confidence : 0,
          };
        }),
      );
      return;
    }
    if (!this.isBasic) return;
    const detector = this.detectorId;
    for (const frame of frames) {
      const primary = frame.pitches[0];
      this.handlers.onPoint({
        time: frame.time,
        hz: primary ? primary.hz : null,
        confidence: primary ? primary.confidence : 0,
        detector,
        pitches: detector === "basic-poly" && frame.pitches.length > 0 ? frame.pitches : undefined,
      });
    }
  }
}

function rms(chunk: Float32Array): number {
  let energy = 0;
  for (let i = 0; i < chunk.length; i++) energy += chunk[i] * chunk[i];
  return Math.sqrt(energy / Math.max(1, chunk.length));
}
