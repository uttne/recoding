import { describe, expect, it } from "vitest";
import { loadSettings, normalizeSettings, saveSettings, type Settings } from "./preferences";

const defaults: Settings = {
  format: "wav",
  detector: "acf-basic",
  a4: 440,
  ceilings: { acf2: 2000, swiftf0: 2000, mpm: 2000, pyin: 2000, crepe: 2000, "basic-mono": 2000 },
  view: "pitch",
  distinguish: false,
  guides: true,
  pending: false,
  scaleId: "chromatic",
  axisMode: "full",
  axisLow: 48,
  axisHigh: 72,
  axisOctaves: 2,
  micId: "",
};

function memory() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("settings storage", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(loadSettings(defaults, memory())).toEqual(defaults);
  });

  it("round-trips the choices that configure the screen", () => {
    const storage = memory();
    const saved: Settings = {
      ...defaults,
      format: "flac",
      detector: "crepe",
      a4: 442,
      ceilings: { ...defaults.ceilings, acf2: 1500, crepe: 800 },
      view: "ribbon",
      distinguish: true,
      guides: false,
      pending: true,
      scaleId: "minor:9",
      axisMode: "follow",
      axisLow: 40,
      axisHigh: 64,
      axisOctaves: 1.5,
      micId: "mic-a",
    };
    saveSettings(saved, storage);
    expect(loadSettings(defaults, storage)).toEqual(saved);
  });

  it("keeps valid fields when others are missing or out of range", () => {
    const next = normalizeSettings(
      {
        detector: "nope",
        format: "mp3",
        a4: 10,
        view: "loudness",
        ceilings: { acf2: 9000, mpm: 500, crepe: "high" },
        scaleId: "not-a-scale",
        axisMode: "fixed",
        axisLow: 100,
        axisHigh: 20,
        axisOctaves: 9,
        micId: "mic-b",
        distinguish: "yes",
      },
      defaults,
    );
    expect(next.detector).toBe("acf-basic");
    expect(next.format).toBe("mp3");
    expect(next.a4).toBe(440);
    expect(next.view).toBe("loudness");
    expect(next.ceilings.acf2).toBe(2000);
    expect(next.ceilings.mpm).toBe(500);
    expect(next.ceilings.crepe).toBe(2000);
    expect(next.scaleId).toBe("chromatic");
    expect(next.axisMode).toBe("fixed");
    expect(next.axisHigh - next.axisLow).toBeGreaterThanOrEqual(12);
    expect(next.axisOctaves).toBe(5);
    expect(next.micId).toBe("mic-b");
    expect(next.distinguish).toBe(false);
  });

  it("uses the defaults when the stored text is not JSON", () => {
    const storage = memory();
    storage.setItem("pitch-recorder-settings", "{");
    expect(loadSettings(defaults, storage)).toEqual(defaults);
  });

  it("ignores a store that refuses to write", () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => saveSettings(defaults, storage)).not.toThrow();
  });
});
