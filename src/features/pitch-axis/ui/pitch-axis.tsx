import {
  DEFAULT_AXIS_HIGH,
  DEFAULT_AXIS_LOW,
  resetFixedAxis,
  setAxisHigh,
  setAxisLow,
  setAxisMode,
  setAxisOctaves,
} from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { PitchAxisControl } from "./pitch-axis-control";

export function PitchAxis() {
  const mode = useSessionSlice((state) => state.axisMode);
  const low = useSessionSlice((state) => state.axisLow);
  const high = useSessionSlice((state) => state.axisHigh);
  const octaves = useSessionSlice((state) => state.axisOctaves);
  return (
    <PitchAxisControl
      mode={mode}
      low={low}
      high={high}
      octaves={octaves}
      onMode={setAxisMode}
      onLow={setAxisLow}
      onHigh={setAxisHigh}
      onOctaves={setAxisOctaves}
      onReset={resetFixedAxis}
      resetDisabled={low === DEFAULT_AXIS_LOW && high === DEFAULT_AXIS_HIGH}
    />
  );
}
