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

export interface UseGuidedWalkthroughResult {
  state: WalkthroughState<WalkthroughDisplayState>;
  guide: ReturnType<typeof buildGuideDefinition> | null;
  step: GuideStepDefinition | null;
  animPhase: ReturnType<typeof getWalkthroughAnimPhase>;
  displayState: WalkthroughDisplayState | null;
  pendingState: WalkthroughDisplayState | null;
  reducedMotion: boolean;
  takesTaps: boolean;
  isCurrentStepDisplayed: boolean;
}

function evalSelector(
  value:
    | string
    | ((ctx: GuidedWalkthroughContext) => string | undefined)
    | undefined,
  context: GuidedWalkthroughContext,
): string | undefined {
  return typeof value === "function" ? value(context) : value;
}

function evalTargetId(
  value:
    | GuideStepDefinition["targetId"]
    | ((ctx: GuidedWalkthroughContext) => GuideStepDefinition["targetId"])
    | undefined,
  context: GuidedWalkthroughContext,
): GuideStepDefinition["targetId"] {
  return typeof value === "function" ? value(context) : value;
}

function resolveStepTargets(
  step: GuideStepDefinition | null,
  context: GuidedWalkthroughContext,
): {
  targetSelector: string | undefined;
  positionTargetId: GuideStepDefinition["targetId"];
  positionTargetSelector: string | undefined;
  waitForLayoutTargetId: GuideStepDefinition["targetId"];
  waitForLayoutTargetSelector: string | undefined;
} {
  if (!step) {
    return {
      targetSelector: undefined,
      positionTargetId: undefined,
      positionTargetSelector: undefined,
      waitForLayoutTargetId: undefined,
      waitForLayoutTargetSelector: undefined,
    };
  }
  return {
    targetSelector: evalSelector(step.targetSelector, context),
    positionTargetId: evalTargetId(step.positionTargetId, context),
    positionTargetSelector: evalSelector(step.positionTargetSelector, context),
    waitForLayoutTargetId: evalTargetId(step.waitForLayoutTargetId, context),
    waitForLayoutTargetSelector: evalSelector(
      step.waitForLayoutTargetSelector,
      context,
    ),
  };
}

function syncWalkthroughState(
  machineState: WalkthroughState<WalkthroughDisplayState>,
  options: {
    dismissedImmediately: boolean;
    request: GuideRequest | null;
    requestActive: boolean;
    reducedMotion: boolean;
    layout: ReturnType<typeof useGuidePositioning>;
    layoutChanged: boolean;
    guide: ReturnType<typeof buildGuideDefinition> | null;
    step: GuideStepDefinition | null;
    stepIndex: number;
    stepKey: string;
  },
): WalkthroughState<WalkthroughDisplayState> {
  let nextState =
    options.dismissedImmediately && !options.requestActive
      ? reduceWalkthrough(machineState, { type: "dismiss_immediately" })
      : reduceWalkthrough(machineState, {
          type: "request_changed",
          requestNonce: options.request?.nonce ?? null,
          requestActive: options.requestActive,
          reducedMotion: options.reducedMotion,
        });

  if (
    options.layout &&
    options.step &&
    options.guide &&
    (options.layoutChanged || nextState.kind === "awaiting_layout")
  ) {
    nextState = reduceWalkthrough(nextState, {
      type: "layout_measured",
      display: {
        guideLabel: options.guide.label,
        layout: options.layout,
        showSkipAll: options.guide.showSkipAll === true,
        step: options.step,
        stepIndex: options.stepIndex,
        stepKey: options.stepKey,
        totalSteps: options.guide.steps.length,
      },
      stepKey: options.stepKey,
      displayStepKey: (display) => display.stepKey,
      reducedMotion: options.reducedMotion,
    });
  }

  return nextState;
}

function isHandledWalkthroughKey(key: string, stepIndex: number): boolean {
  return (
    key === "Escape" ||
    key === "ArrowRight" ||
    key === "Enter" ||
    (key === "ArrowLeft" && stepIndex > 0)
  );
}

function initialWalkthroughState(
  request: GuideRequest | null,
  requestActive: boolean,
): WalkthroughState<WalkthroughDisplayState> {
  return requestActive && request
    ? { kind: "awaiting_layout", requestNonce: request.nonce }
    : { kind: "hidden" };
}

