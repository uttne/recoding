import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { ChevronLeft, ChevronRight, Circle, Download, Mic, Play, Settings as SettingsIcon, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import type { AudioFormat } from "../audio/encode";
import type { DetectorId } from "../audio/engine";
import {
  CEILING_FIELDS,
  DETECTORS,
  bindMeter,
  clearGraph,
  downloadSelected,
  getSnapshot,
  mountStage,
  removeSelected,
  saveCsv,
  setA4,
  setCeiling,
  setDetector,
  setDistinguish,
  setFormat,
  setGuides,
  setPending,
  setView,
  selectRecording,
  stepRecording,
  subscribe,
  toggleMic,
  togglePlay,
  toggleRecord,
  type Snapshot,
  type ViewId,
} from "../session";

function useSession(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "pitch", label: "音程" },
  { id: "ribbon", label: "帯" },
  { id: "loudness", label: "大きさ" },
];

export function App() {
  const state = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-4 px-4 pt-3 pb-2">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.14em] text-muted">ピッチ</p>
          <div className="mt-1 flex min-w-0 items-baseline gap-4">
            <p className={`truncate leading-none ${state.chord ? "text-3xl" : "text-5xl"}`}>{state.note}</p>
            <p className="truncate text-sm text-muted">
              {state.hz}
              <span className="px-1.5 text-ink/30">/</span>
              {state.cents}
              <span className="px-1.5 text-ink/30">/</span>
              {state.confidence}
            </p>
          </div>
          <Meter />
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <p className="line-clamp-2 text-right text-sm text-muted">{state.status}</p>
          <IconButton label="設定" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Stage view={state.view} />
        <RecordingList state={state} />
      </div>

      <footer className="flex items-center gap-2 border-t border-line px-3 py-2">
        <IconButton label={state.micLabel} disabled={state.micDisabled} live={state.mode === "mic" ? "accent" : undefined} onClick={() => void toggleMic()}>
          <Mic />
        </IconButton>
        <IconButton
          label={state.recordLabel}
          disabled={state.recordDisabled}
          pressed={state.recording}
          live={state.recording ? "record" : undefined}
          onClick={() => void toggleRecord()}
        >
          {state.recording ? <Square /> : <Circle className="fill-current" />}
        </IconButton>

        <div className="flex rounded-full border border-line bg-panel p-1" role="tablist" aria-label="ピッチの表示">
          {VIEWS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={state.view === item.id}
              className={`h-9 rounded-full px-3 text-sm ${state.view === item.id ? "bg-ink text-panel" : "text-muted hover:text-ink"}`}
              onClick={() => setView(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <IconButton label="前の録音" disabled={!state.canStep} onClick={() => stepRecording(-1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="次の録音" disabled={!state.canStep} onClick={() => stepRecording(1)}>
            <ChevronRight />
          </IconButton>
          <IconButton
            label={state.playLabel}
            disabled={state.playDisabled}
            live={state.mode === "file" ? "play" : undefined}
            onClick={() => void togglePlay()}
          >
            {state.mode === "file" ? <Square /> : <Play className="fill-current" />}
          </IconButton>
          <label className="sr-only" htmlFor="audio-format">
            形式
          </label>
          <select
            id="audio-format"
            className="h-11 rounded-full border border-line bg-panel px-3 text-sm"
            value={state.format}
            onChange={(event) => setFormat(event.target.value as AudioFormat)}
          >
            <option value="wav">WAV</option>
            <option value="flac">FLAC</option>
            <option value="mp3">MP3</option>
          </select>
          <IconButton label="ダウンロード" disabled={state.downloadDisabled} onClick={() => void downloadSelected()}>
            <Download />
          </IconButton>
          <IconButton label="削除" disabled={state.removeDisabled} onClick={() => void removeSelected()}>
            <Trash2 />
          </IconButton>
        </div>
      </footer>

      <Settings open={settingsOpen} onOpenChange={setSettingsOpen} state={state} />
    </div>
  );
}

function RecordingList({ state }: { state: Snapshot }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-l border-line" aria-label="保存した録音">
      <h2 className="px-3 pt-3 pb-2 text-xs tracking-[0.14em] text-muted">録音</h2>
      {state.files.length === 0 ? (
        <p className="px-3 text-sm text-muted">録音はまだありません。録音を停止するとここに残ります。</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          {state.files.map((file) => {
            const selected = file.id === state.selectedId;
            const playing = file.id === state.playingId;
            return (
              <li key={file.id}>
                <button
                  type="button"
                  aria-pressed={selected}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-white/5 ${selected ? "bg-white/10" : ""} ${playing ? "text-play" : ""}`}
                  onClick={() => selectRecording(file.id)}
                >
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-xs text-muted">{formatDuration(file.frames, file.sampleRate)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

function formatDuration(frames: number, sampleRate: number): string {
  const total = Math.max(0, Math.round(frames / Math.max(1, sampleRate)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function IconButton({
  label,
  disabled,
  pressed,
  live,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  live?: "accent" | "record" | "play";
  onClick: () => void;
  children: ReactNode;
}) {
  const tone =
    live === "record"
      ? "bg-record text-[#2a100e] border-transparent"
      : live === "play"
        ? "bg-play text-[#10211f] border-transparent"
        : live === "accent"
          ? "bg-accent text-[#2a1608] border-transparent"
          : "border-line bg-panel hover:border-ink/40";
  return (
    <button
      type="button"
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full border disabled:cursor-default disabled:opacity-40 [&_svg]:size-5 ${tone}`}
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Meter() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    bindMeter(ref.current);
    return () => bindMeter(null);
  }, []);
  return (
    <div className="mt-3 h-1 w-36 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
      <span ref={ref} className="block h-full w-full origin-left bg-accent" style={{ transform: "scaleX(0)" }} />
    </div>
  );
}

function Stage({ view }: { view: ViewId }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pitchRef = useRef<HTMLCanvasElement>(null);
  const ribbonRef = useRef<HTMLCanvasElement>(null);
  const loudnessRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const pitch = pitchRef.current;
    const ribbon = ribbonRef.current;
    const loudness = loudnessRef.current;
    if (!root || !pitch || !ribbon || !loudness) return;
    return mountStage(root, { pitch, ribbon, loudness });
  }, []);

  return (
    <div ref={rootRef} className="relative min-h-0 flex-1">
      <Canvas canvasRef={pitchRef} label="時間とピッチ。横軸は直近8秒、縦軸は音程" active={view === "pitch"} />
      <Canvas canvasRef={ribbonRef} label="時間とピッチと音量。横軸は直近8秒、縦軸は音程、線の周囲のにじみは音の大きさ" active={view === "ribbon"} />
      <Canvas canvasRef={loudnessRef} label="ピッチと音の大きさ。横軸は音程、縦軸は入力の大きさ" active={view === "loudness"} />
    </div>
  );
}

function Canvas({
  canvasRef,
  label,
  active,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  label: string;
  active: boolean;
}) {
  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${active ? "" : "invisible"}`}
      aria-label={label}
      aria-hidden={active ? undefined : true}
    />
  );
}

function Settings({
  open,
  onOpenChange,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: Snapshot;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/55" />
        <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[min(40rem,calc(100dvh-2rem))] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-bg p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg">設定</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                検出と、描画の切り替えです。音程の見方は画面下で選べます。
              </Dialog.Description>
            </div>
            <Dialog.Close className="h-9 rounded-full border border-line px-3 text-sm hover:border-ink/40">閉じる</Dialog.Close>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">検出</span>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-line bg-panel px-3"
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
            <Toggle
              label="検出の色分け"
              detail="ACF2+ と Basic、検出器ごとの色を分けて描きます。"
              checked={state.distinguish}
              onChange={setDistinguish}
            />
            <Toggle
              label="未確定の区間"
              detail="遅れて確定する検出器の、まだ置き換わっていない時間を薄く塗ります。"
              checked={state.pending}
              onChange={setPending}
            />
            <Toggle
              label="音域のガイド"
              detail="下限と上限の破線を引き、その外側を暗くします。"
              checked={state.guides}
              onChange={setGuides}
            />
          </div>

          <div className="mt-5 flex gap-2">
            <button type="button" className={ghostButton} disabled={state.csvDisabled} onClick={saveCsv}>
              CSV を保存
            </button>
            <button type="button" className={ghostButton} onClick={clearGraph}>
              グラフを消去
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="relative h-6 w-11 shrink-0 rounded-full bg-white/15 data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-ink transition-transform data-[state=checked]:translate-x-[22px]" />
      </Switch.Root>
    </label>
  );
}

const ghostButton = "h-11 rounded-full border border-line bg-panel px-3 text-sm hover:border-ink/40 disabled:cursor-default disabled:opacity-40";

function NumberField({
  value,
  min,
  max,
  onCommit,
  align = "left",
}: {
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  align?: "left" | "right";
}) {
  const [text, setText] = useState(String(Math.round(value)));
  useEffect(() => setText(String(Math.round(value))), [value]);
  return (
    <input
      className={`w-full bg-transparent outline-none ${align === "right" ? "w-20 text-right" : ""}`}
      type="number"
      min={min}
      max={max}
      step={1}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => {
        const next = Number(text);
        if (!Number.isFinite(next) || next < min || next > max) {
          setText(String(Math.round(value)));
          return;
        }
        onCommit(next);
      }}
    />
  );
}
