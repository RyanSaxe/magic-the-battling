/**
 * React hook binding ResizeObserver measurements to the pure Battle (Fight)
 * layout engine in web/src/layout/battleLayout.ts.
 */
import { useState, useCallback, useRef, useLayoutEffect } from "react";
import {
  BATTLEFIELD_INSET,
  battleDimsEqual,
  computeBattleZones,
  makeInitialBattleDims,
  measureContentBox,
  resolveBattleConfig,
  type BattleZoneConfig,
  type BattleZoneDims,
  type ContainerSize,
} from "../layout";

export { BATTLEFIELD_INSET, computeBattleZones };

export function useBattleCardSizes(
  config: BattleZoneConfig,
): [React.RefCallback<HTMLElement>, BattleZoneDims] {
  const resolved = resolveBattleConfig(config);

  const [dims, setDims] = useState<BattleZoneDims>(() =>
    makeInitialBattleDims(
      resolved.handGap,
      resolved.handMaxWidth,
      resolved.battlefieldMaxWidth,
    ),
  );

  const resolvedRef = useRef(resolved);
  const observerRef = useRef<ResizeObserver | null>(null);
  const measuredRef = useRef<ContainerSize | null>(null);

  const applySize = useCallback((width: number, height: number) => {
    const next = computeBattleZones(width, height, resolvedRef.current);
    setDims((prev) => (battleDimsEqual(prev, next) ? prev : next));
  }, []);

  const measure = useCallback(
    (node: HTMLElement) => {
      measuredRef.current = measureContentBox(node);
      applySize(measuredRef.current.width, measuredRef.current.height);
    },
    [applySize],
  );

  const refCallback = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      measuredRef.current = null;
      if (!node) return;

      measure(node);
      const observer = new ResizeObserver(() => measure(node));
      observer.observe(node);
      observerRef.current = observer;
    },
    [measure],
  );

  useLayoutEffect(() => {
    resolvedRef.current = resolved;
    if (measuredRef.current) {
      applySize(measuredRef.current.width, measuredRef.current.height);
    }
  });

  return [refCallback, dims];
}
