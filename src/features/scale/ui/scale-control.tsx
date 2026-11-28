import { setScale } from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { ScaleSelect } from "./scale-select";

export function ScaleControl() {
  const scaleId = useSessionSlice((state) => state.scaleId);
  return <ScaleSelect value={scaleId} onChange={setScale} />;
}
