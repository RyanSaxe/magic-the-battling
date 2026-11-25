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
import { useDepsVersion } from "./useAsyncResource";

const EMPTY_DEPS: readonly unknown[] = [];

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
    if (!enabled) return undefined;
    const listenerOptions: AddEventListenerOptions =
      passive === undefined ? { capture } : { capture, passive };
    window.addEventListener(type, onEvent, listenerOptions);
    return (): void =>
      window.removeEventListener(type, onEvent, listenerOptions);
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
    if (!enabled) return undefined;
    const listenerOptions: AddEventListenerOptions =
      passive === undefined ? { capture } : { capture, passive };
    document.addEventListener(type, onEvent, listenerOptions);
    return (): void =>
      document.removeEventListener(type, onEvent, listenerOptions);
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
    if (!enabled) return undefined;
    if (target === "document") {
      document.addEventListener("keydown", handleEscape, capture);
      return (): void =>
        document.removeEventListener("keydown", handleEscape, capture);
    }
    window.addEventListener("keydown", handleEscape, capture);
    return (): void =>
      window.removeEventListener("keydown", handleEscape, capture);
  }, [enabled, capture, target]);
}

export function useViewportSync(onSync: () => void, enabled = true): void {
  const handleSync = useEffectEvent(onSync);

  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener("resize", handleSync);
    window.visualViewport?.addEventListener("resize", handleSync);
    window.visualViewport?.addEventListener("scroll", handleSync);
    return (): void => {
      window.removeEventListener("resize", handleSync);
      window.visualViewport?.removeEventListener("resize", handleSync);
      window.visualViewport?.removeEventListener("scroll", handleSync);
    };
  }, [enabled]);
}

export interface ObserveOptions {
  enabled?: boolean;
  deps?: readonly unknown[];
}

export function useResizeObserver(
  ref: RefObject<HTMLElement | null>,
  onMeasure: (node: HTMLElement) => void,
  options: ObserveOptions = {},
): void {
  const { enabled = true, deps = EMPTY_DEPS } = options;
  const measure = useEffectEvent(onMeasure);
  const depsVersion = useDepsVersion(deps);

  useLayoutEffect(() => {
    if (!enabled || depsVersion < 0) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    measure(node);

    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => measure(node));
    observer.observe(node);
    return (): void => observer.disconnect();
  }, [ref, enabled, depsVersion]);
}

export function useLayoutMeasure(
  ref: RefObject<HTMLElement | null>,
  onMeasure: (node: HTMLElement) => void,
  options: ObserveOptions = {},
): void {
  const { enabled = true, deps = EMPTY_DEPS } = options;
  const measure = useEffectEvent(onMeasure);
  const depsVersion = useDepsVersion(deps);

  useLayoutEffect(() => {
    if (!enabled || depsVersion < 0) return;
    const node = ref.current;
    if (!node) return;
    measure(node);
  }, [ref, enabled, depsVersion]);
}

export function useInterval(
  callback: () => void,
  delayMs: number | null,
): void {
  const onTick = useEffectEvent(callback);

  useEffect(() => {
    if (delayMs === null) return undefined;
    const id = window.setInterval(() => onTick(), delayMs);
    return (): void => window.clearInterval(id);
  }, [delayMs]);
}

export function useTimeout(
  callback: () => void,
  delayMs: number | null,
  resetKey?: unknown,
): void {
  const onFire = useEffectEvent(callback);

  useEffect(() => {
    const activeKey = resetKey;
    if (delayMs === null) return undefined;
    const id = window.setTimeout(() => {
      if (Object.is(activeKey, resetKey)) onFire();
    }, delayMs);
    return (): void => window.clearTimeout(id);
  }, [delayMs, resetKey]);
}

export function useBodyDragCursor(active: boolean, cursor = "grabbing"): void {
  useEffect(() => {
    if (!active) return undefined;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = cursor;
    return (): void => {
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
