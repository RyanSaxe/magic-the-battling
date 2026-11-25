/**
 * React hook owner for the Guided Mode walkthrough presentation lifecycle,
 * keyboard shortcuts, `inert` background trapping, and temporary sidebar overrides.
 *
 * Encapsulates all DOM/timer effects for `GuidedWalkthrough` and `GameGuideLayer`
 * using `reduceWalkthrough` and React 19.2 `useEffectEvent` with no deferred microtask workarounds.
 */
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Scouting } from "../components/sidebar";
import { buildGuideDefinition } from "../guided/content";
import {
  getWalkthroughAnimPhase,
  getWalkthroughDisplay,
  getWalkthroughPending,
  getWalkthroughTimerMs,
  isWalkthroughBlockingTaps,
  isWalkthroughStepInteractive,
  reduceWalkthrough,
  type WalkthroughState,
} from "../guided/guideStateMachine";
import type {
  GuideStepDefinition,
  GuidedGuideId,
  GuideRequest,
  GuidedWalkthroughContext,
} from "../guided/types";
import {
  resolveTarget,
  useGuidePositioning,
  type SpotlightRect,
} from "../guided/useGuidePositioning";
import type { VisibleGuideStep } from "../pages/gameGuideState";
import { enterPressesControl } from "../utils/enterKey";
import type { ScoutingTab } from "./useGameSurfaces";

export interface WalkthroughDisplayState {
  guideLabel: string;
  layout: NonNullable<ReturnType<typeof useGuidePositioning>>;
  showSkipAll: boolean;
  step: GuideStepDefinition;
  stepIndex: number;
  stepKey: string;
  totalSteps: number;
}

