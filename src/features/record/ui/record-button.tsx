import { Circle, Square } from "lucide-react";
import { toggleRecord } from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { IconButton } from "@/shared/ui/icon-button";

export function RecordButton() {
  const label = useSessionSlice((state) => state.recordLabel);
  const disabled = useSessionSlice((state) => state.recordDisabled);
  const recording = useSessionSlice((state) => state.recording);
  return (
    <IconButton
      label={label}
      disabled={disabled}
      pressed={recording}
      live={recording ? "record" : undefined}
      onClick={() => void toggleRecord()}
    >
      {recording ? <Square /> : <Circle className="fill-current" />}
    </IconButton>
  );
}
