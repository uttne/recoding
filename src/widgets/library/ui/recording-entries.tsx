import type { RecordingFile } from "@/entities/recording/model/recordings";
import { formatDuration } from "@/shared/lib/format-duration";

export function RecordingEntries({
  files,
  selectedId,
  playingId,
  onSelect,
}: {
  files: readonly RecordingFile[];
  selectedId: string | null;
  playingId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="px-3 pt-3 pb-2 text-xs tracking-[0.14em] text-muted">録音</h2>
      {files.length === 0 ? (
        <p className="px-3 text-sm text-muted">録音はまだありません。録音を停止するとここに残ります。</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {files.map((file) => {
            const selected = file.id === selectedId;
            const playing = file.id === playingId;
            return (
              <li key={file.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-white/5 ${selected ? "bg-white/10" : ""} ${playing ? "text-play" : ""}`}
                  onClick={() => onSelect(file.id)}
                >
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDuration(file.frames, file.sampleRate)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
