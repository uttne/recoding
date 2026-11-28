import { ACF_FMAX_HZ, ACF_FMIN_HZ } from "../../../audio/acf2";
import { BASIC_FMAX_HZ, BASIC_FMIN_HZ } from "../../../audio/basicpitch";
import { CREPE_FMAX_HZ, CREPE_FMIN_HZ } from "../../../audio/crepe";
import type { AudioFormat } from "../../../audio/encode";
import { audioInputOptions, type DetectorId, type MicChoice } from "../../../audio/engine";
import { MPM_FMAX_HZ, MPM_FMIN_HZ } from "../../../audio/mpm";
import { PYIN_FMAX_HZ, PYIN_FMIN_HZ } from "../../../audio/pyin";
import { SWIFT_FMAX, SWIFT_FMIN } from "../../../audio/swiftf0";
import type { FrequencyRange, GraphRanges } from "../../pitch/model/graph";
import type { PitchAxisMode } from "../../pitch/model/pitch-axis";
import { scaleChoiceFromId, scaleChoiceId, type ScaleChoice } from "../../pitch/model/scale";
import {
  DEFAULT_LEVEL_FLOOR,
  LEVEL_FLOOR_MAX,
  LEVEL_FLOOR_MIN,
  loadSettings,
  saveSettings,
  type CeilingId,
  type Settings,
  type ViewId,
} from "./preferences";
import { sessionPorts } from "./runtime";
import { resetFollow } from "./stage";

export const CEILING_FIELDS: { id: CeilingId; label: string; min: number; max: number }[] = [
  { id: "acf2", label: "ACF2+", min: 100, max: 8000 },
  { id: "swiftf0", label: "SwiftF0", min: 100, max: 8000 },
  { id: "mpm", label: "MPM", min: 100, max: 8000 },
  { id: "pyin", label: "pYIN", min: 100, max: 8000 },
  { id: "crepe", label: "Tiny-CREPE", min: 100, max: 2100 },
  { id: "basic-mono", label: "Basic Pitch", min: 100, max: 4500 },
];

export const DEFAULT_AXIS_LOW = 48;
export const DEFAULT_AXIS_HIGH = 72;

const floors: Record<DetectorId, number> = {
  acf2: ACF_FMIN_HZ,
  "acf-basic": BASIC_FMIN_HZ,
  swiftf0: SWIFT_FMIN,
  mpm: MPM_FMIN_HZ,
  pyin: PYIN_FMIN_HZ,
  crepe: CREPE_FMIN_HZ,
  "basic-mono": BASIC_FMIN_HZ,
  "basic-poly": BASIC_FMIN_HZ,
};

const ceilings: Record<DetectorId, number> = {
  acf2: ACF_FMAX_HZ,
  "acf-basic": Math.max(ACF_FMAX_HZ, BASIC_FMAX_HZ),
  swiftf0: SWIFT_FMAX,
  mpm: MPM_FMAX_HZ,
  pyin: PYIN_FMAX_HZ,
  crepe: CREPE_FMAX_HZ,
  "basic-mono": BASIC_FMAX_HZ,
  "basic-poly": BASIC_FMAX_HZ,
};

let a4 = 440;
let levelFloor = DEFAULT_LEVEL_FLOOR;
let view: ViewId = "pitch";
let distinguish = false;
let guides = true;
let pending = false;
let scale: ScaleChoice = { kind: "chromatic" };
let axisMode: PitchAxisMode = "full";
let axisLow = DEFAULT_AXIS_LOW;
let axisHigh = DEFAULT_AXIS_HIGH;
let axisOctaves = 2;
let micId = "";
let mics: MicChoice[] = [];
let format: AudioFormat = "wav";

export function getA4(): number {
  return a4;
}

export function getLevelFloor(): number {
  return levelFloor;
}

export function getView(): ViewId {
  return view;
}

export function getDistinguish(): boolean {
  return distinguish;
}

