import type { ReactNode } from "react";

export function Footer({ leading, axis, trailing }: { leading: ReactNode; axis: ReactNode; trailing: ReactNode }) {
  return (
    <footer className="flex max-h-[45dvh] flex-col gap-2 overflow-y-auto border-t border-line px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:max-h-none md:flex-row md:flex-wrap md:items-center md:overflow-visible">
      <div className="flex min-w-0 flex-wrap items-center gap-2">{leading}</div>
      <div className="flex flex-wrap items-center gap-2">{axis}</div>
      <div className="flex flex-wrap items-center gap-1.5 md:ml-auto md:gap-2">{trailing}</div>
    </footer>
  );
}
