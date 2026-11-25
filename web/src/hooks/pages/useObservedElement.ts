/**
 * Callback-ref ResizeObserver hook for conditionally mounted containers.
 *
 * Uses state-backed node tracking so the observer attaches as soon as a gated
 * element mounts, disconnects cleanly on unmount, and optionally re-measures
 * across two animation frames when layout keys change.
 */
import { useEffect, useEffectEvent, useLayoutEffect, useState } from "react";
import { useDepsVersion } from "../useAsyncResource";

const EMPTY_DEPS: readonly unknown[] = [];

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
  const depsVersion = useDepsVersion(options?.deps ?? EMPTY_DEPS);
  const remeasureFrames = options?.remeasureFrames ?? false;
  const remeasureKey = options?.remeasureKey;
  const measureNode = useEffectEvent(onMeasure);

  useLayoutEffect(() => {
    if (!node || depsVersion < 0) return undefined;
    measureNode(node);

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measureNode(node));
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [node, depsVersion]);

  useEffect(() => {
    if (!node || !remeasureFrames || depsVersion < 0 || remeasureKey === null) {
      return undefined;
    }
    let frameOne = 0;
    let frameTwo = 0;

    frameOne = requestAnimationFrame(() => {
      measureNode(node);
      frameTwo = requestAnimationFrame(() => {
        measureNode(node);
      });
    });

    return (): void => {
      cancelAnimationFrame(frameOne);
      cancelAnimationFrame(frameTwo);
    };
  }, [node, remeasureFrames, remeasureKey, depsVersion]);

  return setNode;
}
