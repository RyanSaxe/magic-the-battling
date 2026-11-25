import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

/** A list's first load: running, failed, or done with what it loaded. */
export type FirstLoad<T> =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "loaded"; value: T };

interface Run<T> {
  state: FirstLoad<T>;
  attempt: number;
}

function restarted<T>(run: Run<T>): Run<T> {
  return { state: { status: "loading" }, attempt: run.attempt + 1 };
}

/**
 * Loads once `enabled` is true and again on each retry. `load` must keep its identity between renders.
 * `update` changes what has loaded, such as when a record is added or removed. `updateOrReload` is for a change
 * the server already has: it changes what has loaded by then, or starts over a load that may have read before it.
 */
export function useFirstLoad<T>(
  load: () => Promise<T>,
  enabled: boolean,
): {
  state: FirstLoad<T>;
  update: Dispatch<SetStateAction<FirstLoad<T>>>;
  updateOrReload: (change: (value: T) => T) => void;
  retry: () => void;
} {
  const [{ state, attempt }, setRun] = useState<Run<T>>({
    state: { status: "loading" },
    attempt: 0,
  });

  useEffect(() => {
    if (!enabled || attempt < 0) return undefined;
    let cancelled = false;
    load().then(
      (value) => {
        if (!cancelled) {
          setRun((run) => ({ ...run, state: { status: "loaded", value } }));
        }
      },
      () => {
        if (!cancelled) {
          setRun((run) => ({ ...run, state: { status: "failed" } }));
        }
      },
    );
    return (): void => {
      cancelled = true;
    };
  }, [load, enabled, attempt]);

  const update: Dispatch<SetStateAction<FirstLoad<T>>> = (next) =>
    setRun((run) => ({
      ...run,
      state: typeof next === "function" ? next(run.state) : next,
    }));
  const updateOrReload = (change: (value: T) => T): void =>
    setRun((run) =>
      run.state.status === "loaded"
        ? {
            ...run,
            state: { status: "loaded", value: change(run.state.value) },
          }
        : restarted(run),
    );
  const retry = (): void => setRun(restarted);

  return { state, update, updateOrReload, retry };
}
