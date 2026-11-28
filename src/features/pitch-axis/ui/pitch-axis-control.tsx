import { noteName } from "@/audio/notes";
import type { PitchAxisMode } from "@/entities/pitch/model/pitch-axis";
import { Button } from "@/shared/ui/button";
import { nativeSelectClass } from "@/shared/ui/native-select";
import { NumberField } from "@/shared/ui/number-field";

const AXIS_MODES: { id: PitchAxisMode; label: string }[] = [
  { id: "full", label: "全体" },
  { id: "fixed", label: "固定" },
  { id: "follow", label: "追従" },
];

const NOTE_GROUPS = Array.from({ length: 11 }, (_, index) => {
  const octave = index - 1;
  const notes = Array.from({ length: 12 }, (_, pitchClass) => (octave + 1) * 12 + pitchClass).filter((midi) => midi <= 127);
  return { octave, notes };
});

export function PitchAxisControl({
  mode,
  low,
  high,
  octaves,
  onMode,
  onLow,
  onHigh,
  onOctaves,
  onReset,
  resetDisabled,
}: {
  mode: PitchAxisMode;
  low: number;
  high: number;
  octaves: number;
  onMode: (mode: PitchAxisMode) => void;
  onLow: (value: number) => void;
  onHigh: (value: number) => void;
  onOctaves: (value: number) => void;
  onReset: () => void;
  resetDisabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="pitch-axis">
        音程の範囲
      </label>
      <select
        id="pitch-axis"
        className={nativeSelectClass}
        value={mode}
        onChange={(event) => onMode(event.target.value as PitchAxisMode)}
      >
        {AXIS_MODES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {mode === "fixed" && (
        <>
          <MidiBound id="axis-low" label="下限" value={low} onCommit={onLow} />
          <MidiBound id="axis-high" label="上限" value={high} onCommit={onHigh} />
          <Button type="button" disabled={resetDisabled} onClick={onReset}>
            リセット
          </Button>
        </>
      )}
      {mode === "follow" && <OctaveWidth value={octaves} onCommit={onOctaves} />}
    </div>
  );
}

export function MidiBound({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (value: number) => void }) {
  const selected = String(Math.min(127, Math.max(0, Math.round(value))));
  const midiLabel = `${label}のMIDI`;
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-panel pr-1 pl-3 text-sm">
        <span className="text-muted">{label}</span>
        <NumberField
          id={id}
          inputLabel={midiLabel}
          min={0}
          max={127}
          value={value}
          onCommit={onCommit}
          align="right"
          commitOutside
        />
      </div>
      <select
        id={`${id}-note`}
        className={`${nativeSelectClass} text-base md:text-sm`}
        aria-label={`${label}の音名`}
        value={selected}
        onChange={(event) => onCommit(Number(event.target.value))}
      >
        {NOTE_GROUPS.map((group) => (
          <optgroup key={group.octave} label={`${group.octave}オクターブ`}>
            {group.notes.map((midi) => (
              <option key={midi} value={String(midi)}>
                {noteName(midi)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function OctaveWidth({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-1 rounded-full border border-line bg-panel px-3 text-sm" htmlFor="axis-octaves">
      <span className="text-muted">幅</span>
      <NumberField
        id="axis-octaves"
        inputLabel="幅"
        min={1}
        max={5}
        step={0.5}
        value={value}
        onCommit={onCommit}
        commitOutside
      />
      <span className="text-muted">oct</span>
    </label>
  );
}
