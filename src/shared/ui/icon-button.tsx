import type { ReactNode } from "react";
import { Button } from "@/shared/ui/button";

export function IconButton({
  label,
  disabled,
  pressed,
  live,
  onClick,
  className,
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
  return (
    <Button
      type="button"
      variant={live ?? "icon"}
      className={className}
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
