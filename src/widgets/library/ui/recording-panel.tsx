import { selectRecording } from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { CloseIcon } from "@/shared/ui/icons";
import { IconButton } from "@/shared/ui/icon-button";
import { RecordingEntries } from "./recording-entries";

export function RecordingPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const files = useSessionSlice((state) => state.files);
  const selectedId = useSessionSlice((state) => state.selectedId);
  const playingId = useSessionSlice((state) => state.playingId);
  return (
    <>
      <aside className="hidden min-h-0 w-60 shrink-0 flex-col border-l border-line md:flex" aria-label="保存した録音">
        <RecordingEntries files={files} selectedId={selectedId} playingId={playingId} onSelect={selectRecording} />
      </aside>
      {open ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button type="button" className="absolute inset-0 bg-black/55" aria-label="録音一覧を閉じる" onClick={onClose} />
          <aside className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col border-l border-line bg-bg" aria-label="保存した録音">
            <div className="flex items-center justify-end px-2 pt-2">
              <IconButton label="録音一覧を閉じる" onClick={onClose}>
                <CloseIcon />
              </IconButton>
            </div>
            <RecordingEntries files={files} selectedId={selectedId} playingId={playingId} onSelect={selectRecording} />
          </aside>
        </div>
      ) : null}
    </>
  );
}
