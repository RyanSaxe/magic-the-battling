import { useState, useCallback } from "react";
import type { ZoneConstraints } from "./computeConstrainedLayout";

function loadConstraints(key: string): ZoneConstraints | null {
  try {
    const raw = localStorage.getItem(`mtb_zone_constraints:${key}`);
    return raw ? (JSON.parse(raw) as ZoneConstraints) : null;
  } catch {
    return null;
  }
}

export function usePersistedConstraints(
  storageKey: string | null,
): [ZoneConstraints | null, (c: ZoneConstraints) => void, () => void] {
  const [constraints, setConstraintsState] = useState<ZoneConstraints | null>(
    () => (storageKey ? loadConstraints(storageKey) : null),
  );

  const setConstraints = useCallback(
    (c: ZoneConstraints) => {
      setConstraintsState(c);
      if (storageKey) {
        localStorage.setItem(`mtb_zone_constraints:${storageKey}`, JSON.stringify(c));
      }
    },
    [storageKey],
  );

  const clearConstraints = useCallback(() => {
    setConstraintsState(null);
    if (storageKey) {
      localStorage.removeItem(`mtb_zone_constraints:${storageKey}`);
    }
  }, [storageKey]);

  return [constraints, setConstraints, clearConstraints];
}
