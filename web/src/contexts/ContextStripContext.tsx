import {
  useState,
  useCallback,
  useMemo,
  type ReactElement,
  type ReactNode,
} from "react";
import type { Card } from "../types";
import { ContextStripContext } from "./contextStripState";

export function ContextStripProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [previewCard, setPreviewCardState] = useState<Card | null>(null);
  const [previewAppliedUpgrades, setPreviewAppliedUpgrades] = useState<Card[]>(
    [],
  );
  const [previewCounters, setPreviewCounters] =
    useState<Record<string, number>>();

  const setPreviewCard = useCallback(
    (
      card: Card | null,
      appliedUpgrades?: Card[],
      counters?: Record<string, number>,
    ) => {
      setPreviewCardState(card);
      setPreviewAppliedUpgrades(appliedUpgrades ?? []);
      setPreviewCounters(counters);
    },
    [],
  );

  const value = useMemo(
    () => ({
      state: { previewCard, previewAppliedUpgrades, previewCounters },
      setPreviewCard,
    }),
    [previewCard, previewAppliedUpgrades, previewCounters, setPreviewCard],
  );

  return (
    <ContextStripContext.Provider value={value}>
      {children}
    </ContextStripContext.Provider>
  );
}
