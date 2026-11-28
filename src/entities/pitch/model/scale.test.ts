import { describe, expect, it } from "vitest";
import { scaleChoiceFromId, scaleRole } from "./scale";

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
