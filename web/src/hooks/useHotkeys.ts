/**
 * Keyboard shortcut binding hook using React 19.2 `useEffectEvent` so callers
 * pass fresh hotkey maps without ref-sync effects.
 */
import { useEffect, useEffectEvent } from "react";
import { enterMayAdvance, enterPressesControl } from "../utils/enterKey";

type HotkeyMap = Record<string, () => void>;

export function hotkeyFor(key: string): string {
  return key === "Enter" ? "Enter" : key.toLowerCase();
}

export function useHotkeys(hotkeys: HotkeyMap, enabled = true): void {
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const target = e.target;
    const element = target instanceof HTMLElement ? target : null;
    const tag = element?.tagName;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      element?.isContentEditable
    ) {
      return;
    }
    if (enterPressesControl(e)) return;

    const action = hotkeys[hotkeyFor(e.key)];
    if (action) {
      e.preventDefault();
      if (e.key === "Enter" && !enterMayAdvance(e)) return;
      action();
    }
  });

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
