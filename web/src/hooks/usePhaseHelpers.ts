/**
 * Phase-specific DOM/synchronization hooks for Battle and Build boards.
 *
 * Encapsulates layout-metric reporting, optimistic hand-move guards, and initial
 * basic-land hydration so phase components declare zero direct effects.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
} from "react";

export interface BattleLayoutMetrics {
  topSectionHeight: number;
  middleLaneHeight: number;
}

export function useBattleLayoutMetricsSync(
  topSectionHeight: number,
  middleLaneHeight: number,
  onLayoutMetricsChange?: (metrics: BattleLayoutMetrics) => void,
): void {
  const report = useEffectEvent((metrics: BattleLayoutMetrics) => {
    onLayoutMetricsChange?.(metrics);
  });

  useLayoutEffect(() => {
    report({ topSectionHeight, middleLaneHeight });
  }, [topSectionHeight, middleLaneHeight]);
}

interface UseBuildPhaseSyncOptions {
  handSlotIds: (string | null)[];
  handLength: number;
  sideboardLength: number;
  maxHandSize: number;
  chosenBasics: readonly string[] | undefined;
  selectedBasicsCount: number;
  hasUserInteracted: boolean;
  onHandSlotsChange?: (slots: (string | null)[]) => void;
  onHydrateBasics: (basics: string[]) => void;
}

export function useBuildPhaseSync({
  handSlotIds,
  handLength,
  sideboardLength,
  maxHandSize,
  chosenBasics,
  selectedBasicsCount,
  hasUserInteracted,
  onHandSlotsChange,
  onHydrateBasics,
}: UseBuildPhaseSyncOptions): { tryQueueSideboardToHandMove: () => boolean } {
  const pendingHandAddsRef = useRef(0);
  const pendingTimeoutRef = useRef<number | null>(null);

  const reportHandSlots = useEffectEvent((slots: (string | null)[]) => {
    onHandSlotsChange?.(slots);
  });
  const hydrateBasics = useEffectEvent((basics: string[]) => {
    onHydrateBasics(basics);
  });

  useEffect(() => {
    reportHandSlots(handSlotIds);
  }, [handSlotIds]);

  const clearPendingHandAdds = useCallback(() => {
    pendingHandAddsRef.current = 0;
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (handLength >= 0 && sideboardLength >= 0) {
      clearPendingHandAdds();
    }
  }, [handLength, sideboardLength, clearPendingHandAdds]);

  useEffect(() => (): void => clearPendingHandAdds(), [clearPendingHandAdds]);

  useEffect(() => {
    if (
      !hasUserInteracted &&
      chosenBasics?.length &&
      selectedBasicsCount === 0
    ) {
      hydrateBasics([...chosenBasics]);
    }
  }, [chosenBasics, hasUserInteracted, selectedBasicsCount]);

  const tryQueueSideboardToHandMove = useCallback(() => {
    const availableSlots =
      maxHandSize - handLength - pendingHandAddsRef.current;
    if (availableSlots <= 0) return false;

    pendingHandAddsRef.current += 1;
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
    }
    // Fallback so a dropped or failed server response cannot leave the optimistic guard stuck.
    pendingTimeoutRef.current = window.setTimeout(() => {
      pendingHandAddsRef.current = 0;
      pendingTimeoutRef.current = null;
    }, 2000);
    return true;
  }, [handLength, maxHandSize]);

  return { tryQueueSideboardToHandMove };
}
