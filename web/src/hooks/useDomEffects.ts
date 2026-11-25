/**
 * Reusable DOM, event, timer, observer, and storage synchronization hooks.
 *
 * Uses React 19.2 `useEffectEvent` so callers pass fresh handlers without
 * ref-sync effects or direct `useEffect`/`useLayoutEffect` calls in UI files.
 */
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  type RefObject,
} from "react";

interface ListenerOptions {
  enabled?: boolean;
  capture?: boolean;
  passive?: boolean;
}

export function useWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: ListenerOptions,
): void {
  const enabled = options?.enabled ?? true;
  const capture = options?.capture ?? false;
  const passive = options?.passive;
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;
    const listenerOptions: AddEventListenerOptions =
      passive === undefined ? { capture } : { capture, passive };
    window.addEventListener(type, onEvent, listenerOptions);
    return () => window.removeEventListener(type, onEvent, listenerOptions);
  }, [type, enabled, capture, passive]);
}

export function useDocumentEvent<K extends keyof DocumentEventMap>(
  type: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: ListenerOptions,
): void {
  const enabled = options?.enabled ?? true;
  const capture = options?.capture ?? false;
  const passive = options?.passive;
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;
    const listenerOptions: AddEventListenerOptions =
      passive === undefined ? { capture } : { capture, passive };
    document.addEventListener(type, onEvent, listenerOptions);
    return () => document.removeEventListener(type, onEvent, listenerOptions);
  }, [type, enabled, capture, passive]);
}

export function useEscapeKey(
  onEscape: (event: KeyboardEvent) => void,
  options?: {
    enabled?: boolean;
    capture?: boolean;
    target?: "window" | "document";
  },
): void {
  const enabled = options?.enabled ?? true;
  const capture = options?.capture ?? false;
  const target = options?.target ?? "window";
  const handleEscape = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    onEscape(event);
  });

  useEffect(() => {
    if (!enabled) return;
    if (target === "document") {
      document.addEventListener("keydown", handleEscape, capture);
      return () =>
        document.removeEventListener("keydown", handleEscape, capture);
    }
    window.addEventListener("keydown", handleEscape, capture);
    return () => window.removeEventListener("keydown", handleEscape, capture);
  }, [enabled, capture, target]);
}

export function useViewportSync(onSync: () => void, enabled = true): void {
  const handleSync = useEffectEvent(onSync);

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("resize", handleSync);
    window.visualViewport?.addEventListener("resize", handleSync);
    window.visualViewport?.addEventListener("scroll", handleSync);
    return () => {
      window.removeEventListener("resize", handleSync);
      window.visualViewport?.removeEventListener("resize", handleSync);
      window.visualViewport?.removeEventListener("scroll", handleSync);
    };
  }, [enabled]);
}

export function useResizeObserver(
  ref: RefObject<HTMLElement | null>,
  onMeasure: (node: HTMLElement) => void,
  enabled = true,
  deps: readonly unknown[] = [],
): void {
  const measure = useEffectEvent(onMeasure);

  useLayoutEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;

    measure(node);

    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure(node));
    observer.observe(node);
    return () => observer.disconnect();
    // Callers pass layout-affecting triggers via `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled, ...deps]);
}

export function useLayoutMeasure(
  ref: RefObject<HTMLElement | null>,
  onMeasure: (node: HTMLElement) => void,
  deps: readonly unknown[],
  enabled = true,
): void {
  const measure = useEffectEvent(onMeasure);

  useLayoutEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node) return;
    measure(node);
    // Callers pass geometry dependencies via `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, enabled, ...deps]);
}

export function useInterval(
  callback: () => void,
  delayMs: number | null,
): void {
  const onTick = useEffectEvent(callback);

  useEffect(() => {
    if (delayMs === null) return;
    const id = window.setInterval(() => onTick(), delayMs);
    return () => window.clearInterval(id);
  }, [delayMs]);
}

export function useTimeout(
  callback: () => void,
  delayMs: number | null,
  resetKey?: unknown,
): void {
  const onFire = useEffectEvent(callback);

  useEffect(() => {
    if (delayMs === null) return;
    const id = window.setTimeout(() => onFire(), delayMs);
    return () => window.clearTimeout(id);
  }, [delayMs, resetKey]);
}

export function useBodyDragCursor(active: boolean, cursor = "grabbing"): void {
  useEffect(() => {
    if (!active) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [active, cursor]);
}

export function useAutoFocus(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;
    ref.current?.focus();
  }, [ref, enabled]);
}

export function useLocalStorageSync(key: string, value: string | null): void {
  useEffect(() => {
    if (value === null) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Best effort only.
    }
  }, [key, value]);
}
