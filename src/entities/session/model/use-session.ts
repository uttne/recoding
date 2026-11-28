import { useRef, useSyncExternalStore } from "react";
import { getSnapshot, subscribe, type Snapshot } from "./session";

export function useSession(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Re-render only when the selected value changes by Object.is. */
export function useSessionSlice<T>(select: (snapshot: Snapshot) => T): T {
  const selectRef = useRef(select);
  selectRef.current = select;
  const cache = useRef<T>(select(getSnapshot()));
  return useSyncExternalStore(
    subscribe,
    () => {
      const next = selectRef.current(getSnapshot());
      if (Object.is(cache.current, next)) return cache.current;
      cache.current = next;
      return next;
    },
    () => select(getSnapshot()),
  );
}