export function getGuides(): boolean {
  return guides;
}

export function getPending(): boolean {
  return pending;
}

export function getScale(): ScaleChoice {
  return scale;
}

export function getScaleId(): string {
  return scaleChoiceId(scale);
}

export function getAxisMode(): PitchAxisMode {
  return axisMode;
}

export function getAxisLow(): number {
  return axisLow;
}

export function getAxisHigh(): number {
  return axisHigh;
}

export function getAxisOctaves(): number {
  return axisOctaves;
}

export function getMicId(): string {
  return micId;
}

export function getMics(): readonly MicChoice[] {
  return mics;
}

export function getFormat(): AudioFormat {
  return format;
}

export function basicMonoCeiling(): number {
  return ceilings["basic-mono"];
}

export function ceilingChoices(): Record<CeilingId, number> {
  return {
    acf2: ceilings.acf2,
    swiftf0: ceilings.swiftf0,
    mpm: ceilings.mpm,
    pyin: ceilings.pyin,
    crepe: ceilings.crepe,
    "basic-mono": ceilings["basic-mono"],
  };
}

export function ranges(): GraphRanges {
  const byDetector = {} as Record<DetectorId, FrequencyRange>;
  for (const id of Object.keys(ceilings) as DetectorId[]) {
    byDetector[id] = { fmin: floors[id], fmax: ceilings[id] };
  }
  return { active: sessionPorts().engine.detector, byDetector };
}

function applyCeilings(): void {
  const engine = sessionPorts().engine;
  engine.acfFmax = ceilings.acf2;
  ceilings["acf-basic"] = Math.max(ceilings.acf2, ceilings["basic-mono"]);
  engine.swiftFmax = ceilings.swiftf0;
  engine.mpmFmax = ceilings.mpm;
  engine.pyinFmax = ceilings.pyin;
  engine.crepeFmax = ceilings.crepe;
  engine.basicFmax = ceilings["basic-mono"];
  ceilings["basic-poly"] = ceilings["basic-mono"];
}

function currentSettings(): Settings {
  return {
    format,
    detector: sessionPorts().engine.detector,
    a4,
    levelFloor,
    ceilings: ceilingChoices(),
    view,
    distinguish,
    guides,
    pending,
    scaleId: scaleChoiceId(scale),
    axisMode,
    axisLow,
    axisHigh,
    axisOctaves,
    micId,
  };
}

function remember(): void {
  saveSettings(currentSettings());
}

function defaultSettings(): Settings {
  return {
    format: "wav",
    detector: "acf-basic",
    a4: 440,
    levelFloor: DEFAULT_LEVEL_FLOOR,
    ceilings: {
      acf2: ACF_FMAX_HZ,
      swiftf0: SWIFT_FMAX,
      mpm: MPM_FMAX_HZ,
      pyin: PYIN_FMAX_HZ,
      crepe: CREPE_FMAX_HZ,
      "basic-mono": BASIC_FMAX_HZ,
    },
    view: "pitch",
    distinguish: false,
    guides: true,
    pending: false,
    scaleId: "chromatic",
    axisMode: "full",
    axisLow: DEFAULT_AXIS_LOW,
    axisHigh: DEFAULT_AXIS_HIGH,
    axisOctaves: 2,
    micId: "",
  };
}

export function restoreSettings(): void {
  const stored = loadSettings(defaultSettings());
  const engine = sessionPorts().engine;
  format = stored.format;
  a4 = stored.a4;
  levelFloor = stored.levelFloor;
  view = stored.view;
  distinguish = stored.distinguish;
  guides = stored.guides;
  pending = stored.pending;
  scale = scaleChoiceFromId(stored.scaleId);
  axisMode = stored.axisMode;
  axisLow = stored.axisLow;
  axisHigh = stored.axisHigh;
  axisOctaves = stored.axisOctaves;
  micId = stored.micId;
  for (const field of CEILING_FIELDS) ceilings[field.id] = stored.ceilings[field.id];
  engine.detector = stored.detector;
  engine.micId = stored.micId;
  applyCeilings();
}

