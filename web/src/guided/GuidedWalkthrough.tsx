/** Presentational Guided Mode overlay driven by `useGuidedWalkthrough`. */
import { useMemo, useRef, type CSSProperties, type RefObject } from "react";
import {
  computeMorphDuration,
  spotlightDistance,
  useGuidedWalkthrough,
} from "../hooks/useGuidedWalkthrough";
import type { VisibleGuideStep } from "../pages/gameGuideState";
import { GuideOverlay } from "./GuideOverlay";
import { GuideTooltip } from "./GuideTooltip";
import type {
  GuidedGuideId,
  GuideRequest,
  GuidedWalkthroughContext,
} from "./types";

const MORPH_EASING = "cubic-bezier(0.22,1,0.36,1)";

interface GuidedWalkthroughProps {
  rootRef: RefObject<HTMLElement | null>;
  request: GuideRequest | null;
  context: GuidedWalkthroughContext;
  stepIndex: number;
  requestActive: boolean;
  dismissedImmediately?: boolean;
  onClose: (guideId: GuidedGuideId) => void;
  onSkipAll: () => void;
  onAdvanceStep: () => void;
  onBackStep: () => void;
  onVisibleGuideStepChange?: (step: VisibleGuideStep | null) => void;
}

export function GuidedWalkthrough({
  rootRef,
  request,
  context,
  stepIndex,
  requestActive,
  dismissedImmediately = false,
  onClose,
  onSkipAll,
  onAdvanceStep,
  onBackStep,
  onVisibleGuideStepChange,
}: GuidedWalkthroughProps) {
  const measureCardRef = useRef<HTMLDivElement>(null);
  const walkthroughRef = useRef<HTMLDivElement>(null);

  const {
    state,
    guide,
    step,
    animPhase,
    displayState,
    pendingState,
    reducedMotion,
    takesTaps,
    isCurrentStepDisplayed,
  } = useGuidedWalkthrough({
    rootRef,
    walkthroughRef,
    measureCardRef,
    request,
    context,
    stepIndex,
    requestActive,
    dismissedImmediately,
    onClose,
    onAdvanceStep,
    onBackStep,
    onVisibleGuideStepChange,
  });

  const morphDuration = useMemo(() => {
    if (!displayState?.layout.spotlight) return 280;
    if (!pendingState?.layout.spotlight && animPhase !== "morph-spot") {
      return 280;
    }
    const target =
      pendingState?.layout.spotlight ?? displayState.layout.spotlight;
    return computeMorphDuration(
      spotlightDistance(displayState.layout.spotlight, target),
    );
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
        left,
        top,
        opacity: 1,
        animation:
          "guide-tooltip-initial 280ms cubic-bezier(0.0,0,0.2,1) 200ms both",
        transition: "none",
      };
    }

    if (animPhase === "exit-tooltip" && !reducedMotion) {
      return {
        left,
        top,
        animation: "guide-tooltip-exit 180ms ease-in forwards",
        transition: "none",
      };
    }

    if (animPhase === "morph-spot") {
      return { left, top, opacity: 0, transition: "none" };
    }

    if (animPhase === "enter-tooltip" && !reducedMotion) {
      return {
        left,
        top,
        animation:
          "guide-tooltip-enter 220ms cubic-bezier(0.0,0,0.2,1) forwards",
        transition: "none",
      };
    }

    if (animPhase === "exiting" && !reducedMotion) {
      return {
        left,
        top,
        animation: "guide-tooltip-dismiss 180ms ease-in forwards",
        transition: "none",
      };
    }

    return {
      left,
      top,
      opacity: displayState ? 1 : 0,
      transition: "none",
    };
  }, [animPhase, displayState, reducedMotion]);

  const spotlightStyle = useMemo((): CSSProperties | null => {
    if (!displayState?.layout.spotlight) return null;
    const { x, y, width, height } = displayState.layout.spotlight;

    if (animPhase === "entering" && !reducedMotion) {
      return {
        left: x,
        top: y,
        width,
        height,
        animation:
          "guide-spotlight-enter 350ms cubic-bezier(0.22,1,0.36,1) 80ms both",
        transition: "none",
      };
    }

    if (animPhase === "exiting" && !reducedMotion) {
      return {
        left: x,
        top: y,
        width,
        height,
        animation: "guide-spotlight-exit 200ms ease-in 60ms forwards",
        transition: "none",
      };
    }

    const morphGlow = animPhase === "morph-spot" && !reducedMotion;

    return {
      left: x,
      top: y,
      width,
      height,
      transition: spotlightTransition,
      animation: morphGlow
        ? `guide-spotlight-morph-glow ${morphDuration}ms ease-in-out`
        : undefined,
    };
  }, [
    animPhase,
    displayState,
    morphDuration,
    reducedMotion,
    spotlightTransition,
  ]);

  const overlayOpacity = useMemo(() => {
    if (animPhase === "entering") return reducedMotion ? 1 : undefined;
    if (animPhase === "exiting") return 0;
    return 1;
  }, [animPhase, reducedMotion]);

  const overlayTransition = useMemo(() => {
    if (reducedMotion) return undefined;
    if (animPhase === "exiting") return "opacity 300ms ease-in 100ms";
    return undefined;
  }, [animPhase, reducedMotion]);

  const overlayAnimation = useMemo(() => {
    if (reducedMotion) return undefined;
    if (animPhase === "entering") {
      return "guide-overlay-enter 400ms ease-out both";
    }
    return undefined;
  }, [animPhase, reducedMotion]);

  if (state.kind === "hidden" || (!step && !displayState)) return null;

  const showIdlePulse = animPhase === "idle";
  const buttonsDisabled = animPhase !== "idle" || !isCurrentStepDisplayed;

  return (
    <div
      ref={walkthroughRef}
      className="absolute inset-0 z-80"
      style={{ pointerEvents: "none" }}
      aria-live="polite"
    >
      {step && guide && (
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
      )}

      <GuideOverlay
        clipPath={displayState?.layout.clipPath ?? "none"}
        allowInteraction={!takesTaps}
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
          {takesTaps && !displayState.step.allowTargetInteraction && (
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
          style={tooltipStyle}
        />
      )}
    </div>
  );
}