function useWalkthroughDomEffects(options: {
  rootRef: RefObject<HTMLElement | null>;
  walkthroughRef: RefObject<HTMLDivElement | null>;
  request: GuideRequest | null;
  requestActive: boolean;
  guide: ReturnType<typeof buildGuideDefinition> | null;
  step: GuideStepDefinition | null;
  stepIndex: number;
  stepKey: string;
  targetSelector: string | undefined;
  currentPhase: GuidedWalkthroughContext["currentPhase"];
  nextStateKind: WalkthroughState<WalkthroughDisplayState>["kind"];
  displayStepKey: string | undefined;
  takesTaps: boolean;
  isCurrentStepDisplayed: boolean;
  onClose: (guideId: GuidedGuideId) => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
  onVisibleGuideStepChange?: (step: VisibleGuideStep | null) => void;
}): void {
  const {
    rootRef,
    walkthroughRef,
    request,
    requestActive,
    guide,
    step,
    stepIndex,
    stepKey,
    targetSelector,
    currentPhase,
    nextStateKind,
    displayStepKey,
    takesTaps,
    isCurrentStepDisplayed,
    onClose,
    onAdvanceStep,
    onBackStep,
    onVisibleGuideStepChange,
  } = options;

  const handlePhaseMismatch = useEffectEvent((guideId: GuidedGuideId) => {
    onClose(guideId);
  });

  useEffect(() => {
    if (
      requestActive &&
      request &&
      guide?.phase &&
      currentPhase &&
      currentPhase !== guide.phase
    ) {
      handlePhaseMismatch(request.guideId);
    }
  }, [currentPhase, guide?.phase, request, requestActive]);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      !isHandledWalkthroughKey(event.key, stepIndex) ||
      !isCurrentStepDisplayed ||
      !request
    ) {
      return;
    }
    const root = rootRef.current;
    const usableTarget =
      root && step?.allowTargetInteraction
        ? resolveTarget(root, step.targetId, targetSelector)
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
    } else if (event.key === "ArrowLeft") {
      onBackStep();
    } else {
      onAdvanceStep();
    }
  });

  useEffect(() => {
    if (nextStateKind === "hidden") return undefined;
    window.addEventListener("keydown", handleKeyDown, true);
    return (): void =>
      window.removeEventListener("keydown", handleKeyDown, true);
  }, [nextStateKind]);

  // Keep background inert while active; useEffect ensures ancestor rootRef is attached on first mount.
  useEffect(() => {
    const root = rootRef.current;
    const walkthrough = walkthroughRef.current;
    if (!takesTaps || !root || !walkthrough) return undefined;
    const target =
      displayStepKey === stepKey && step?.allowTargetInteraction
        ? resolveTarget(root, step.targetId, targetSelector)
        : null;
    return makeInertExcept(
      root,
      target ? [walkthrough, target] : [walkthrough],
    );
  });

  const visibleStep =
    requestActive && request && step
      ? { guideId: request.guideId, stepId: step.id }
      : null;
  const visibleGuideId = visibleStep?.guideId ?? null;
  const visibleStepId = visibleStep?.stepId ?? null;
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
    () => (): void => {
      notifyVisibleStep(null);
    },
    [],
  );
}

function readReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function buildStepKey(
  request: GuideRequest | null,
  step: GuideStepDefinition | null,
  stepIndex: number,
): string {
  return request ? `${request.nonce}:${step?.id ?? stepIndex}` : "";
}

function hasLayoutChanged(
  layout: ReturnType<typeof useGuidePositioning>,
  lastSynced: {
    stepKey: string;
    layout: NonNullable<ReturnType<typeof useGuidePositioning>> | null;
  },
  stepKey: string,
): boolean {
  return (
    layout !== null &&
    (lastSynced.layout !== layout || lastSynced.stepKey !== stepKey)
  );
}

function useWalkthroughTimer(
  nextState: WalkthroughState<WalkthroughDisplayState>,
  reducedMotion: boolean,
  setMachineState: React.Dispatch<
    React.SetStateAction<WalkthroughState<WalkthroughDisplayState>>
  >,
): void {
  const timerMs = getWalkthroughTimerMs(nextState, reducedMotion);
  useEffect(() => {
    if (timerMs === null || nextState.kind === "hidden") return undefined;
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
    return (): void => window.clearTimeout(timeoutId);
  }, [nextState.kind, setMachineState, timerMs]);
}

