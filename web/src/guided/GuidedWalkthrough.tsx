/** Presentational Guided Mode overlay driven by `useGuidedWalkthrough`. */
import {
  useMemo,
  useRef,
  type CSSProperties,
  type ReactElement,
  type RefObject,
} from "react";
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

const TOOLTIP_ANIMATIONS: Partial<Record<string, CSSProperties>> = {
  entering: {
    opacity: 1,
    animation:
      "guide-tooltip-initial 280ms cubic-bezier(0.0,0,0.2,1) 200ms both",
    transition: "none",
  },
  "exit-tooltip": {
    animation: "guide-tooltip-exit 180ms ease-in forwards",
    transition: "none",
  },
  "enter-tooltip": {
    animation: "guide-tooltip-enter 220ms cubic-bezier(0.0,0,0.2,1) forwards",
    transition: "none",
  },
  exiting: {
    animation: "guide-tooltip-dismiss 180ms ease-in forwards",
    transition: "none",
  },
};

function computeTooltipStyle(args: {
  animPhase: string;
  left: number;
  top: number;
  hasDisplayState: boolean;
  reducedMotion: boolean;
}): CSSProperties {
  const { animPhase, left, top, hasDisplayState, reducedMotion } = args;
  if (animPhase === "morph-spot") {
    return { left, top, opacity: 0, transition: "none" };
  }
  const animated = reducedMotion ? undefined : TOOLTIP_ANIMATIONS[animPhase];
  if (animated) {
    return { left, top, ...animated };
  }
  return {
    left,
    top,
    opacity: hasDisplayState ? 1 : 0,
    transition: "none",
  };
}

function computeSpotlightStyle(args: {
  spotlight: { x: number; y: number; width: number; height: number } | null;
  animPhase: string;
  reducedMotion: boolean;
  spotlightTransition: string;
  morphDuration: number;
}): CSSProperties | null {
  const {
    spotlight,
    animPhase,
    reducedMotion,
    spotlightTransition,
    morphDuration,
  } = args;
  if (!spotlight) return null;
  const base = {
    left: spotlight.x,
    top: spotlight.y,
    width: spotlight.width,
    height: spotlight.height,
  };
  if (animPhase === "entering" && !reducedMotion) {
    return {
      ...base,
      animation:
        "guide-spotlight-enter 350ms cubic-bezier(0.22,1,0.36,1) 80ms both",
      transition: "none",
    };
  }
  if (animPhase === "exiting" && !reducedMotion) {
    return {
      ...base,
      animation: "guide-spotlight-exit 200ms ease-in 60ms forwards",
      transition: "none",
    };
  }
  const morphGlow = animPhase === "morph-spot" && !reducedMotion;
  return {
    ...base,
    transition: spotlightTransition,
    animation: morphGlow
      ? `guide-spotlight-morph-glow ${morphDuration}ms ease-in-out`
      : undefined,
  };
}

function computeMorphDurationForState(args: {
  displaySpotlight: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  pendingSpotlight: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  animPhase: string;
}): number {
  const { displaySpotlight, pendingSpotlight, animPhase } = args;
  if (!displaySpotlight) return 280;
  if (!pendingSpotlight && animPhase !== "morph-spot") return 280;
  const target = pendingSpotlight ?? displaySpotlight;
  return computeMorphDuration(spotlightDistance(displaySpotlight, target));
}

function computeSpotlightTransition(
  animPhase: string,
  morphDuration: number,
): string {
  if (animPhase === "morph-spot" || animPhase === "enter-tooltip") {
    const ms = morphDuration || 280;
    return `left ${ms}ms ${MORPH_EASING}, top ${ms}ms ${MORPH_EASING}, width ${ms}ms ${MORPH_EASING}, height ${ms}ms ${MORPH_EASING}`;
  }
  return "none";
}

function computeClipPathTransition(
  animPhase: string,
  morphDuration: number,
): string {
  if (animPhase === "entering" || animPhase === "exiting") return "none";
  if (animPhase === "morph-spot" || animPhase === "enter-tooltip") {
    const ms = morphDuration || 280;
    return `clip-path ${ms}ms ${MORPH_EASING}`;
  }
  return `clip-path 280ms ${MORPH_EASING}`;
}

function computeOverlayStyleProps(
  animPhase: string,
  reducedMotion: boolean,
): {
  opacity: number | undefined;
  transition: string | undefined;
  animation: string | undefined;
} {
  if (animPhase === "entering") {
    return {
      opacity: reducedMotion ? 1 : undefined,
      transition: undefined,
      animation: reducedMotion
        ? undefined
        : "guide-overlay-enter 400ms ease-out both",
    };
  }
  if (animPhase === "exiting") {
    return {
      opacity: 0,
      transition: reducedMotion ? undefined : "opacity 300ms ease-in 100ms",
      animation: undefined,
    };
  }
  return { opacity: 1, transition: undefined, animation: undefined };
}

