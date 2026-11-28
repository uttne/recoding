import { setView } from "@/entities/session/model/session";
import { useSessionSlice } from "@/entities/session/model/use-session";
import { ViewTabs } from "./view-tabs";

export function ViewSwitch() {
  const view = useSessionSlice((state) => state.view);
  return <ViewTabs value={view} onChange={setView} />;
}
