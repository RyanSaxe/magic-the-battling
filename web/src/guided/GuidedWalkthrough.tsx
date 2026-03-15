import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  GuideStepDefinition,
  GuidedGuideId,
  GuideRequest,
  GuidedWalkthroughContext,
} from "./types";
import { buildGuideDefinition } from "./content";
import { useGuidePositioning, type SpotlightRect } from "./useGuidePositioning";
import { GuideOverlay } from "./GuideOverlay";
import { GuideTooltip } from "./GuideTooltip";

type AnimPhase =
  | "idle"
  | "entering"
  | "exit-tooltip"
  | "morph-spot"
  | "enter-tooltip"
  | "exiting";

const MORPH_EASING = "cubic-bezier(0.22,1,0.36,1)";

function spotlightDistance(a: SpotlightRect | null, b: SpotlightRect | null): number {
  if (!a || !b) return 0;
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

function computeMorphDuration(distance: number): number {
  if (distance < 20) return 0;
  return Math.min(420, Math.max(260, 280 + (distance - 100) * 0.2));
}

interface DisplayState {
  guideLabel: string;
  layout: NonNullable<ReturnType<typeof useGuidePositioning>>;
  showSkipAll: boolean;
  step: GuideStepDefinition;
  stepIndex: number;
  stepKey: string;
  totalSteps: number;
}

interface GuidedWalkthroughProps {
  rootRef: React.RefObject<HTMLElement | null>;
  request: GuideRequest;
  context: GuidedWalkthroughContext;
  stepIndex: number;
  requestActive: boolean;
  onClose: (guideId: GuidedGuideId) => void;
  onSkipAll: () => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
}

export function GuidedWalkthrough({
  rootRef,
  request,
  context,
  stepIndex,
  requestActive,
  onClose,
  onSkipAll,
  onAdvanceStep,
  onBackStep,
}: GuidedWalkthroughProps) {
  const measureCardRef = useRef<HTMLDivElement>(null);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("entering");
  const [displayState, setDisplayState] = useState<DisplayState | null>(null);
  const [pendingState, setPendingState] = useState<DisplayState | null>(null);
  const hasCommittedInitialLayoutRef = useRef(false);
  const phaseTimerRef = useRef<number | null>(null);
  const [reducedMotion] = useState(
    () => typeof window !== "undefined"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const guide = useMemo(
    () => buildGuideDefinition(request.guideId, context),
    [context, request.guideId],
  );

  const step = guide.steps[stepIndex] ?? null;
  const stepKey = `${request.nonce}:${step?.id ?? stepIndex}`;
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

  const finishGuide = useCallback(() => {
    onClose(request.guideId);
  }, [onClose, request.guideId]);
  const isCurrentStepDisplayed =
    requestActive && displayState?.stepKey === stepKey && animPhase === "idle";

  useEffect(() => {
    if (guide.phase && context.currentPhase && context.currentPhase !== guide.phase) {
      finishGuide();
    }
  }, [context.currentPhase, finishGuide, guide.phase]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const handled = event.key === "Escape"
        || event.key === "ArrowRight"
        || event.key === "Enter"
        || (event.key === "ArrowLeft" && stepIndex > 0);

      if (!handled) return;
      if (!isCurrentStepDisplayed) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === "Escape") {
        finishGuide();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        onAdvanceStep();
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        onBackStep();
      }
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [finishGuide, isCurrentStepDisplayed, onAdvanceStep, onBackStep, stepIndex]);

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

  const clearPhaseTimer = useCallback(() => {
    if (phaseTimerRef.current !== null) {
      window.clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!layout || !step) return;

    const nextState: DisplayState = {
      guideLabel: guide.label,
      layout,
      showSkipAll: guide.showSkipAll === true,
      step,
      stepIndex,
      stepKey,
      totalSteps: guide.steps.length,
    };

    if (!hasCommittedInitialLayoutRef.current) {
      hasCommittedInitialLayoutRef.current = true;

      const commitId = requestAnimationFrame(() => {
        setDisplayState(nextState);
        if (reducedMotion) {
          setAnimPhase("idle");
        } else {
          setAnimPhase("entering");
          phaseTimerRef.current = window.setTimeout(() => {
            setAnimPhase("idle");
          }, 480);
        }
      });
      return () => cancelAnimationFrame(commitId);
    }

    if (animPhase === "idle" || animPhase === "entering") {
      if (displayState?.stepKey === nextState.stepKey) {
        const updateId = requestAnimationFrame(() => {
          setDisplayState(nextState);
        });
        return () => cancelAnimationFrame(updateId);
      }

      if (reducedMotion) {
        const updateId = requestAnimationFrame(() => {
          setDisplayState(nextState);
        });
        return () => cancelAnimationFrame(updateId);
      }

      const exitId = requestAnimationFrame(() => {
        setPendingState(nextState);
        clearPhaseTimer();
        setAnimPhase("exit-tooltip");
      });
      return () => cancelAnimationFrame(exitId);
    } else if (animPhase === "morph-spot" || animPhase === "enter-tooltip") {
      const pendingId = requestAnimationFrame(() => {
        setPendingState(nextState);
      });
      return () => cancelAnimationFrame(pendingId);
    }
  }, [
    animPhase,
    clearPhaseTimer,
    displayState?.stepKey,
    guide.label,
    guide.showSkipAll,
    guide.steps.length,
    layout,
    reducedMotion,
    step,
    stepIndex,
    stepKey,
  ]);

  useEffect(() => {
    if (reducedMotion) return;

    if (animPhase === "exit-tooltip") {
      clearPhaseTimer();
      phaseTimerRef.current = window.setTimeout(() => {
        setAnimPhase("morph-spot");
      }, 180);
    }

    if (animPhase === "morph-spot" && pendingState) {
      const dist = spotlightDistance(
        displayState?.layout.spotlight ?? null,
        pendingState.layout.spotlight ?? null,
      );
      const morphMs = computeMorphDuration(dist);

      const rafId = requestAnimationFrame(() => {
        setDisplayState(pendingState);
        setPendingState(null);
        clearPhaseTimer();
        phaseTimerRef.current = window.setTimeout(() => {
          setAnimPhase("enter-tooltip");
        }, morphMs === 0 ? 80 : morphMs);
      });
      return () => cancelAnimationFrame(rafId);
    } else if (animPhase === "morph-spot" && !pendingState) {
      const rafId = requestAnimationFrame(() => {
        if (pendingState) return;
        setAnimPhase("morph-spot");
      });
      return () => cancelAnimationFrame(rafId);
    }

    if (animPhase === "enter-tooltip") {
      clearPhaseTimer();
      phaseTimerRef.current = window.setTimeout(() => {
        setAnimPhase("idle");
      }, 220);
    }

    if (animPhase === "exiting") {
      clearPhaseTimer();
      phaseTimerRef.current = window.setTimeout(() => {
        finishGuide();
      }, 400);
    }

    return () => {};
  }, [animPhase, clearPhaseTimer, displayState?.layout.spotlight, finishGuide, pendingState, reducedMotion]);

  useEffect(() => {
    return () => clearPhaseTimer();
  }, [clearPhaseTimer]);

  const morphDuration = useMemo(() => {
    if (!displayState?.layout.spotlight) return 280;
    if (!pendingState?.layout.spotlight && animPhase !== "morph-spot") return 280;
    const target = pendingState?.layout.spotlight ?? displayState.layout.spotlight;
    const dist = spotlightDistance(displayState.layout.spotlight, target);
    return computeMorphDuration(dist);
  }, [animPhase, displayState, pendingState]);

  const spotlightTransition = useMemo(() => {
    if (animPhase === "entering" || animPhase === "exiting") return "none";
    if (animPhase === "morph-spot" || animPhase === "enter-tooltip") {
      const ms = morphDuration || 280;
      return `left ${ms}ms ${MORPH_EASING}, top ${ms}ms ${MORPH_EASING}, width ${ms}ms ${MORPH_EASING}, height ${ms}ms ${MORPH_EASING}`;
    }
    return "none";
  }, [animPhase, morphDuration]);

  const clipPathTransition = useMemo(() => {
    if (animPhase === "entering" || animPhase === "exiting") return "none";
    if (animPhase === "morph-spot" || animPhase === "enter-tooltip") {
      const ms = morphDuration || 280;
      return `clip-path ${ms}ms ${MORPH_EASING}`;
    }
    return `clip-path 280ms ${MORPH_EASING}`;
  }, [animPhase, morphDuration]);

  const tooltipStyle = useMemo((): CSSProperties => {
    const left = displayState?.layout.cardLeft ?? 16;
    const top = displayState?.layout.cardTop ?? 16;
    if (animPhase === "entering" && !reducedMotion) {
      return {
        left, top,
        opacity: 1,
        animation: "guide-tooltip-initial 280ms cubic-bezier(0.0,0,0.2,1) 200ms both",
        transition: "none",
      };
    }

    if (animPhase === "exit-tooltip" && !reducedMotion) {
      return {
        left, top,
        animation: "guide-tooltip-exit 180ms ease-in forwards",
        transition: "none",
      };
    }

    if (animPhase === "morph-spot") {
      return { left, top, opacity: 0, transition: "none" };
    }

    if (animPhase === "enter-tooltip" && !reducedMotion) {
      return {
        left, top,
        animation: "guide-tooltip-enter 220ms cubic-bezier(0.0,0,0.2,1) forwards",
        transition: "none",
      };
    }

    if (animPhase === "exiting" && !reducedMotion) {
      return {
        left, top,
        animation: "guide-tooltip-dismiss 180ms ease-in forwards",
        transition: "none",
      };
    }

    return {
      left, top,
      opacity: displayState ? 1 : 0,
      transition: "none",
    };
  }, [animPhase, displayState, reducedMotion]);

  const spotlightStyle = useMemo((): CSSProperties | null => {
    if (!displayState?.layout.spotlight) return null;
    const { x, y, width, height } = displayState.layout.spotlight;

    if (animPhase === "entering" && !reducedMotion) {
      return {
        left: x, top: y, width, height,
        animation: "guide-spotlight-enter 350ms cubic-bezier(0.22,1,0.36,1) 80ms both",
        transition: "none",
      };
    }

    if (animPhase === "exiting" && !reducedMotion) {
      return {
        left: x, top: y, width, height,
        animation: "guide-spotlight-exit 200ms ease-in 60ms forwards",
        transition: "none",
      };
    }

    const morphGlow = animPhase === "morph-spot" && !reducedMotion;

    return {
      left: x, top: y, width, height,
      transition: spotlightTransition,
      animation: morphGlow
        ? `guide-spotlight-morph-glow ${morphDuration}ms ease-in-out`
        : undefined,
    };
  }, [animPhase, displayState, morphDuration, reducedMotion, spotlightTransition]);

  const overlayOpacity = useMemo(() => {
    if (animPhase === "entering") return reducedMotion ? 1 : undefined;
    if (animPhase === "exiting") return 0;
    return 1;
  }, [animPhase, reducedMotion]);

  const overlayTransition = useMemo(() => {
    if (reducedMotion) return undefined;
    if (animPhase === "entering") return undefined;
    if (animPhase === "exiting") return "opacity 300ms ease-in 100ms";
    return undefined;
  }, [animPhase, reducedMotion]);

  const overlayAnimation = useMemo(() => {
    if (reducedMotion) return undefined;
    if (animPhase === "entering") return "guide-overlay-enter 400ms ease-out both";
    return undefined;
  }, [animPhase, reducedMotion]);

  const showIdlePulse = animPhase === "idle";
  const dotAnimating = animPhase === "enter-tooltip";
  const buttonsDisabled = animPhase !== "idle" || !isCurrentStepDisplayed;

  if (!step) return null;

  return (
    <div className="absolute inset-0 z-80" style={{ pointerEvents: "none" }} aria-live="polite">
      <GuideTooltip
        ref={measureCardRef}
        step={step}
        guideLabel={guide.label}
        stepIndex={stepIndex}
        totalSteps={guide.steps.length}
        showSkipAll={guide.showSkipAll === true}
        onPrimaryAction={onAdvanceStep}
        onBack={onBackStep}
        onSkipAll={onSkipAll}
        interactive={false}
        ariaHidden
        style={{
          left: 0,
          top: 0,
          opacity: 0,
          visibility: "hidden",
          transition: "none",
        }}
      />

      <GuideOverlay
        clipPath={displayState?.layout.clipPath ?? "none"}
        allowInteraction={false}
        overlayOpacity={overlayOpacity}
        overlayTransition={overlayAnimation ? undefined : overlayTransition}
        overlayAnimation={overlayAnimation}
        clipPathTransition={clipPathTransition}
      />

      {displayState?.layout.spotlight && spotlightStyle && (
        <>
          <div
            className={`absolute pointer-events-none border border-amber-300/80 rounded-[clamp(14px,20%,24px)] shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_rgba(245,186,64,0.18)] ${
              showIdlePulse ? "animate-guide-spotlight-pulse" : ""
            }`}
            style={spotlightStyle}
          />
          {!displayState.step.allowTargetInteraction && (
            <div
              className="absolute pointer-events-auto"
              style={{
                left: spotlightStyle.left,
                top: spotlightStyle.top,
                width: spotlightStyle.width,
                height: spotlightStyle.height,
                transition: spotlightTransition,
              }}
            />
          )}
        </>
      )}

      {displayState && (
        <GuideTooltip
          step={displayState.step}
          guideLabel={displayState.guideLabel}
          stepIndex={displayState.stepIndex}
          totalSteps={displayState.totalSteps}
          showSkipAll={displayState.showSkipAll}
          onPrimaryAction={onAdvanceStep}
          onBack={onBackStep}
          onSkipAll={onSkipAll}
          interactive={isCurrentStepDisplayed}
          buttonsDisabled={buttonsDisabled}
          dotAnimating={dotAnimating}
          style={tooltipStyle}
        />
      )}
    </div>
  );
}
