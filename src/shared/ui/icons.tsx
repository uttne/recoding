import type { ViewId } from "@/entities/session/model/preferences";

export function PitchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 18h18" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <path d="M4 15.5c2.2-.6 3.2-7 5.4-7s1.6 4.2 3.8 4.2 2.6-6.2 5.6-7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function RibbonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 15.5c2.2-.6 3.2-7 5.4-7s1.6 4.2 3.8 4.2 2.6-6.2 5.6-7.2" fill="none" stroke="currentColor" strokeWidth="5.5" strokeLinecap="round" opacity="0.28" />
      <path d="M4 15.5c2.2-.6 3.2-7 5.4-7s1.6 4.2 3.8 4.2 2.6-6.2 5.6-7.2" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function LoudnessIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="16" r="1.35" fill="currentColor" opacity="0.4" />
      <circle cx="11" cy="11.5" r="1.7" fill="currentColor" opacity="0.7" />
      <circle cx="15.5" cy="7.5" r="2.15" fill="currentColor" />
      <circle cx="18.5" cy="14" r="1.25" fill="currentColor" opacity="0.5" />
    </svg>
  );
}

export function ViewIcon({ id }: { id: ViewId }) {
  if (id === "ribbon") return <RibbonIcon />;
  if (id === "loudness") return <LoudnessIcon />;
  return <PitchIcon />;
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
