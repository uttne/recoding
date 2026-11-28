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

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL_PITCH = [0, 2, 4, 5, 7, 9, 11];
const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
/** Treble staff step by letter index. 0 is the bottom line, 4 is the middle line. */
const SHARP_STAFF_STEP = [5, 6, 7, 8, 9, 3, 4];
const FLAT_STAFF_STEP = [5, 6, 7, 1, 2, 3, 4];
const SCALE_STEPS: Record<ChordQuality, readonly number[]> = {
  major: [2, 2, 1, 2, 2, 2, 1],
  minor: [2, 1, 2, 2, 1, 2, 2],
  dominant: [2, 2, 1, 2, 2, 1, 2],
};
const SHARP_TONIC: { letter: number; accidental: number }[] = [
  { letter: 0, accidental: 0 },
  { letter: 0, accidental: 1 },
  { letter: 1, accidental: 0 },
  { letter: 1, accidental: 1 },
  { letter: 2, accidental: 0 },
  { letter: 3, accidental: 0 },
  { letter: 3, accidental: 1 },
  { letter: 4, accidental: 0 },
  { letter: 4, accidental: 1 },
  { letter: 5, accidental: 0 },
  { letter: 5, accidental: 1 },
  { letter: 6, accidental: 0 },
];

export type SignatureLetter = (typeof LETTERS)[number];
export type AccidentalKind = "sharp" | "flat";

export type KeyAccidental = {
  letter: SignatureLetter;
  kind: AccidentalKind;
  /** Line or space on the treble staff. 0 is 第1線, 4 is 第3線, 8 is 第5線. */
  staffStep: number;
};

function mod12(value: number): number {
  return ((value % 12) + 12) % 12;
}

function accidentalFor(letter: number, pitch: number): number {
  let accidental = pitch - NATURAL_PITCH[letter];
  if (accidental > 6) accidental -= 12;
  if (accidental < -6) accidental += 12;
  return accidental;
}

function spellScale(tonic: { letter: number; accidental: number }, steps: readonly number[]): { letter: number; accidental: number }[] {
  const notes = [tonic];
  let pitch = mod12(NATURAL_PITCH[tonic.letter] + tonic.accidental);
  for (let degree = 1; degree < 7; degree += 1) {
    pitch = mod12(pitch + steps[degree - 1]);
    const letter = (tonic.letter + degree) % 7;
    notes.push({ letter, accidental: accidentalFor(letter, pitch) });
  }
  return notes;
}

function writtenAccidentals(notes: { letter: number; accidental: number }[]): KeyAccidental[] {
  const byLetter = new Map(notes.map((note) => [note.letter, note.accidental]));
  const sharps = SHARP_ORDER.filter((letter) => byLetter.get(letter) === 1);
  const flats = FLAT_ORDER.filter((letter) => byLetter.get(letter) === -1);
  const kind: AccidentalKind = sharps.length > 0 ? "sharp" : "flat";
  const letters = kind === "sharp" ? sharps : flats;
  const steps = kind === "sharp" ? SHARP_STAFF_STEP : FLAT_STAFF_STEP;
  return letters.map((letter) => ({ letter: LETTERS[letter], kind, staffStep: steps[letter] }));
}

/** Treble-clef signature of the selected scale. Chromatic has none. Major uses that major key, minor uses its relative major, and dominant lowers the major scale's seventh. */
export function keySignature(choice: ScaleChoice): readonly KeyAccidental[] | null {
  if (choice.kind !== "chord") return null;
  const tonic = SHARP_TONIC[mod12(choice.root)];
  const steps = SCALE_STEPS[choice.quality];
  let notes = spellScale(tonic, steps);
  if (notes.some((note) => note.accidental < -1 || note.accidental > 1)) {
    notes = spellScale({ letter: (tonic.letter + 1) % 7, accidental: tonic.accidental - 2 }, steps);
  }
  return writtenAccidentals(notes);
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
