import { Download, Trash2 } from "lucide-react";
import type { AudioFormat } from "@/audio/encode";
import { downloadSelected, removeSelected, setFormat } from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { IconButton } from "@/shared/ui/icon-button";

export function FormatSelect() {
  const format = useSessionSlice((state) => state.format);
  return (
    <>
      <label className="sr-only" htmlFor="audio-format">
        形式
      </label>
      <select
        id="audio-format"
        className="h-10 w-[4.5rem] rounded-full border border-line bg-panel px-2 text-sm md:h-11 md:w-auto md:px-3"
        value={format}
        onChange={(event) => setFormat(event.target.value as AudioFormat)}
      >
        <option value="wav">WAV</option>
        <option value="flac">FLAC</option>
        <option value="mp3">MP3</option>
      </select>
    </>
  );
}

export function DownloadButton() {
  const disabled = useSessionSlice((state) => state.downloadDisabled);
  return (
    <IconButton label="ダウンロード" disabled={disabled} onClick={() => void downloadSelected()}>
      <Download />
    </IconButton>
  );
}

export function DeleteButton() {
  const disabled = useSessionSlice((state) => state.removeDisabled);
  return (
    <IconButton label="削除" disabled={disabled} onClick={() => void removeSelected()}>
      <Trash2 />
    </IconButton>
  );
}
