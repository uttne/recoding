export function formatDuration(frames: number, sampleRate: number): string {
  const total = Math.max(0, Math.round(frames / Math.max(1, sampleRate)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
