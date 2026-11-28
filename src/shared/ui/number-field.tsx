import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";

export function NumberField({
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
      className={cn("bg-transparent outline-none", align === "right" ? "w-20 text-right" : "min-w-0 flex-1")}
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
