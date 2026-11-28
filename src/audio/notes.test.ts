import { describe, expect, it } from "vitest";
import { noteName } from "./notes";

describe("noteName", () => {
  it("names every MIDI number from 0 through 127", () => {
    const names = new Set<string>();
    for (let midi = 0; midi <= 127; midi++) names.add(noteName(midi));
    expect(names.size).toBe(128);
    expect(noteName(0)).toBe("C-1");
    expect(noteName(48)).toBe("C3");
    expect(noteName(60)).toBe("C4");
    expect(noteName(127)).toBe("G9");
  });

  it("rounds a fractional MIDI number to the nearest named semitone", () => {
    expect(noteName(60.4)).toBe("C4");
    expect(noteName(60.6)).toBe("C♯4");
  });
});
