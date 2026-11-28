import { SCALE_GROUPS, keySignature, scaleChoiceFromId } from "@/entities/pitch/model/scale";
import { nativeSelectClass } from "@/shared/ui/native-select";
import { KeySignatureIcon } from "./key-signature";

export function ScaleSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const signature = keySignature(scaleChoiceFromId(value));
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5 md:flex-none">
      <label className="sr-only" htmlFor="scale">
        スケール
      </label>
      <select
        id="scale"
        className={`${nativeSelectClass} min-w-0 flex-1 md:max-w-40 md:flex-none`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="chromatic">半音</option>
        {SCALE_GROUPS.map((group) => (
          <optgroup key={group.quality} label={group.label}>
            {group.options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {signature !== null && <KeySignatureIcon accidentals={signature} />}
    </div>
  );
}
