const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"] as const;

export function hzToMidi(hz: number, a4: number): number {
  return 69 + 12 * Math.log2(hz / a4);
}

export function midiToHz(midi: number, a4: number): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  const name = NAMES[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function centsOff(midi: number): number {
  return Math.round((midi - Math.round(midi)) * 100);
}
