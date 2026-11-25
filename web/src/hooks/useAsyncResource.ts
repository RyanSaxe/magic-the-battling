/**
 * Abort-safe async resource loading, polling, and pending-action hooks.
 *
 * Centralizes fetch lifecycle management so UI components never declare direct
 * `useEffect` fetchers or `try ... finally` loading toggles.
 */
import { useCallback, useEffect, useEffectEvent, useState } from "react";

export interface AsyncResourceState<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

interface UseAsyncResourceOptions<T> {
  enabled?: boolean;
  initialData?: T;
}

export function useDepsVersion(deps: readonly unknown[]): number {
  const [tracked, setTracked] = useState<{
    deps: readonly unknown[];
    version: number;
  }>({ deps, version: 0 });
  const changed =
    tracked.deps.length !== deps.length ||
    deps.some((value, index) => !Object.is(value, tracked.deps[index]));
  if (changed) {
    const next = { deps, version: tracked.version + 1 };
    setTracked(next);
    return next.version;
  }
  return tracked.version;
}

export function useAsyncResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  options?: UseAsyncResourceOptions<T>,
): AsyncResourceState<T> {
  const enabled = options?.enabled ?? true;
  const depsVersion = useDepsVersion(deps);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    data: T | undefined;
    error: unknown;
    loading: boolean;
  }>(() => ({
    data: options?.initialData,
    error: null,
    loading: enabled,
  }));

  const runLoad = useEffectEvent((signal: AbortSignal) => load(signal));

  useEffect(() => {
    if (!enabled || attempt < 0 || depsVersion < 0) return undefined;
    const controller = new AbortController();
    let cancelled = false;

    runLoad(controller.signal).then(
      (data) => {
        if (!cancelled) {
          setState({ data, error: null, loading: false });
        }
      },
      (error: unknown) => {
        if (!cancelled && !controller.signal.aborted) {
          setState((prev) => ({ data: prev.data, error, loading: false }));
        }
      },
    );

    return (): void => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, attempt, depsVersion]);

  const reload = useCallback(() => {
    setState((prev) => ({ data: prev.data, error: null, loading: true }));
    setAttempt((value) => value + 1);
  }, []);

  return {
    data: state.data,
    error: state.error,
    loading: enabled ? state.loading : false,
    reload,
  };
}

interface UsePollingResourceOptions {
  intervalMs: number;
  maxConsecutiveFailures?: number;
  shouldStopOnError?: (error: unknown) => boolean;
  enabled?: boolean;
}

export function usePollingResource<T>(
  load: () => Promise<T>,
  deps: readonly unknown[],
  options: UsePollingResourceOptions,
): AsyncResourceState<T> {
  const enabled = options.enabled ?? true;
  const maxFailures = options.maxConsecutiveFailures ?? 3;
  const depsVersion = useDepsVersion(deps);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    data: T | undefined;
    error: unknown;
    loading: boolean;
  }>({
    data: undefined,
    error: null,
    loading: enabled,
  });

  const runLoad = useEffectEvent(() => load());
  const checkStop = useEffectEvent(
    (error: unknown) => options.shouldStopOnError?.(error) ?? false,
  );

  useEffect(() => {
    if (!enabled || attempt < 0 || depsVersion < 0) return undefined;
    let intervalId: number | null = null;
    let failures = 0;
    let cancelled = false;

    const stopPolling = (): void => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const fetchOnce = (): void => {
      runLoad().then(
        (data) => {
          failures = 0;
          if (!cancelled) {
            setState({ data, error: null, loading: false });
          }
        },
        (error: unknown) => {
          failures += 1;
          if (checkStop(error) || failures >= maxFailures) {
            stopPolling();
            if (!cancelled) {
              setState((prev) => ({ data: prev.data, error, loading: false }));
            }
          }
        },
      );
    };

    fetchOnce();
    intervalId = window.setInterval(fetchOnce, options.intervalMs);

    return (): void => {
      cancelled = true;
      stopPolling();
    };
  }, [enabled, attempt, options.intervalMs, maxFailures, depsVersion]);

  const reload = useCallback(() => {
    setState((prev) => ({ data: prev.data, error: null, loading: true }));
    setAttempt((value) => value + 1);
  }, []);

  return {
    data: state.data,
    error: state.error,
    loading: enabled ? state.loading : false,
    reload,
  };
}

/**
 * Wraps an async callback with a boolean `pending` flag that always settles
 * without requiring `try ... finally` blocks inside TSX components.
 */
export function useAsyncAction<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult>;
  pending: boolean;
} {
  const [pending, setPending] = useState(false);

  const run = useCallback(
    (...args: TArgs): Promise<TResult> => {
      setPending(true);
      return action(...args).then(
        (value) => {
          setPending(false);
          return value;
        },
        (error: unknown) => {
          setPending(false);
          return Promise.reject(error);
        },
      );
    },
    [action],
  );

  return { run, pending };
}
