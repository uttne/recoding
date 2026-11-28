import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn("h-11 w-full rounded-xl border border-line bg-panel px-3 text-sm outline-none", className)}
      {...props}
    />
  );
}

export { Input };
