import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { ChevronLeft, ChevronRight, Circle, Download, Mic, Play, Settings as SettingsIcon, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from "react";
import type { AudioFormat } from "../audio/encode";
import { noteName } from "../audio/notes";
import { SCALE_GROUPS } from "../scale";
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
  setAxisHigh,
  setAxisLow,
  setAxisMode,
  setAxisOctaves,
  setCeiling,
  setDetector,
  setDistinguish,
  setFormat,
  setGuides,
  setPending,
  refreshMics,
  resetFixedAxis,
  setMic,
  setScale,
  setView,
  selectRecording,
  stepRecording,
  subscribe,
  toggleMic,
  togglePlay,
  toggleRecord,
  DEFAULT_AXIS_HIGH,
  DEFAULT_AXIS_LOW,
  type PitchAxisMode,
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
  const [libraryOpen, setLibraryOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <header className="flex items-end justify-between gap-3 px-3 pt-2 pb-2 sm:px-4 sm:pt-3">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.14em] text-muted">ピッチ</p>
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className={`truncate leading-none ${state.chord ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"}`}>{state.note}</p>
            <p className="truncate text-xs text-muted sm:text-sm">
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
          <p className="line-clamp-2 max-w-28 text-right text-xs text-muted sm:max-w-56 sm:text-sm">{state.status}</p>
          <IconButton label="設定" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
          </IconButton>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <Stage view={state.view} />
        <RecordingList state={state} open={libraryOpen} onClose={() => setLibraryOpen(false)} />
      </div>

      <footer className="flex flex-col gap-2 border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:flex-row md:flex-wrap md:items-center">
        <div className="flex min-w-0 items-center gap-2">
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
              aria-label={item.label}
              title={item.label}
              aria-selected={state.view === item.id}
              className={`inline-flex size-9 items-center justify-center rounded-full [&_svg]:size-5 ${state.view === item.id ? "bg-ink text-panel" : "text-muted hover:text-ink"}`}
              onClick={() => setView(item.id)}
            >
              <ViewIcon id={item.id} />
            </button>
          ))}
        </div>

        <label className="sr-only" htmlFor="scale">
          スケール
        </label>
        <select
          id="scale"
          className="h-11 min-w-0 flex-1 rounded-full border border-line bg-panel px-3 text-sm md:max-w-40 md:flex-none"
          value={state.scaleId}
          onChange={(event) => setScale(event.target.value)}
        >
          <option value="chromatic">半音</option>
          {SCALE_GROUPS.map((group) => (
            <optgroup key={group.quality} label={group.label}>
              {group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        </div>

        <PitchAxis state={state} />

        <div className="flex flex-nowrap items-center gap-1.5 md:ml-auto md:gap-2">
          <IconButton className="md:hidden" label={libraryOpen ? "録音一覧を閉じる" : "録音一覧"} pressed={libraryOpen} onClick={() => setLibraryOpen((open) => !open)}>
            <LibraryIcon />
          </IconButton>
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
            className="h-10 w-[4.5rem] rounded-full border border-line bg-panel px-2 text-sm md:h-11 md:w-auto md:px-3"
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

const AXIS_MODES: { id: PitchAxisMode; label: string }[] = [
  { id: "full", label: "全体" },
  { id: "fixed", label: "固定" },
  { id: "follow", label: "追従" },
];

function PitchAxis({ state }: { state: Snapshot }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="pitch-axis">
        音程の範囲
      </label>
      <select
        id="pitch-axis"
        className="h-11 rounded-full border border-line bg-panel px-3 text-sm"
        value={state.axisMode}
        onChange={(event) => setAxisMode(event.target.value as PitchAxisMode)}
      >
        {AXIS_MODES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      {state.axisMode === "fixed" && (
        <>
          <MidiBound id="axis-low" label="下限" value={state.axisLow} onCommit={setAxisLow} />
          <MidiBound id="axis-high" label="上限" value={state.axisHigh} onCommit={setAxisHigh} />
          <button
            type="button"
            className="h-11 rounded-full border border-line bg-panel px-3 text-sm hover:border-ink/40 disabled:cursor-default disabled:opacity-40"
            disabled={state.axisLow === DEFAULT_AXIS_LOW && state.axisHigh === DEFAULT_AXIS_HIGH}
            onClick={resetFixedAxis}
          >
            リセット
          </button>
        </>
      )}
      {state.axisMode === "follow" && <OctaveWidth value={state.axisOctaves} onCommit={setAxisOctaves} />}
    </div>
  );
}

const NOTE_GROUPS = Array.from({ length: 11 }, (_, index) => {
  const octave = index - 1;
  const notes = Array.from({ length: 12 }, (_, pitchClass) => (octave + 1) * 12 + pitchClass).filter((midi) => midi <= 127);
  return { octave, notes };
});

function MidiBound({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const selected = String(Math.min(127, Math.max(0, Math.round(value))));
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-11 items-center gap-2 rounded-full border border-line bg-panel px-3 text-sm">
        <span className="text-muted">{label}</span>
        <input
          id={id}
          className="w-12 bg-transparent outline-none"
          type="number"
          min={0}
          max={127}
          step={1}
          aria-label={`${label}のMIDI`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const next = Number(text);
            if (!Number.isFinite(next)) {
              setText(String(value));
              return;
            }
            onCommit(next);
          }}
        />
      </div>
      <select
        id={`${id}-note`}
        className="h-11 rounded-full border border-line bg-panel px-3 text-base md:text-sm"
        aria-label={`${label}の音名`}
        value={selected}
        onChange={(event) => onCommit(Number(event.target.value))}
      >
        {NOTE_GROUPS.map((group) => (
          <optgroup key={group.octave} label={`${group.octave}オクターブ`}>
            {group.notes.map((midi) => (
              <option key={midi} value={String(midi)}>
                {noteName(midi)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function OctaveWidth({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="flex h-11 items-center gap-2 rounded-full border border-line bg-panel px-3 text-sm" htmlFor="axis-octaves">
      <span className="text-muted">幅</span>
      <input
        id="axis-octaves"
        className="w-12 bg-transparent outline-none"
        type="number"
        min={1}
        max={5}
        step={0.5}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const next = Number(text);
          if (!Number.isFinite(next)) {
            setText(String(value));
            return;
          }
          onCommit(next);
        }}
      />
      <span className="text-muted">oct</span>
    </label>
  );
}

function RecordingList({ state, open, onClose }: { state: Snapshot; open: boolean; onClose: () => void }) {
  return (
    <>
      <aside className="hidden w-60 shrink-0 flex-col border-l border-line md:flex" aria-label="保存した録音">
        <RecordingEntries state={state} />
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
            <RecordingEntries state={state} />
          </aside>
        </div>
      ) : null}
    </>
  );
}

function RecordingEntries({ state }: { state: Snapshot }) {
  return (
    <>
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
    </>
  );
}

function ViewIcon({ id }: { id: ViewId }) {
  if (id === "ribbon") return <RibbonIcon />;
  if (id === "loudness") return <LoudnessIcon />;
  return <PitchIcon />;
}

function PitchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18h18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <path d="M4 15.5c2.2-.6 3.2-7 5.4-7s1.6 4.2 3.8 4.2 2.6-6.2 5.6-7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function RibbonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 15.5c2.2-.6 3.2-7 5.4-7s1.6 4.2 3.8 4.2 2.6-6.2 5.6-7.2" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" opacity="0.28" />
      <path d="M4 15.5c2.2-.6 3.2-7 5.4-7s1.6 4.2 3.8 4.2 2.6-6.2 5.6-7.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function LoudnessIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="16" r="1.35" fill="currentColor" opacity="0.4" />
      <circle cx="11" cy="11.5" r="1.7" fill="currentColor" opacity="0.7" />
      <circle cx="15.5" cy="7.5" r="2.15" fill="currentColor" />
      <circle cx="18.5" cy="14" r="1.25" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
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
  className = "",
  children,
}: {
  label: string;
  disabled?: boolean;
  pressed?: boolean;
  live?: "accent" | "record" | "play";
  onClick: () => void;
  className?: string;
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
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full border disabled:cursor-default disabled:opacity-40 md:size-11 [&_svg]:size-5 ${tone} ${className}`}
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
  useEffect(() => {
    if (open) void refreshMics();
  }, [open]);
  const selectedMissing = state.micId !== "" && !state.mics.some((mic) => mic.id === state.micId);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/55" />
        <Dialog.Content className="fixed top-1/2 left-1/2 max-h-[min(40rem,calc(100dvh-2rem))] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-bg p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg">設定</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                検出と、描画の切り替えです。音程の見方と範囲は画面下で選べます。
              </Dialog.Description>
            </div>
            <Dialog.Close className="h-9 rounded-full border border-line px-3 text-sm hover:border-ink/40">閉じる</Dialog.Close>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className="text-muted">マイク</span>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-line bg-panel px-3"
                value={state.micId}
                disabled={state.recording}
                onChange={(event) => void setMic(event.target.value)}
              >
                <option value="">既定のマイク</option>
                {state.mics.map((mic) => (
                  <option key={mic.id} value={mic.id}>
                    {mic.label}
                  </option>
                ))}
                {selectedMissing ? <option value={state.micId}>前回のマイク</option> : null}
              </select>
            </label>
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
