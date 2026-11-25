import { createContext, useContext } from "react";
import type { Card } from "../types";

export interface ContextStripState {
  previewCard: Card | null;
  previewAppliedUpgrades: Card[];
  previewCounters: Record<string, number> | undefined;
}

export interface ContextStripContextValue {
  state: ContextStripState;
  setPreviewCard: (
    card: Card | null,
    appliedUpgrades?: Card[],
    counters?: Record<string, number>,
  ) => void;
}

export const ContextStripContext =
  createContext<ContextStripContextValue | null>(null);

export function useContextStrip() {
  const context = useContext(ContextStripContext);
  if (!context) {
    throw new Error(
      "useContextStrip must be used within a ContextStripProvider",
    );
  }
  return context;
}
