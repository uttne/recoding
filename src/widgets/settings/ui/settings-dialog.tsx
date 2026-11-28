import { useEffect } from "react";
import type { DetectorId } from "@/audio/engine";
import {
  CEILING_FIELDS,
  DETECTORS,
  clearGraph,
  refreshMics,
  saveCsv,
  setA4,
  setCeiling,
  setDetector,
  setDistinguish,
  setGuides,
  setMic,
  setPending,
} from "@/entities/session/model/session";
import { useSession } from "@/entities/session/model/use-session";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/shared/ui/dialog";
import { NumberField } from "@/shared/ui/number-field";
import { nativeFieldClass } from "@/shared/ui/native-select";
import { Switch } from "@/shared/ui/switch";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <SettingsForm /> : null}
    </Dialog>
  );
}

function SettingsForm() {
  const state = useSession();
  useEffect(() => {
    void refreshMics();
  }, []);
  const selectedMissing = state.micId !== "" && !state.mics.some((mic) => mic.id === state.micId);
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
            <select
              className={nativeFieldClass}
              value={state.micId}
              disabled={state.recording}
              onChange={(event) => void setMic(event.target.value)}
            >
              <option value="">既定のマイク</option>
              {state.mics.map((mic) => (
                <option key={mic.id} value={mic.id}>
                  {mic.label}
                </option>
              ))}
              {selectedMissing ? <option value={state.micId}>前回のマイク</option> : null}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">検出</span>
            <select
              className={nativeFieldClass}
              value={state.detector}
              onChange={(event) => setDetector(event.target.value as DetectorId)}
            >
              {DETECTORS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-muted">A4</span>
            <span className="mt-1 flex h-11 items-center rounded-xl border border-line bg-panel px-3">
              <NumberField min={415} max={466} value={state.a4} onCommit={setA4} />
              <span className="text-muted">Hz</span>
            </span>
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm text-muted">上限</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {CEILING_FIELDS.map((field) => (
              <label key={field.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{field.label}</span>
                <span className="flex h-10 items-center rounded-xl border border-line bg-panel px-3">
                  <NumberField
                    min={field.min}
                    max={field.max}
                    value={state.ceilings[field.id]}
                    onCommit={(next) => setCeiling(field.id, next)}
                    align="right"
                  />
                  <span className="ml-2 text-muted">Hz</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mt-5 grid gap-3">
          <Toggle label="検出の色分け" detail="ACF2+ と Basic、検出器ごとの色を分けて描きます。" checked={state.distinguish} onChange={setDistinguish} />
          <Toggle
            label="未確定の区間"
            detail="遅れて確定する検出器の、まだ置き換わっていない時間を薄く塗ります。"
            checked={state.pending}
            onChange={setPending}
          />
          <Toggle label="音域のガイド" detail="下限と上限の破線を引き、その外側を暗くします。" checked={state.guides} onChange={setGuides} />
        </div>

        <div className="mt-5 flex gap-2">
          <Button type="button" disabled={state.csvDisabled} onClick={saveCsv}>
            CSV を保存
          </Button>
          <Button type="button" onClick={clearGraph}>
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
