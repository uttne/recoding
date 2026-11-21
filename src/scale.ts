/** Pitch-class grid for practicing the scale that belongs to a chord. */
export type ChordQuality = "major" | "minor" | "dominant";

export type ScaleChoice = { kind: "chromatic" } | { kind: "chord"; root: number; quality: ChordQuality };

export type ScaleRole = "root" | "chord" | "degree";

const ROOTS = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;

const QUALITIES: Record<ChordQuality, { label: string; steps: readonly number[]; chord: readonly number[] }> = {
  major: { label: "メジャー", steps: [0, 2, 4, 5, 7, 9, 11], chord: [0, 4, 7] },
  minor: { label: "マイナー", steps: [0, 2, 3, 5, 7, 8, 10], chord: [0, 3, 7] },
  dominant: { label: "セブンス", steps: [0, 2, 4, 5, 7, 9, 10], chord: [0, 4, 7, 10] },
};

export const SCALE_GROUPS: { quality: ChordQuality; label: string; options: { id: string; label: string }[] }[] = (
  Object.keys(QUALITIES) as ChordQuality[]
).map((quality) => ({
  quality,
  label: QUALITIES[quality].label,
  options: ROOTS.map((name, root) => ({
    id: scaleChoiceId({ kind: "chord", root, quality }),
    label: `${name} ${QUALITIES[quality].label}`,
  })),
}));

export function scaleChoiceId(choice: ScaleChoice): string {
  if (choice.kind === "chromatic") return "chromatic";
  return `${choice.quality}:${choice.root}`;
}

export function scaleChoiceFromId(id: string): ScaleChoice {
  if (id === "chromatic") return { kind: "chromatic" };
  const [quality, rootText] = id.split(":");
  const root = Number(rootText);
  if ((quality === "major" || quality === "minor" || quality === "dominant") && Number.isInteger(root) && root >= 0 && root < 12) {
    return { kind: "chord", root, quality };
  }
  return { kind: "chromatic" };
}

/** Role of a pitch class in the chord's scale. Chromatic grids have no scale role. */
export function scaleRole(pitchClass: number, choice: ScaleChoice): ScaleRole | null {
  if (choice.kind !== "chord") return null;
  const degree = (((pitchClass % 12) + 12) % 12 - choice.root + 12) % 12;
  const quality = QUALITIES[choice.quality];
  if (!quality.steps.includes(degree)) return null;
  if (degree === 0) return "root";
  if (quality.chord.includes(degree)) return "chord";
  return "degree";
}
