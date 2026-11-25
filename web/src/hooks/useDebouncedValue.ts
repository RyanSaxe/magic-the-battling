import { useEffect, useState } from "react";

/** The value once it has stopped changing for delayMs, so typing sends one request, not one per key. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return (): void => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
