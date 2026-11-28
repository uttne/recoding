import { Mic } from "lucide-react";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { toggleMic } from "@/entities/session/model/session";
import { IconButton } from "@/shared/ui/icon-button";

export function MicButton() {
  const label = useSessionSlice((state) => state.micLabel);
  const disabled = useSessionSlice((state) => state.micDisabled);
  const live = useSessionSlice((state) => state.mode === "mic");
  return (
    <IconButton label={label} disabled={disabled} live={live ? "accent" : undefined} onClick={() => void toggleMic()}>
      <Mic />
    </IconButton>
  );
}
