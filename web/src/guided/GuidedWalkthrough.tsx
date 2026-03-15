import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type {
  GuideStepDefinition,
  GuidedGuideId,
  GuideRequest,
  GuidedWalkthroughContext,
} from "./types";
import { buildGuideDefinition } from "./content";
import { useGuidePositioning } from "./useGuidePositioning";
import { GuideOverlay } from "./GuideOverlay";
import { GuideTooltip } from "./GuideTooltip";

const GUIDE_MOVE_DURATION_MS = 420;
const GUIDE_MOVE_EASING = "cubic-bezier(0.2, 0.9, 0.2, 1)";

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
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [displayState, setDisplayState] = useState<{
    guideLabel: string;
    layout: NonNullable<ReturnType<typeof useGuidePositioning>>;
    showSkipAll: boolean;
    step: GuideStepDefinition;
    stepIndex: number;
    stepKey: string;
    totalSteps: number;
  } | null>(null);
  const hasCommittedInitialLayoutRef = useRef(false);

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
  const isCurrentStepDisplayed = requestActive && displayState?.stepKey === stepKey;

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

      if (!handled) {
        return;
      }

      if (!isCurrentStepDisplayed) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === "Escape") {
        finishGuide();
      } else if ((event.key === "ArrowRight" || event.key === "Enter")) {
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

  useEffect(() => {
    if (!layout || !step) {
      return;
    }

    let enableTransitionsId: number | null = null;
    const commitId = requestAnimationFrame(() => {
      setDisplayState({
        guideLabel: guide.label,
        layout,
        showSkipAll: guide.showSkipAll === true,
        step,
        stepIndex,
        stepKey,
        totalSteps: guide.steps.length,
      });

      if (hasCommittedInitialLayoutRef.current) {
        return;
      }

      hasCommittedInitialLayoutRef.current = true;
      enableTransitionsId = requestAnimationFrame(() => {
        setTransitionsEnabled(true);
      });
    });

    return () => {
      cancelAnimationFrame(commitId);
      if (enableTransitionsId !== null) {
        cancelAnimationFrame(enableTransitionsId);
      }
    };
  }, [guide.label, guide.showSkipAll, guide.steps.length, layout, step, stepIndex, stepKey]);

  const tooltipStyle: CSSProperties = transitionsEnabled
    ? {
        left: displayState?.layout.cardLeft ?? 16,
        top: displayState?.layout.cardTop ?? 16,
        opacity: 1,
        transition:
          `left ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, top ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, opacity 220ms ease`,
      }
    : {
        left: displayState?.layout.cardLeft ?? 16,
        top: displayState?.layout.cardTop ?? 16,
        opacity: displayState ? 1 : 0,
        transition: "none",
      };

  if (!step) return null;

  return (
    <div className="absolute inset-0 z-[80]" style={{ pointerEvents: "none" }} aria-live="polite">
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

      <GuideOverlay clipPath={displayState?.layout.clipPath ?? "none"} allowInteraction={false} />

      {displayState?.layout.spotlight && (
        <>
          <div
            className="absolute pointer-events-none border border-amber-300/80 rounded-[clamp(14px,20%,24px)] shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_rgba(245,186,64,0.18)]"
            style={{
              left: displayState.layout.spotlight.x,
              top: displayState.layout.spotlight.y,
              width: displayState.layout.spotlight.width,
              height: displayState.layout.spotlight.height,
              transition: transitionsEnabled
                ? `left ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, top ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, width ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, height ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}`
                : "none",
            }}
          />
          {!displayState.step.allowTargetInteraction && (
            <div
              className="absolute pointer-events-auto"
              style={{
                left: displayState.layout.spotlight.x,
                top: displayState.layout.spotlight.y,
                width: displayState.layout.spotlight.width,
                height: displayState.layout.spotlight.height,
                transition: transitionsEnabled
                  ? `left ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, top ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, width ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}, height ${GUIDE_MOVE_DURATION_MS}ms ${GUIDE_MOVE_EASING}`
                  : "none",
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
          buttonsDisabled={!isCurrentStepDisplayed}
          style={tooltipStyle}
        />
      )}
    </div>
  );
}
