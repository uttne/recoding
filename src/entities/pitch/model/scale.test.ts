import { describe, expect, it } from "vitest";
import { keySignature, scaleChoiceFromId, scaleRole } from "./scale";

describe("scaleRole", () => {
  it("uses the major scale and marks the major triad", () => {
    const choice = scaleChoiceFromId("major:0");
    const roles = Array.from({ length: 12 }, (_, pitch) => scaleRole(pitch, choice));
    expect(roles).toEqual(["root", null, "degree", null, "chord", "degree", null, "chord", null, "degree", null, "degree"]);
  });

  it("uses the natural minor scale and marks the minor triad", () => {
    const choice = scaleChoiceFromId("minor:9");
    expect(scaleRole(9, choice)).toBe("root");
    expect(scaleRole(0, choice)).toBe("chord");
    expect(scaleRole(4, choice)).toBe("chord");
    expect(scaleRole(11, choice)).toBe("degree");
    expect(scaleRole(1, choice)).toBe(null);
  });

  it("uses mixolydian for a dominant seventh, including the flat seventh", () => {
    const choice = scaleChoiceFromId("dominant:7");
    expect(scaleRole(7, choice)).toBe("root");
    expect(scaleRole(5, choice)).toBe("chord");
    expect(scaleRole(6, choice)).toBe(null);
    expect(scaleRole(4, choice)).toBe("degree");
  });

  it("falls back to the chromatic grid for an unknown id", () => {
    expect(scaleChoiceFromId("nope")).toEqual({ kind: "chromatic" });
    expect(scaleRole(0, { kind: "chromatic" })).toBe(null);
  });
});

function written(id: string): string {
  const signature = keySignature(scaleChoiceFromId(id));
  if (signature === null) return "none";
  return signature.map((item) => `${item.letter}${item.kind === "sharp" ? "#" : "b"}`).join(" ");
}

describe("keySignature", () => {
  it("has no signature for the chromatic scale", () => {
    expect(keySignature({ kind: "chromatic" })).toBeNull();
    expect(keySignature(scaleChoiceFromId("nope"))).toBeNull();
  });

  it("uses F♯ C♯ G♯ D♯ for E major, on the treble staff", () => {
    expect(keySignature(scaleChoiceFromId("major:4"))).toEqual([
      { letter: "F", kind: "sharp", staffStep: 8 },
      { letter: "C", kind: "sharp", staffStep: 5 },
      { letter: "G", kind: "sharp", staffStep: 9 },
      { letter: "D", kind: "sharp", staffStep: 6 },
    ]);
  });

  it("uses only F♯ for E minor", () => {
    expect(keySignature(scaleChoiceFromId("minor:4"))).toEqual([{ letter: "F", kind: "sharp", staffStep: 8 }]);
  });

  it("drops the leading tone from E dominant", () => {
    expect(keySignature(scaleChoiceFromId("dominant:4"))).toEqual([
      { letter: "F", kind: "sharp", staffStep: 8 },
      { letter: "C", kind: "sharp", staffStep: 5 },
      { letter: "G", kind: "sharp", staffStep: 9 },
    ]);
  });

  it("places B♭ on the middle line for F major", () => {
    expect(keySignature(scaleChoiceFromId("major:5"))).toEqual([{ letter: "B", kind: "flat", staffStep: 4 }]);
  });

  it("follows the same accidental rule for every root", () => {
    const expected: Record<string, string[]> = {
      major: ["", "F# C# G# D# A# E# B#", "F# C#", "Bb Eb Ab", "F# C# G# D#", "Bb", "F# C# G# D# A# E#", "F#", "Bb Eb Ab Db", "F# C# G#", "Bb Eb", "F# C# G# D# A#"],
      minor: ["Bb Eb Ab", "F# C# G# D#", "Bb", "F# C# G# D# A# E#", "F#", "Bb Eb Ab Db", "F# C# G#", "Bb Eb", "F# C# G# D# A#", "", "F# C# G# D# A# E# B#", "F# C#"],
      dominant: ["Bb", "F# C# G# D# A# E#", "F#", "Bb Eb Ab Db", "F# C# G#", "Bb Eb", "F# C# G# D# A#", "", "F# C# G# D# A# E# B#", "F# C#", "Bb Eb Ab", "F# C# G# D#"],
    };
    for (const quality of ["major", "minor", "dominant"] as const) {
      const writtenIds = Array.from({ length: 12 }, (_, root) => written(`${quality}:${root}`));
      expect(writtenIds).toEqual(expected[quality]);
    }
  });
});
