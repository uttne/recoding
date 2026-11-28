import { useEffect, useRef } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { bindMeter } from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { IconButton } from "@/shared/ui/icon-button";

export function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  const chord = useSessionSlice((state) => state.chord);
  const note = useSessionSlice((state) => state.note);
  const hz = useSessionSlice((state) => state.hz);
  const cents = useSessionSlice((state) => state.cents);
  const confidence = useSessionSlice((state) => state.confidence);
  const status = useSessionSlice((state) => state.status);
  return (
    <header className="flex h-[5.5rem] shrink-0 items-end justify-between gap-3 overflow-hidden px-3 pt-2 pb-2 sm:h-[6.5rem] sm:px-4 sm:pt-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs tracking-[0.14em] text-muted">ピッチ</p>
        <div className="mt-1 flex h-9 min-w-0 items-center gap-x-4 overflow-hidden sm:h-12">
          <p
            className={`min-w-0 max-w-[55%] truncate leading-none ${chord ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl"}`}
          >
            {note}
          </p>
          <p className="min-w-0 flex-1 truncate text-xs text-muted tabular-nums sm:text-sm">
            {hz}
            <span className="px-1.5 text-ink/30">/</span>
            {cents}
            <span className="px-1.5 text-ink/30">/</span>
            {confidence}
          </p>
        </div>
        <Meter />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <p className="line-clamp-2 max-w-28 text-right text-xs text-muted sm:max-w-56 sm:text-sm">{status}</p>
        <IconButton label="設定" onClick={onOpenSettings}>
          <SettingsIcon />
        </IconButton>
      </div>
    </header>
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
