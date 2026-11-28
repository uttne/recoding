import { memo, useEffect, useRef, type RefObject } from "react";
import { mountStage, type ViewId } from "@/entities/session/model/session";

export const Stage = memo(function Stage({ view }: { view: ViewId }) {
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
});

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
