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

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

export function useHotkeys(hotkeys: HotkeyMap, enabled = true): void {
  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (isEditableTarget(e.target) || enterPressesControl(e)) return;

    const action = hotkeys[hotkeyFor(e.key)];
    if (!action) return;
    e.preventDefault();
    if (e.key === "Enter" && !enterMayAdvance(e)) return;
    action();
  });

  useEffect(() => {
    if (!enabled) return undefined;
    window.addEventListener("keydown", handleKeyDown);
    return (): void => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
