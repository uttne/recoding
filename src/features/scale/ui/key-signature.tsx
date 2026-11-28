import type { KeyAccidental } from "@/entities/pitch/model/scale";

const LINE_GAP = 10;
const BOTTOM_Y = 58;
const STEP_Y = LINE_GAP / 2;
const FIRST_ACCIDENTAL = 34;
const SLOT = 14;

function staffY(step: number): number {
  return BOTTOM_Y - step * STEP_Y;
}

function signatureLabel(accidentals: readonly KeyAccidental[]): string {
  if (accidentals.length === 0) return "調号なし";
  const names = accidentals.map((item) => `${item.letter}${item.kind === "sharp" ? "♯" : "♭"}`);
  return `調号 ${names.join("、")}`;
}

function sharpBar(center: number): string {
  const half = 1.15;
  const rise = -2.5;
  const x0 = -5.8;
  const x1 = 5.8;
  const y0 = center;
  const y1 = center + rise;
  return `${x0},${y0 - half} ${x1},${y1 - half} ${x1},${y1 + half} ${x0},${y0 + half}`;
}

function SharpMark() {
  return (
    <g fill="currentColor">
      <rect x={-2.35} y={-9} width={1.35} height={18} rx={0.3} />
      <rect x={1.05} y={-9} width={1.35} height={18} rx={0.3} />
      <polygon points={sharpBar(2.2)} />
      <polygon points={sharpBar(-2.2)} />
    </g>
  );
}

function FlatMark() {
  return (
    <g fill="currentColor">
      <rect x={-1.2} y={-16} width={1.7} height={20} />
      <path d="M0.5 -3.2 C2.4 -5.4 8.1 -3.8 8.1 0.3 C8.1 4.2 2.6 5.8 0.5 3.6 L0.5 -3.2 Z" />
    </g>
  );
}

function TrebleClef() {
  return (
    <path
      d="M16.6 65.5C7.8 64 4.6 54.2 9.8 47.2C14.2 41.2 23 42.6 22.6 49.2C22.2 55.2 15 58.2 12.8 52C11.2 47.4 15.2 44.4 17.8 46.6C19.4 48 18.4 51 16.7 50.2C16.5 41.5 15.8 27 16.2 15.5C16.6 7.2 23.8 2.4 29 9C34 15.4 29.6 24.4 22.8 24.2C18.2 24 15.6 19.2 18 14.2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function KeySignatureIcon({ accidentals }: { accidentals: readonly KeyAccidental[] }) {
  const width = accidentals.length === 0 ? 48 : FIRST_ACCIDENTAL + (accidentals.length - 1) * SLOT + 12;
  return (
    <svg viewBox={`0 0 ${width} 76`} className="h-11 w-auto shrink-0 text-ink" role="img" aria-label={signatureLabel(accidentals)}>
      {[0, 1, 2, 3, 4].map((line) => {
        const y = staffY(line * 2);
        return <line key={line} data-line={line + 1} x1={1} x2={width - 1} y1={y} y2={y} stroke="currentColor" strokeWidth={1.25} />;
      })}
      <TrebleClef />
      {accidentals.map((accidental, index) => (
        <g
          key={`${accidental.kind}-${accidental.letter}`}
          data-letter={accidental.letter}
          data-kind={accidental.kind}
          data-staff-step={accidental.staffStep}
          transform={`translate(${FIRST_ACCIDENTAL + index * SLOT} ${staffY(accidental.staffStep)})`}
        >
          {accidental.kind === "sharp" ? <SharpMark /> : <FlatMark />}
        </g>
      ))}
    </svg>
  );
}
