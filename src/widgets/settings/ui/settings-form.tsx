import type { DetectorId } from "@/audio/engine";
import { LEVEL_FLOOR_MAX, LEVEL_FLOOR_MIN, type CeilingId } from "@/entities/session/model/preferences";
import { Button } from "@/shared/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { NumberField } from "@/shared/ui/number-field";
import { nativeFieldClass } from "@/shared/ui/native-select";
import { Switch } from "@/shared/ui/switch";

export function SettingsForm({
  micId,
  mics,
  micDisabled,
  detector,
  detectors,
  a4,
  levelFloor,
  ceilings,
  ceilingFields,
  distinguish,
  pending,
  guides,
  csvDisabled,
  onMic,
  onDetector,
  onA4,
  onLevelFloor,
  onCeiling,
  onDistinguish,
  onPending,
  onGuides,
  onSaveCsv,
  onClearGraph,
}: {
  micId: string;
  mics: readonly { id: string; label: string }[];
  micDisabled: boolean;
  detector: DetectorId;
  detectors: readonly { id: DetectorId; label: string }[];
  a4: number;
  levelFloor: number;
  ceilings: Readonly<Record<CeilingId, number>>;
  ceilingFields: readonly { id: CeilingId; label: string; min: number; max: number }[];
  distinguish: boolean;
  pending: boolean;
  guides: boolean;
  csvDisabled: boolean;
  onMic: (id: string) => void;
  onDetector: (id: DetectorId) => void;
  onA4: (value: number) => void;
  onLevelFloor: (value: number) => void;
  onCeiling: (id: CeilingId, value: number) => void;
  onDistinguish: (value: boolean) => void;
  onPending: (value: boolean) => void;
  onGuides: (value: boolean) => void;
  onSaveCsv: () => void;
  onClearGraph: () => void;
}) {
  const selectedMissing = micId !== "" && !mics.some((mic) => mic.id === micId);
  return (
    <DialogContent>
      <div className="flex items-start justify-between gap-4">
        <div>
          <DialogTitle>設定</DialogTitle>
          <DialogDescription>検出と、描画の切り替えです。音程の見方と範囲は画面下で選べます。</DialogDescription>
        </div>
        <DialogClose>閉じる</DialogClose>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">マイク</span>
          <select className={nativeFieldClass} value={micId} disabled={micDisabled} onChange={(event) => onMic(event.target.value)}>
            <option value="">既定のマイク</option>
            {mics.map((mic) => (
              <option key={mic.id} value={mic.id}>
                {mic.label}
              </option>
            ))}
            {selectedMissing ? <option value={micId}>前回のマイク</option> : null}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">検出</span>
          <select className={nativeFieldClass} value={detector} onChange={(event) => onDetector(event.target.value as DetectorId)}>
            {detectors.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-muted">A4</span>
          <span className="mt-1 flex h-11 items-center rounded-xl border border-line bg-panel px-3">
            <NumberField min={415} max={466} value={a4} onCommit={onA4} />
            <span className="text-muted">Hz</span>
          </span>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="text-muted">これ未満は出さない</span>
          <span className="mt-1 flex h-11 items-center rounded-xl border border-line bg-panel px-3">
            <NumberField min={LEVEL_FLOOR_MIN} max={LEVEL_FLOOR_MAX} value={levelFloor} onCommit={onLevelFloor} />
            <span className="text-muted">dBFS</span>
          </span>
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm text-muted">上限</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {ceilingFields.map((field) => (
            <label key={field.id} className="flex items-center justify-between gap-3 text-sm">
              <span>{field.label}</span>
              <span className="flex h-10 items-center rounded-xl border border-line bg-panel px-3">
                <NumberField
                  min={field.min}
                  max={field.max}
                  value={ceilings[field.id]}
                  onCommit={(next) => onCeiling(field.id, next)}
                  align="right"
                />
                <span className="ml-2 text-muted">Hz</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-5 grid gap-3">
        <Toggle label="検出の色分け" detail="ACF2+ と Basic、検出器ごとの色を分けて描きます。" checked={distinguish} onChange={onDistinguish} />
        <Toggle
          label="未確定の区間"
          detail="遅れて確定する検出器の、まだ置き換わっていない時間を薄く塗ります。"
          checked={pending}
          onChange={onPending}
        />
        <Toggle label="音域のガイド" detail="下限と上限の破線を引き、その外側を暗くします。" checked={guides} onChange={onGuides} />
      </div>

      <div className="mt-5 flex gap-2">
        <Button type="button" disabled={csvDisabled} onClick={onSaveCsv}>
          CSV を保存
        </Button>
        <Button type="button" onClick={onClearGraph}>
          グラフを消去
        </Button>
      </div>
    </DialogContent>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-line px-3 py-2">
      <span>
        <span className="block text-sm">{label}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