export function setView(next: ViewId): void {
  view = next;
  remember();
  sessionPorts().publish();
}

export function setFormat(next: AudioFormat): void {
  format = next;
  remember();
  sessionPorts().publish();
}

export function setDetector(next: DetectorId): void {
  const { engine, getClock, setEngagedAt, publish } = sessionPorts();
  setEngagedAt(getClock());
  engine.detector = next;
  engine.preloadModel();
  remember();
  publish();
}

export function setA4(next: number): void {
  if (!Number.isFinite(next) || next < 415 || next > 466) return;
  a4 = next;
  remember();
  sessionPorts().publish();
}

/** Stores the floor. The session publishes after it refreshes the note on screen. */
export function setLevelFloor(next: number): boolean {
  if (!Number.isFinite(next) || next < LEVEL_FLOOR_MIN || next > LEVEL_FLOOR_MAX) return false;
  levelFloor = next;
  remember();
  return true;
}

export function setCeiling(id: CeilingId, next: number): void {
  const field = CEILING_FIELDS.find((item) => item.id === id);
  if (!field || !Number.isFinite(next) || next < field.min || next > field.max) return;
  ceilings[id] = next;
  if (id === "basic-mono") ceilings["basic-poly"] = next;
  applyCeilings();
  remember();
  sessionPorts().publish();
}

export function setDistinguish(next: boolean): void {
  distinguish = next;
  remember();
  sessionPorts().publish();
}

export function setGuides(next: boolean): void {
  guides = next;
  remember();
  sessionPorts().publish();
}

export function setPending(next: boolean): void {
  pending = next;
  remember();
  sessionPorts().publish();
}

export function setScale(id: string): void {
  scale = scaleChoiceFromId(id);
  remember();
  sessionPorts().publish();
}

export function setAxisMode(mode: PitchAxisMode): void {
  axisMode = mode;
  if (mode !== "follow") resetFollow();
  remember();
  sessionPorts().publish();
}

export function setAxisLow(value: number): void {
  const low = Math.min(127, Math.max(0, Math.round(value)));
  axisLow = low;
  if (axisHigh < low + 12) axisHigh = Math.min(127, low + 12);
  remember();
  sessionPorts().publish();
}

export function setAxisHigh(value: number): void {
  const high = Math.min(127, Math.max(0, Math.round(value)));
  axisHigh = high;
  if (axisLow > high - 12) axisLow = Math.max(0, high - 12);
  remember();
  sessionPorts().publish();
}

export function resetFixedAxis(): void {
  axisLow = DEFAULT_AXIS_LOW;
  axisHigh = DEFAULT_AXIS_HIGH;
  remember();
  sessionPorts().publish();
}

export function setAxisOctaves(value: number): void {
  if (!Number.isFinite(value)) return;
  axisOctaves = Math.min(5, Math.max(1, Math.round(value * 2) / 2));
  remember();
  sessionPorts().publish();
}

export async function refreshMics(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
  try {
    mics = audioInputOptions(await navigator.mediaDevices.enumerateDevices());
    sessionPorts().publish();
  } catch {
    // The list stays as it was. The default device still opens.
  }
}

export async function setMic(id: string): Promise<void> {
  const { engine, publish, setArmingMic, setStatus } = sessionPorts();
  if (engine.recording || id === micId) return;
  micId = id;
  engine.micId = id;
  remember();
  if (engine.mode !== "mic") {
    publish();
    return;
  }
  setArmingMic(true);
  publish();
  try {
    engine.stop(true);
    await engine.start();
    await refreshMics();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus(`マイクを切り替えられませんでした: ${message}`);
  } finally {
    setArmingMic(false);
    publish();
  }
}
