import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";

const DRAFT = /^-?\d*\.?\d*$/;

function decimalPlaces(step: number): number {
  const text = String(step);
  const index = text.indexOf(".");
  return index === -1 ? 0 : text.length - index - 1;
}

function formatField(value: number, step: number): string {
  if (step >= 1) return String(Math.round(value));
  return String(Number(value.toFixed(decimalPlaces(step))));
}

/** Incomplete drafts are not a number yet. An empty field is 0, matching the previous number input. */
function parseDraft(text: string): number | null {
  if (text === "-" || text === "." || text === "-.") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function draftBase(text: string, fallback: number): number {
  return parseDraft(text) ?? fallback;
}

function stepped(base: number, direction: -1 | 1, step: number): number {
  return Number((base + direction * step).toFixed(decimalPlaces(step)));
}

export function NumberField({
  value,
  min,
  max,
  step = 1,
  onCommit,
  align = "left",
  id,
  inputLabel,
  commitOutside = false,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onCommit: (value: number) => void;
  align?: "left" | "right";
  id?: string;
  inputLabel?: string;
  /** Blur commits a finite number outside min/max. The owner clamps it. */
  commitOutside?: boolean;
}) {
  const [text, setText] = useState(() => formatField(value, step));
  const textRef = useRef(text);
  const editing = useRef(false);

  useEffect(() => {
    if (editing.current) return;
    const shown = formatField(value, step);
    textRef.current = shown;
    setText(shown);
  }, [value, step]);

  function show(next: string) {
    textRef.current = next;
    setText(next);
  }

  function stepResult(current: string, direction: -1 | 1): number | null {
    const base = draftBase(current, value);
    const raw = stepped(base, direction, step);
    if (raw < min || raw > max) return null;
    const next = Number(formatField(raw, step));
    if (next < min || next > max || next === base) return null;
    return next;
  }

  function commitStep(direction: -1 | 1) {
    const next = stepResult(textRef.current, direction);
    if (next === null) return;
    editing.current = false;
    show(formatField(next, step));
    onCommit(next);
  }

  const canDecrease = stepResult(text, -1) !== null;
  const canIncrease = stepResult(text, 1) !== null;
  const decreaseLabel = inputLabel ? `${inputLabel}を下げる` : "下げる";
  const increaseLabel = inputLabel ? `${inputLabel}を上げる` : "上げる";

  return (
    <div className={cn("flex items-center", align === "right" ? "shrink-0" : "min-w-0 flex-1")}>
      <StepButton label={decreaseLabel} direction="down" disabled={!canDecrease} onStep={() => commitStep(-1)} />
      <input
        id={id}
        className={cn("bg-transparent outline-none", align === "right" ? "w-14 text-right" : "min-w-12 flex-1")}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-label={inputLabel}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          if (!DRAFT.test(next)) return;
          editing.current = true;
          show(next);
        }}
        onBlur={() => {
          editing.current = false;
          const next = parseDraft(textRef.current);
          if (next === null || (!commitOutside && (next < min || next > max))) {
            show(formatField(value, step));
            return;
          }
          show(formatField(next, step));
          onCommit(next);
        }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          commitStep(event.key === "ArrowUp" ? 1 : -1);
        }}
      />
      <StepButton label={increaseLabel} direction="up" disabled={!canIncrease} onStep={() => commitStep(1)} />
    </div>
  );
}

function StepButton({
  label,
  direction,
  disabled,
  onStep,
}: {
  label: string;
  direction: "up" | "down";
  disabled: boolean;
  onStep: () => void;
}) {
  const Icon = direction === "up" ? ChevronUp : ChevronDown;
  const steppedAt = useRef(0);
  return (
    <button
      type="button"
      className="inline-flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-line bg-panel text-ink select-none hover:border-ink/40 disabled:cursor-default disabled:opacity-40"
      aria-label={label}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        // Keep the caret so a touch steps once instead of only blurring the field.
        event.preventDefault();
        steppedAt.current = event.timeStamp;
        onStep();
      }}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.timeStamp - steppedAt.current < 500) return;
        onStep();
      }}
    >
      <Icon className="size-5" aria-hidden />
    </button>
  );
}
