import { useState } from "react";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { DeleteButton, DownloadButton, FormatSelect } from "@/features/download/ui/download-controls";
import { MicButton } from "@/features/microphone/ui/mic-button";
import { PitchAxis } from "@/features/pitch-axis/ui/pitch-axis";
import { PlaybackControls } from "@/features/playback/ui/playback-controls";
import { RecordButton } from "@/features/record/ui/record-button";
import { LibraryToggle } from "@/features/recording-library/ui/library-toggle";
import { ScaleControl } from "@/features/scale/ui/scale-control";
import { ViewSwitch } from "@/features/view/ui/view-switch";
import { Footer } from "@/widgets/footer/ui/footer";
import { Header } from "@/widgets/header/ui/header";
import { RecordingPanel } from "@/widgets/library/ui/recording-panel";
import { SettingsDialog } from "@/widgets/settings/ui/settings-dialog";
import { Stage } from "@/widgets/stage/ui/stage";

export function RecorderPage() {
  const view = useSessionSlice((state) => state.view);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Header onOpenSettings={() => setSettingsOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <Stage view={view} />
        <RecordingPanel open={libraryOpen} onClose={() => setLibraryOpen(false)} />
      </div>
      <Footer
        primary={
          <>
            <MicButton />
            <RecordButton />
            <ViewSwitch />
          </>
        }
        secondary={
          <>
            <ScaleControl />
            <PitchAxis />
            <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
              <LibraryToggle open={libraryOpen} onToggle={() => setLibraryOpen((open) => !open)} />
              <PlaybackControls />
              <FormatSelect />
              <DownloadButton />
              <DeleteButton />
            </div>
          </>
        }
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
