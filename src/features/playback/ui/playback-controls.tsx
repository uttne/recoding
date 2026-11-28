import { ChevronLeft, ChevronRight, Play, Square } from "lucide-react";
import { stepRecording, togglePlay } from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { IconButton } from "@/shared/ui/icon-button";

export function PlaybackControls() {
  const canStep = useSessionSlice((state) => state.canStep);
  const playLabel = useSessionSlice((state) => state.playLabel);
  const playDisabled = useSessionSlice((state) => state.playDisabled);
  const playing = useSessionSlice((state) => state.mode === "file");
  return (
    <>
      <IconButton label="前の録音" disabled={!canStep} onClick={() => stepRecording(-1)}>
        <ChevronLeft />
      </IconButton>
      <IconButton label="次の録音" disabled={!canStep} onClick={() => stepRecording(1)}>
        <ChevronRight />
      </IconButton>
      <IconButton label={playLabel} disabled={playDisabled} live={playing ? "play" : undefined} onClick={() => void togglePlay()}>
        {playing ? <Square /> : <Play className="fill-current" />}
      </IconButton>
    </>
  );
}