export function spotlightDistance(
  a: SpotlightRect | null,
  b: SpotlightRect | null,
): number {
  if (!a || !b) return 0;
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

export function computeMorphDuration(distance: number): number {
  if (distance < 20) return 0;
  return Math.min(420, Math.max(260, 280 + (distance - 100) * 0.2));
}

function makeInertExcept(root: Element, usable: Element[]): () => void {
  const madeInert: Element[] = [];
  const stack: Element[] = [root];
  while (stack.length > 0) {
    const parent = stack.pop();
    if (!parent) continue;
    for (const child of parent.children) {
      if (usable.includes(child)) continue;
      if (usable.some((element) => child.contains(element))) {
        stack.push(child);
      } else if (!child.hasAttribute("inert")) {
        child.setAttribute("inert", "");
        madeInert.push(child);
      }
    }
  }
  return () => madeInert.forEach((element) => element.removeAttribute("inert"));
}

interface UseGuidedWalkthroughOptions {
  rootRef: RefObject<HTMLElement | null>;
  walkthroughRef: RefObject<HTMLDivElement | null>;
  measureCardRef: RefObject<HTMLDivElement | null>;
  request: GuideRequest | null;
  context: GuidedWalkthroughContext;
  stepIndex: number;
  requestActive: boolean;
  dismissedImmediately?: boolean;
  onClose: (guideId: GuidedGuideId) => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
  onVisibleGuideStepChange?: (step: VisibleGuideStep | null) => void;
}

export function useGuidedWalkthrough({
  rootRef,
  walkthroughRef,
  measureCardRef,
  request,
  context,
  stepIndex,
  requestActive,
  dismissedImmediately = false,
  onClose,
  onAdvanceStep,
  onBackStep,
  onVisibleGuideStepChange,
}: UseGuidedWalkthroughOptions) {
  const [reducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const [machineState, setMachineState] = useState<
    WalkthroughState<WalkthroughDisplayState>
  >(() =>
    requestActive && request
      ? { kind: "awaiting_layout", requestNonce: request.nonce }
      : { kind: "hidden" },
  );
  const [lastSyncedLayout, setLastSyncedLayout] = useState<{
    stepKey: string;
    layout: NonNullable<ReturnType<typeof useGuidePositioning>> | null;
  }>({ stepKey: "", layout: null });

  const guide = useMemo(
    () => (request ? buildGuideDefinition(request.guideId, context) : null),
    [context, request],
  );
  const step = guide?.steps[stepIndex] ?? null;
  const stepKey = request ? `${request.nonce}:${step?.id ?? stepIndex}` : "";

  const resolvedTargetSelector = useMemo(() => {
    if (!step?.targetSelector) return undefined;
    return typeof step.targetSelector === "function"
      ? step.targetSelector(context)
      : step.targetSelector;
  }, [context, step]);

  const resolvedPositionTargetId = useMemo(() => {
    if (!step?.positionTargetId) return undefined;
    return typeof step.positionTargetId === "function"
      ? step.positionTargetId(context)
      : step.positionTargetId;
  }, [context, step]);

  const resolvedPositionTargetSelector = useMemo(() => {
    if (!step?.positionTargetSelector) return undefined;
    return typeof step.positionTargetSelector === "function"
      ? step.positionTargetSelector(context)
      : step.positionTargetSelector;
  }, [context, step]);

  const resolvedWaitForLayoutTargetId = useMemo(() => {
    if (!step?.waitForLayoutTargetId) return undefined;
    return typeof step.waitForLayoutTargetId === "function"
      ? step.waitForLayoutTargetId(context)
      : step.waitForLayoutTargetId;
  }, [context, step]);

  const resolvedWaitForLayoutTargetSelector = useMemo(() => {
    if (!step?.waitForLayoutTargetSelector) return undefined;
    return typeof step.waitForLayoutTargetSelector === "function"
      ? step.waitForLayoutTargetSelector(context)
      : step.waitForLayoutTargetSelector;
  }, [context, step]);

  const layout = useGuidePositioning(
    rootRef,
    measureCardRef,
    step?.targetId,
    resolvedTargetSelector,
    resolvedPositionTargetId,
    resolvedPositionTargetSelector,
    resolvedWaitForLayoutTargetId,
    resolvedWaitForLayoutTargetSelector,
    step?.placement ?? "bottom",
    step?.spotlightPadding,
    stepKey,
  );

  // Apply request lifecycle and measured layout transitions synchronously during render.
  let nextState = machineState;
  if (dismissedImmediately && !requestActive) {
    nextState = reduceWalkthrough(nextState, { type: "dismiss_immediately" });
  } else {
    nextState = reduceWalkthrough(nextState, {
      type: "request_changed",
      requestNonce: request?.nonce ?? null,
      requestActive,
      reducedMotion,
    });
  }

  const layoutChanged =
    layout !== null &&
    (lastSyncedLayout.layout !== layout ||
      lastSyncedLayout.stepKey !== stepKey);

  if (
    layout &&
    step &&
    guide &&
    (layoutChanged || nextState.kind === "awaiting_layout")
  ) {
    nextState = reduceWalkthrough(nextState, {
      type: "layout_measured",
      display: {
        guideLabel: guide.label,
        layout,
        showSkipAll: guide.showSkipAll === true,
        step,
        stepIndex,
        stepKey,
        totalSteps: guide.steps.length,
      },
      stepKey,
      displayStepKey: (display) => display.stepKey,
      reducedMotion,
    });
  }

  if (nextState !== machineState) {
    setMachineState(nextState);
  }
  if (layoutChanged) {
    setLastSyncedLayout({ stepKey, layout });
  }

  const timerMs = getWalkthroughTimerMs(nextState, reducedMotion);
  useEffect(() => {
    if (timerMs === null) return;
    const timeoutId = window.setTimeout(() => {
      setMachineState((current) =>
        reduceWalkthrough(current, {
          type: "timer_elapsed",
          computeMorphMs: (from, to) =>
            computeMorphDuration(
              spotlightDistance(from.layout.spotlight, to.layout.spotlight),
            ),
        }),
      );
    }, timerMs);
    return () => window.clearTimeout(timeoutId);
  }, [nextState.kind, timerMs]);

  const displayState = getWalkthroughDisplay(nextState);
  const pendingState = getWalkthroughPending(nextState);
  const animPhase = getWalkthroughAnimPhase(nextState);
  const takesTaps = isWalkthroughBlockingTaps(nextState, requestActive);
  const isCurrentStepDisplayed = isWalkthroughStepInteractive(
    nextState,
    requestActive,
    stepKey,
    (display) => display.stepKey,
  );

  const handlePhaseMismatch = useEffectEvent((guideId: GuidedGuideId) => {
    onClose(guideId);
  });

  useEffect(() => {
    if (
      requestActive &&
      request &&
      guide?.phase &&
      context.currentPhase &&
      context.currentPhase !== guide.phase
    ) {
      handlePhaseMismatch(request.guideId);
    }
  }, [context.currentPhase, guide?.phase, request, requestActive]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const handled =
      event.key === "Escape" ||
      event.key === "ArrowRight" ||
      event.key === "Enter" ||
      (event.key === "ArrowLeft" && stepIndex > 0);

    if (!handled || !isCurrentStepDisplayed || !request) return;
    const root = rootRef.current;
    const usableTarget =
      root && step?.allowTargetInteraction
        ? resolveTarget(root, step.targetId, resolvedTargetSelector)
        : null;
    if (enterPressesControl(event, walkthroughRef.current, usableTarget)) {
      // A dialog can be open under the guide, and its Enter would confirm.
      event.stopImmediatePropagation();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.key === "Escape") {
      onClose(request.guideId);
    } else if (event.key === "ArrowRight" || event.key === "Enter") {
      onAdvanceStep();
    } else if (event.key === "ArrowLeft" && stepIndex > 0) {
      onBackStep();
    }
  });

  useEffect(() => {
    if (nextState.kind === "hidden") return;
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [nextState.kind]);

  // Keep background inert while active; immediately release inert once fading or hidden.
  useLayoutEffect(() => {
    const root = rootRef.current;
    const walkthrough = walkthroughRef.current;
    if (!takesTaps || !root || !walkthrough) return;
    const target =
      displayState?.stepKey === stepKey && step?.allowTargetInteraction
        ? resolveTarget(root, step.targetId, resolvedTargetSelector)
        : null;
    return makeInertExcept(
      root,
      target ? [walkthrough, target] : [walkthrough],
    );
  });

  const visibleGuideId =
    requestActive && request && step ? request.guideId : null;
  const visibleStepId = requestActive && request && step ? step.id : null;
  const notifyVisibleStep = useEffectEvent(
    (visible: VisibleGuideStep | null) => {
      onVisibleGuideStepChange?.(visible);
    },
  );

  useEffect(() => {
    notifyVisibleStep(
      visibleGuideId && visibleStepId
        ? { guideId: visibleGuideId, stepId: visibleStepId }
        : null,
    );
  }, [visibleGuideId, visibleStepId]);

  useEffect(
    () => () => {
      notifyVisibleStep(null);
    },
    [],
  );

  return {
    state: nextState,
    guide,
    step,
    animPhase,
    displayState,
    pendingState,
    reducedMotion,
    takesTaps,
    isCurrentStepDisplayed,
  };
}

interface UseGuideSidebarSyncOptions {
  guideRequest: GuideRequest | null;
  activeStep: GuideStepDefinition | null;
  context: GuidedWalkthroughContext;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  scouting: Scouting | null;
  setScouting: (player: string | null, tab?: ScoutingTab) => void;
}

export function useGuideSidebarSync({
  guideRequest,
  activeStep,
  context,
  sidebarOpen,
  setSidebarOpen,
  scouting,
  setScouting,
}: UseGuideSidebarSyncOptions) {
  const sidebarRestoreRef = useRef<{
    sidebarOpen: boolean;
    revealedPlayerName: string | null;
    revealedPlayerTab: ScoutingTab;
  } | null>(null);

  const scoutedPlayerName = scouting?.player ?? null;
  const scoutingTab = scouting?.tab ?? "seen";

  const resolvedSidebarState = useMemo(() => {
    const sidebarState = activeStep?.sidebarState;
    if (!sidebarState) return null;

    const openOnMobile =
      typeof sidebarState.openOnMobile === "function"
        ? sidebarState.openOnMobile(context)
        : sidebarState.openOnMobile;
    const playerName =
      typeof sidebarState.playerName === "function"
        ? sidebarState.playerName(context)
        : sidebarState.playerName;
    const detailTab =
      typeof sidebarState.detailTab === "function"
        ? sidebarState.detailTab(context)
        : sidebarState.detailTab;

    return { openOnMobile, playerName, detailTab };
  }, [activeStep?.sidebarState, context]);

  const restoreSidebarState = useEffectEvent(() => {
    const snapshot = sidebarRestoreRef.current;
    if (!snapshot) return;
    sidebarRestoreRef.current = null;
    if (context.isMobile) {
      if (sidebarOpen) setSidebarOpen(false);
    } else if (sidebarOpen !== snapshot.sidebarOpen) {
      setSidebarOpen(snapshot.sidebarOpen);
    }
    if (
      scoutedPlayerName !== snapshot.revealedPlayerName ||
      scoutingTab !== snapshot.revealedPlayerTab
    ) {
      setScouting(snapshot.revealedPlayerName, snapshot.revealedPlayerTab);
    }
  });

  const applySidebarState = useEffectEvent(
    (desired: {
      openOnMobile: boolean | undefined;
      playerName: string | null | undefined;
      detailTab: ScoutingTab | undefined;
    }) => {
      if (!sidebarRestoreRef.current) {
        sidebarRestoreRef.current = {
          sidebarOpen,
          revealedPlayerName: scoutedPlayerName,
          revealedPlayerTab: scoutingTab,
        };
      }

      if (context.isMobile) {
        if (desired.openOnMobile === true && !sidebarOpen) {
          setSidebarOpen(true);
        }
        if (desired.openOnMobile === false && sidebarOpen) {
          setSidebarOpen(false);
        }
      }
      if (
        desired.playerName !== undefined &&
        (scoutedPlayerName !== desired.playerName ||
          (desired.detailTab !== undefined &&
            scoutingTab !== desired.detailTab))
      ) {
        setScouting(desired.playerName, desired.detailTab ?? scoutingTab);
      }
    },
  );

  useLayoutEffect(() => {
    if (!guideRequest || !resolvedSidebarState) {
      restoreSidebarState();
      return;
    }
    applySidebarState(resolvedSidebarState);
  }, [guideRequest, resolvedSidebarState]);

  useLayoutEffect(
    () => () => {
      restoreSidebarState();
    },
    [],
  );
}
