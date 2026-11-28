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
  setLevelFloor,
  setMic,
  setPending,
} from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
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
  const micId = useSessionSlice((state) => state.micId);
  const mics = useSessionSlice((state) => state.mics);
  const recording = useSessionSlice((state) => state.recording);
  const detector = useSessionSlice((state) => state.detector);
  const a4 = useSessionSlice((state) => state.a4);
  const levelFloor = useSessionSlice((state) => state.levelFloor);
  const acf2 = useSessionSlice((state) => state.ceilings.acf2);
  const swiftf0 = useSessionSlice((state) => state.ceilings.swiftf0);
  const mpm = useSessionSlice((state) => state.ceilings.mpm);
  const pyin = useSessionSlice((state) => state.ceilings.pyin);
  const crepe = useSessionSlice((state) => state.ceilings.crepe);
  const basicMono = useSessionSlice((state) => state.ceilings["basic-mono"]);
  const distinguish = useSessionSlice((state) => state.distinguish);
  const pending = useSessionSlice((state) => state.pending);
  const guides = useSessionSlice((state) => state.guides);
  const csvDisabled = useSessionSlice((state) => state.csvDisabled);
  useEffect(() => {
    void refreshMics();
  }, []);
  return (
    <SettingsForm
      micId={micId}
      mics={mics}
      micDisabled={recording}
      detector={detector}
      detectors={DETECTORS}
      a4={a4}
      levelFloor={levelFloor}
      ceilings={{
        acf2,
        swiftf0,
        mpm,
        pyin,
        crepe,
        "basic-mono": basicMono,
      }}
      ceilingFields={CEILING_FIELDS}
      distinguish={distinguish}
      pending={pending}
      guides={guides}
      csvDisabled={csvDisabled}
      onMic={(id) => void setMic(id)}
      onDetector={setDetector}
      onA4={setA4}
      onLevelFloor={setLevelFloor}
      onCeiling={setCeiling}
      onDistinguish={setDistinguish}
      onPending={setPending}
      onGuides={setGuides}
      onSaveCsv={saveCsv}
      onClearGraph={clearGraph}
    />
  );
}
