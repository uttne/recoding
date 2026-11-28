import { useEffect } from "react";
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
import { Dialog } from "@/shared/ui/dialog";
import { SettingsForm } from "./settings-form";

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <SettingsFormConnection /> : null}
    </Dialog>
  );
}

function SettingsFormConnection() {
  const state = useSession();
  useEffect(() => {
    void refreshMics();
  }, []);
  return (
    <SettingsForm
      micId={state.micId}
      mics={state.mics}
      micDisabled={state.recording}
      detector={state.detector}
      detectors={DETECTORS}
      a4={state.a4}
      ceilings={state.ceilings}
      ceilingFields={CEILING_FIELDS}
      distinguish={state.distinguish}
      pending={state.pending}
      guides={state.guides}
      csvDisabled={state.csvDisabled}
      onMic={(id) => void setMic(id)}
      onDetector={setDetector}
      onA4={setA4}
      onCeiling={setCeiling}
      onDistinguish={setDistinguish}
      onPending={setPending}
      onGuides={setGuides}
      onSaveCsv={saveCsv}
      onClearGraph={clearGraph}
    />
  );
}
