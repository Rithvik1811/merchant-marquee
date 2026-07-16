import { useCallback, useState } from "react";

type Patch<T> = Partial<T> | ((s: T) => Partial<T>);

// Mirrors React class components' this.setState: merges a partial object (or the
// partial object returned by an updater function) into existing state.
export function useMergeState<T extends object>(initial: T | (() => T)) {
  const [state, setState] = useState<T>(initial);
  const merge = useCallback((patch: Patch<T>) => {
    setState((prev) => ({ ...prev, ...(typeof patch === "function" ? (patch as (s: T) => Partial<T>)(prev) : patch) }));
  }, []);
  return [state, merge] as const;
}
