/**
 * Popover lifecycle, auto-open scheduling, and active-step scroll alignment
 * for `PhaseTimeline`.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Phase } from "../../constants/phases";

const PHASE_POPOVER_FADE_OUT_MS = 220;

interface AutoCloseConfig {
  phase: Phase;
  delayMs: number;
  id: number;
}

export interface UsePhaseTimelineSyncResult {
  popoverPhase: Phase | null;
  popoverAnchorRect: DOMRect | null;
  isPopoverClosing: boolean;
  openPopoverForPhase: (phase: Phase, autoCloseAfterMs?: number) => boolean;
  beginClosingPopover: () => void;
  closePopoverImmediately: () => void;
  bindPhaseButtonRef: (phase: Phase) => (el: HTMLButtonElement | null) => void;
  bindPhaseStepRef: (phase: Phase) => (el: HTMLDivElement | null) => void;
}

export function usePhaseTimelineSync({
  activeGamePhase,
  stepsOverflow,
  stepsRowRef,
  autoOpenPhase,
  autoOpenDurationMs,
  onAutoOpenHandled,
}: {
  activeGamePhase: Phase | null;
  stepsOverflow: boolean;
  stepsRowRef: RefObject<HTMLDivElement | null>;
  autoOpenPhase: Phase | null;
  autoOpenDurationMs: number;
  onAutoOpenHandled?: (phase: Phase) => void;
}): UsePhaseTimelineSyncResult {
  const [popoverPhase, setPopoverPhase] = useState<Phase | null>(null);
  const [popoverAnchorRect, setPopoverAnchorRect] = useState<DOMRect | null>(
    null,
  );
  const [isPopoverClosing, setIsPopoverClosing] = useState(false);
  const [autoCloseConfig, setAutoCloseConfig] =
    useState<AutoCloseConfig | null>(null);
  const autoCloseSeqRef = useRef(0);
  const phaseButtonRefs = useRef<Record<Phase, HTMLButtonElement | null>>({
    draft: null,
    build: null,
    battle: null,
    reward: null,
  });
  const phaseStepRefs = useRef<Record<Phase, HTMLDivElement | null>>({
    draft: null,
    build: null,
    battle: null,
    reward: null,
  });

  useLayoutEffect(() => {
    const row = stepsRowRef.current;
    const step = activeGamePhase
      ? phaseStepRefs.current[activeGamePhase]
      : null;
    if (!stepsOverflow || !row || !step) return;
    const fadeWidth = parseFloat(getComputedStyle(row).scrollPaddingRight);
    const stepEnd =
      step.getBoundingClientRect().right -
      row.getBoundingClientRect().left +
      row.scrollLeft;
    row.scrollLeft = Math.max(0, stepEnd + fadeWidth - row.clientWidth);
  }, [activeGamePhase, stepsOverflow, stepsRowRef]);

  const closePopoverImmediately = useCallback(() => {
    setAutoCloseConfig(null);
    setIsPopoverClosing(false);
    setPopoverPhase(null);
    setPopoverAnchorRect(null);
  }, []);

  const beginClosingPopover = useCallback(() => {
    if (!popoverPhase || isPopoverClosing) {
      return;
    }
    setAutoCloseConfig(null);
    setIsPopoverClosing(true);
  }, [isPopoverClosing, popoverPhase]);

  const openPopoverForPhase = useCallback(
    (phase: Phase, autoCloseAfterMs?: number): boolean => {
      const btn = phaseButtonRefs.current[phase];
      if (!btn) {
        return false;
      }
      setIsPopoverClosing(false);
      setPopoverAnchorRect(btn.getBoundingClientRect());
      setPopoverPhase(phase);
      if (autoCloseAfterMs && autoCloseAfterMs > 0) {
        autoCloseSeqRef.current += 1;
        setAutoCloseConfig({
          phase,
          delayMs: autoCloseAfterMs,
          id: autoCloseSeqRef.current,
        });
      } else {
        setAutoCloseConfig(null);
      }
      return true;
    },
    [],
  );

  const handleAutoCloseTick = useEffectEvent((targetPhase: Phase) => {
    setAutoCloseConfig(null);
    if (popoverPhase === targetPhase && !isPopoverClosing) {
      setIsPopoverClosing(true);
    }
  });

  useEffect(() => {
    if (!autoCloseConfig) return undefined;
    const timerId = window.setTimeout(() => {
      handleAutoCloseTick(autoCloseConfig.phase);
    }, autoCloseConfig.delayMs);
    return (): void => window.clearTimeout(timerId);
  }, [autoCloseConfig]);

  useEffect(() => {
    if (!isPopoverClosing) return undefined;
    const timerId = window.setTimeout(() => {
      setIsPopoverClosing(false);
      setPopoverPhase(null);
      setPopoverAnchorRect(null);
    }, PHASE_POPOVER_FADE_OUT_MS);
    return (): void => window.clearTimeout(timerId);
  }, [isPopoverClosing]);

  const attemptAutoOpen = useEffectEvent(
    (phase: Phase, durationMs: number): boolean => {
      if (!openPopoverForPhase(phase, durationMs)) return false;
      onAutoOpenHandled?.(phase);
      return true;
    },
  );

  useEffect(() => {
    if (
      !autoOpenPhase ||
      !activeGamePhase ||
      autoOpenPhase !== activeGamePhase
    ) {
      return undefined;
    }

    let cancelled = false;
    let retryId: number | null = null;
    const openId = window.setTimeout(() => {
      if (cancelled) return;
      if (attemptAutoOpen(autoOpenPhase, autoOpenDurationMs)) {
        return;
      }
      retryId = window.setTimeout(() => {
        if (cancelled) return;
        attemptAutoOpen(autoOpenPhase, autoOpenDurationMs);
      }, 0);
    }, 0);

    return (): void => {
      cancelled = true;
      window.clearTimeout(openId);
      if (retryId !== null) {
        window.clearTimeout(retryId);
      }
    };
  }, [activeGamePhase, autoOpenDurationMs, autoOpenPhase]);

  const bindPhaseButtonRef = useCallback(
    (phase: Phase) =>
      (el: HTMLButtonElement | null): void => {
        phaseButtonRefs.current[phase] = el;
      },
    [],
  );

  const bindPhaseStepRef = useCallback(
    (phase: Phase) =>
      (el: HTMLDivElement | null): void => {
        phaseStepRefs.current[phase] = el;
      },
    [],
  );

  return {
    popoverPhase,
    popoverAnchorRect,
    isPopoverClosing,
    openPopoverForPhase,
    beginClosingPopover,
    closePopoverImmediately,
    bindPhaseButtonRef,
    bindPhaseStepRef,
  };
}
