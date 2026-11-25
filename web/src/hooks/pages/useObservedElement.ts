/**
 * Callback-ref ResizeObserver hook for conditionally mounted containers.
 *
 * Uses state-backed node tracking so the observer attaches as soon as a gated
 * element mounts, disconnects cleanly on unmount, and optionally re-measures
 * across two animation frames when layout keys change.
 */
import { useEffect, useEffectEvent, useLayoutEffect, useState } from "react";

interface UseObservedElementOptions {
  deps?: readonly unknown[];
  remeasureFrames?: boolean;
  remeasureKey?: string;
}

export function useObservedElement<T extends HTMLElement>(
  onMeasure: (node: T) => void,
  options?: UseObservedElementOptions,
): (node: T | null) => void {
  const [node, setNode] = useState<T | null>(null);
  const deps = options?.deps ?? [];
  const remeasureFrames = options?.remeasureFrames ?? false;
  const remeasureKey = options?.remeasureKey;
  const measureNode = useEffectEvent(onMeasure);

  useLayoutEffect(() => {
    if (!node) return;
    measureNode(node);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measureNode(node));
    observer.observe(node);
    return () => observer.disconnect();
    // Callers pass layout-affecting triggers via `options.deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, ...deps]);

  useEffect(() => {
    if (!node || !remeasureFrames) return;
    let frameOne = 0;
    let frameTwo = 0;

    frameOne = requestAnimationFrame(() => {
      measureNode(node);
      frameTwo = requestAnimationFrame(() => {
        measureNode(node);
      });
    });

    return () => {
      cancelAnimationFrame(frameOne);
      cancelAnimationFrame(frameTwo);
    };
    // Callers pass re-measurement triggers via `remeasureKey` and `options.deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, remeasureFrames, remeasureKey, ...deps]);

  return setNode;
}