interface WalkthroughVisuals {
  spotlightTransition: string;
  clipPathTransition: string;
  tooltipStyle: CSSProperties;
  spotlightStyle: CSSProperties | null;
  overlay: {
    opacity: number | undefined;
    transition: string | undefined;
    animation: string | undefined;
  };
  clipPath: string;
}

function computeWalkthroughVisuals(args: {
  animPhase: string;
  reducedMotion: boolean;
  displayLayout: {
    cardLeft: number;
    cardTop: number;
    clipPath: string;
    spotlight: { x: number; y: number; width: number; height: number } | null;
  } | null;
  pendingSpotlight: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}): WalkthroughVisuals {
  const { animPhase, reducedMotion, displayLayout, pendingSpotlight } = args;
  const displaySpotlight = displayLayout?.spotlight ?? null;
  const morphDuration = computeMorphDurationForState({
    displaySpotlight,
    pendingSpotlight,
    animPhase,
  });
  const spotlightTransition = computeSpotlightTransition(
    animPhase,
    morphDuration,
  );
  return {
    spotlightTransition,
    clipPathTransition: computeClipPathTransition(animPhase, morphDuration),
    tooltipStyle: computeTooltipStyle({
      animPhase,
      left: displayLayout?.cardLeft ?? 16,
      top: displayLayout?.cardTop ?? 16,
      hasDisplayState: Boolean(displayLayout),
      reducedMotion,
    }),
    spotlightStyle: computeSpotlightStyle({
      spotlight: displaySpotlight,
      animPhase,
      reducedMotion,
      spotlightTransition,
      morphDuration,
    }),
    overlay: computeOverlayStyleProps(animPhase, reducedMotion),
    clipPath: displayLayout?.clipPath ?? "none",
  };
}

function GuideSpotlightLayer({
  spotlightStyle,
  spotlightTransition,
  showIdlePulse,
  blockTargetTaps,
}: {
  spotlightStyle: CSSProperties | null;
  spotlightTransition: string;
  showIdlePulse: boolean;
  blockTargetTaps: boolean;
}): ReactElement | null {
  if (!spotlightStyle) return null;
  const pulseClass = showIdlePulse ? "animate-guide-spotlight-pulse" : "";
  return (
    <>
      <div
        className={`absolute pointer-events-none border border-amber-300/80 rounded-[clamp(14px,20%,24px)] shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_rgba(245,186,64,0.18)] ${pulseClass}`}
        style={spotlightStyle}
      />
      {blockTargetTaps && (
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
  );
}

interface WalkthroughRenderFlags {
  hidden: boolean;
  buttonsDisabled: boolean;
  blockTargetTaps: boolean;
}

function resolveWalkthroughRenderFlags(args: {
  stateKind: string;
  hasStep: boolean;
  displayAllowTargetInteraction: boolean | null;
  animPhase: string;
  isCurrentStepDisplayed: boolean;
  takesTaps: boolean;
}): WalkthroughRenderFlags {
  const {
    stateKind,
    hasStep,
    displayAllowTargetInteraction,
    animPhase,
    isCurrentStepDisplayed,
    takesTaps,
  } = args;
  const hasDisplay = displayAllowTargetInteraction !== null;
  return {
    hidden: stateKind === "hidden" || (!hasStep && !hasDisplay),
    buttonsDisabled: animPhase !== "idle" || !isCurrentStepDisplayed,
    blockTargetTaps: takesTaps && displayAllowTargetInteraction === false,
  };
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
}: GuidedWalkthroughProps): ReactElement | null {
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

  const visuals = useMemo(
    () =>
      computeWalkthroughVisuals({
        animPhase,
        reducedMotion,
        displayLayout: displayState?.layout ?? null,
        pendingSpotlight: pendingState?.layout.spotlight ?? null,
      }),
    [animPhase, displayState, pendingState, reducedMotion],
  );

  const flags = resolveWalkthroughRenderFlags({
    stateKind: state.kind,
    hasStep: Boolean(step),
    displayAllowTargetInteraction: displayState
      ? Boolean(displayState.step.allowTargetInteraction)
      : null,
    animPhase,
    isCurrentStepDisplayed,
    takesTaps,
  });

  if (flags.hidden) return null;

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
        clipPath={visuals.clipPath}
        allowInteraction={!takesTaps}
        overlayOpacity={visuals.overlay.opacity}
        overlayTransition={visuals.overlay.transition}
        overlayAnimation={visuals.overlay.animation}
        clipPathTransition={visuals.clipPathTransition}
      />

      <GuideSpotlightLayer
        spotlightStyle={visuals.spotlightStyle}
        spotlightTransition={visuals.spotlightTransition}
        showIdlePulse={animPhase === "idle"}
        blockTargetTaps={flags.blockTargetTaps}
      />

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
          buttonsDisabled={flags.buttonsDisabled}
          style={visuals.tooltipStyle}
        />
      )}
    </div>
  );
}
