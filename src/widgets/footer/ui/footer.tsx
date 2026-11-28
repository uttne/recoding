import { useId, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

export function Footer({
  primary,
  secondary,
  defaultOpen = false,
}: {
  primary: ReactNode;
  secondary: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const label = open ? "その他の操作を閉じる" : "その他の操作";

  function toggle() {
    const panel = panelRef.current;
    const active = document.activeElement;
    const returnFocus = open && panel !== null && active instanceof Node && panel.contains(active);
    setOpen((value) => !value);
    if (returnFocus) toggleRef.current?.focus();
  }

  return (
    <footer className="flex min-w-0 shrink-0 flex-col-reverse gap-2 border-t border-line px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{primary}</div>
        <Button
          ref={toggleRef}
          type="button"
          className={cn(
            "h-10 w-10 px-0 hover:border-ink/40 md:h-11 md:w-auto md:gap-1.5 md:px-3",
            open && "border-ink/40 bg-ink/10",
          )}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={label}
          title={label}
          onClick={toggle}
        >
          <MoreHorizontal />
          <span className="hidden md:inline">その他</span>
        </Button>
      </div>
      <div
        ref={panelRef}
        id={panelId}
        role="region"
        aria-label="その他の操作"
        className={cn(
          "flex max-h-[min(16rem,40dvh)] min-w-0 flex-wrap items-center gap-2 overflow-y-auto overscroll-contain",
          !open && "hidden",
        )}
      >
        {secondary}
      </div>
    </footer>
  );
}