function getStepPositioningArgs(step: GuideStepDefinition | null): {
  targetId: GuideStepDefinition["targetId"];
  placement: NonNullable<GuideStepDefinition["placement"]>;
  spotlightPadding: number | undefined;
} {
  return {
    targetId: step?.targetId,
    placement: step?.placement ?? "bottom",
    spotlightPadding: step?.spotlightPadding,
  };
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
}: UseGuidedWalkthroughOptions): UseGuidedWalkthroughResult {
  const [reducedMotion] = useState(readReducedMotion);

  const [machineState, setMachineState] = useState(() =>
    initialWalkthroughState(request, requestActive),
  );
  const [lastSyncedLayout, setLastSyncedLayout] = useState<{
    stepKey: string;
    layout: NonNullable<ReturnType<typeof useGuidePositioning>> | null;
  }>({ stepKey: "", layout: null });

  const guide = useMemo(
    () => (request ? buildGuideDefinition(request.guideId, context) : null),
    [context, request],
  );
  const step = guide ? (guide.steps[stepIndex] ?? null) : null;
  const stepKey = buildStepKey(request, step, stepIndex);
  const targets = useMemo(
    () => resolveStepTargets(step, context),
    [context, step],
  );
  const posArgs = getStepPositioningArgs(step);

  const layout = useGuidePositioning({
    rootRef,
    cardRef: measureCardRef,
    targetId: posArgs.targetId,
    targetSelector: targets.targetSelector,
    positionTargetId: targets.positionTargetId,
    positionTargetSelector: targets.positionTargetSelector,
    waitForLayoutTargetId: targets.waitForLayoutTargetId,
    waitForLayoutTargetSelector: targets.waitForLayoutTargetSelector,
    placement: posArgs.placement,
    spotlightPadding: posArgs.spotlightPadding,
    stepKey,
  });

  const layoutChanged = hasLayoutChanged(layout, lastSyncedLayout, stepKey);

  // Apply request lifecycle and measured layout transitions synchronously during render.
  const nextState = syncWalkthroughState(machineState, {
    dismissedImmediately,
    request,
    requestActive,
    reducedMotion,
    layout,
    layoutChanged,
    guide,
    step,
    stepIndex,
    stepKey,
  });

  if (nextState !== machineState) setMachineState(nextState);
  if (layoutChanged && layout) setLastSyncedLayout({ stepKey, layout });

  useWalkthroughTimer(nextState, reducedMotion, setMachineState);

  const displayState = getWalkthroughDisplay(nextState);
  const pendingState = getWalkthroughPending(nextState);
  const animPhase = getWalkthroughAnimPhase(nextState);
  const takesTaps = isWalkthroughBlockingTaps(nextState, requestActive);
  const isCurrentStepDisplayed = isWalkthroughStepInteractive({
    state: nextState,
    requestActive,
    stepKey,
    displayStepKey: (display) => display.stepKey,
  });

  useWalkthroughDomEffects({
    rootRef,
    walkthroughRef,
    request,
    requestActive,
    guide,
    step,
    stepIndex,
    stepKey,
    targetSelector: targets.targetSelector,
    currentPhase: context.currentPhase,
    nextStateKind: nextState.kind,
    displayStepKey: displayState?.stepKey,
    takesTaps,
    isCurrentStepDisplayed,
    onClose,
    onAdvanceStep,
    onBackStep,
    onVisibleGuideStepChange,
  });

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
}: UseGuideSidebarSyncOptions): void {
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

      if (
        context.isMobile &&
        desired.openOnMobile !== undefined &&
        desired.openOnMobile !== sidebarOpen
      ) {
        setSidebarOpen(desired.openOnMobile);
      }

      if (desired.playerName === undefined) return;
      const nextTab = desired.detailTab ?? scoutingTab;
      if (scoutedPlayerName !== desired.playerName || scoutingTab !== nextTab) {
        setScouting(desired.playerName, nextTab);
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
    () => (): void => {
      restoreSidebarState();
    },
    [],
  );
}
