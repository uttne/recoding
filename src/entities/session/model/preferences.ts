import type { AudioFormat } from "../../../audio/encode";
import type { DetectorId } from "../../../audio/engine";
import type { PitchAxisMode } from "../../pitch/model/pitch-axis";
import { scaleChoiceFromId, scaleChoiceId } from "../../pitch/model/scale";

export type CeilingId = Exclude<DetectorId, "acf-basic" | "basic-poly">;
export type ViewId = "pitch" | "ribbon" | "loudness";

/** Chunks quieter than this dBFS are not drawn. The ends are included. */
export const LEVEL_FLOOR_MIN = -60;
export const LEVEL_FLOOR_MAX = 0;
/** Room noise and other small sounds stay off the pitch line until the control is lowered. */
export const DEFAULT_LEVEL_FLOOR = -40;

/** Choices that should look the same the next time this browser opens the app. */
export type Settings = {
  format: AudioFormat;
  detector: DetectorId;
  a4: number;
  /** dBFS. A chunk quieter than this does not become a pitch point. */
  levelFloor: number;
  ceilings: Record<CeilingId, number>;
  view: ViewId;
  distinguish: boolean;
  guides: boolean;
  pending: boolean;
  scaleId: string;
  axisMode: PitchAxisMode;
  axisLow: number;
  axisHigh: number;
  axisOctaves: number;
  micId: string;
};

const STORAGE_KEY = "pitch-recorder-settings";

const FORMATS = ["wav", "flac", "mp3"] as const;
const DETECTORS = ["acf2", "acf-basic", "swiftf0", "mpm", "pyin", "crepe", "basic-mono", "basic-poly"] as const;
const VIEWS = ["pitch", "ribbon", "loudness"] as const;
const AXIS_MODES = ["full", "fixed", "follow"] as const;
const CEILING_IDS = ["acf2", "swiftf0", "mpm", "pyin", "crepe", "basic-mono"] as const satisfies readonly CeilingId[];

const CEILING_RANGE: Record<CeilingId, { min: number; max: number }> = {
  acf2: { min: 100, max: 8000 },
  swiftf0: { min: 100, max: 8000 },
  mpm: { min: 100, max: 8000 },
  pyin: { min: 100, max: 8000 },
  crepe: { min: 100, max: 2100 },
  "basic-mono": { min: 100, max: 4500 },
};

type Store = Pick<Storage, "getItem" | "setItem">;

function browserStore(): Store | undefined {
  if (typeof localStorage === "undefined") return undefined;
  return localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function ranged(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

function steppedOctaves(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(5, Math.max(1, Math.round(value * 2) / 2));
}

function midi(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(127, Math.max(0, Math.round(value)));
}

/** Drop unknown or out-of-range fields and keep the rest of a saved settings object. */
export function normalizeSettings(raw: unknown, defaults: Settings): Settings {
  const source = isRecord(raw) ? raw : {};
  const storedCeilings = isRecord(source.ceilings) ? source.ceilings : {};
  const ceilings = { ...defaults.ceilings };
  for (const id of CEILING_IDS) {
    const range = CEILING_RANGE[id];
    ceilings[id] = ranged(storedCeilings[id], range.min, range.max, defaults.ceilings[id]);
  }
  const scaleId = typeof source.scaleId === "string" ? scaleChoiceId(scaleChoiceFromId(source.scaleId)) : defaults.scaleId;
  let axisLow = midi(source.axisLow, defaults.axisLow);
  let axisHigh = midi(source.axisHigh, defaults.axisHigh);
  if (axisHigh < axisLow + 12) axisHigh = Math.min(127, axisLow + 12);
  if (axisLow > axisHigh - 12) axisLow = Math.max(0, axisHigh - 12);
  const micId = typeof source.micId === "string" && source.micId.length <= 512 ? source.micId : defaults.micId;
  return {
    format: oneOf(source.format, FORMATS, defaults.format),
    detector: oneOf(source.detector, DETECTORS, defaults.detector),
    a4: ranged(source.a4, 415, 466, defaults.a4),
    levelFloor: ranged(source.levelFloor, LEVEL_FLOOR_MIN, LEVEL_FLOOR_MAX, defaults.levelFloor),
    ceilings,
    view: oneOf(source.view, VIEWS, defaults.view),
    distinguish: flag(source.distinguish, defaults.distinguish),
    guides: flag(source.guides, defaults.guides),
    pending: flag(source.pending, defaults.pending),
    scaleId,
    axisMode: oneOf(source.axisMode, AXIS_MODES, defaults.axisMode),
    axisLow,
    axisHigh,
    axisOctaves: steppedOctaves(source.axisOctaves, defaults.axisOctaves),
    micId,
  };
}

export function loadSettings(defaults: Settings, storage: Store | undefined = browserStore()): Settings {
  if (!storage) return defaults;
  try {
    const text = storage.getItem(STORAGE_KEY);
    if (!text) return defaults;
    return normalizeSettings(JSON.parse(text) as unknown, defaults);
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings, storage: Store | undefined = browserStore()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A full quota or private mode still leaves the open session usable.
  }
}
