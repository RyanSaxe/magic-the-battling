import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GuidedGuideId, GuideRequest, GuidedWalkthroughContext } from "./types";
import { buildGuideDefinition } from "./content";
import { useGuidePositioning } from "./useGuidePositioning";
import { GuideOverlay } from "./GuideOverlay";
import { GuideTooltip } from "./GuideTooltip";

interface GuidedWalkthroughProps {
  rootRef: React.RefObject<HTMLElement | null>;
  request: GuideRequest;
  context: GuidedWalkthroughContext;
  onClose: (guideId: GuidedGuideId) => void;
  onSkipAll: () => void;
  onStepChange: (guideId: GuidedGuideId, stepIndex: number) => void;
}

export function GuidedWalkthrough({
  rootRef,
  request,
  context,
  onClose,
  onSkipAll,
  onStepChange,
}: GuidedWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(request.stepIndex ?? 0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);

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

  const finishGuide = useCallback(() => {
    onClose(request.guideId);
  }, [onClose, request.guideId]);

  const advanceStep = useCallback(() => {
    setStepIndex((current) => {
      const next = current + 1;
      if (next >= guide.steps.length) {
        queueMicrotask(finishGuide);
        return current;
      }
      return next;
    });
  }, [finishGuide, guide.steps.length]);

  useEffect(() => {
    if (guide.phase && context.currentPhase && context.currentPhase !== guide.phase) {
      finishGuide();
    }
  }, [context.currentPhase, finishGuide, guide.phase]);

  useEffect(() => {
    onStepChange(request.guideId, stepIndex);
  }, [onStepChange, request.guideId, stepIndex]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const handled = event.key === "Escape"
        || event.key === "ArrowRight"
        || event.key === "Enter"
        || (event.key === "ArrowLeft" && stepIndex > 0);

      if (!handled) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (event.key === "Escape") {
        finishGuide();
      } else if ((event.key === "ArrowRight" || event.key === "Enter")) {
        advanceStep();
      } else if (event.key === "ArrowLeft" && stepIndex > 0) {
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [advanceStep, finishGuide, stepIndex]);

  const layout = useGuidePositioning(
    rootRef,
    cardRef,
    step?.targetId,
    resolvedTargetSelector,
    resolvedPositionTargetId,
    resolvedPositionTargetSelector,
    step?.placement ?? "bottom",
    step?.spotlightPadding,
    stepKey,
  );

  useEffect(() => {
    if (!layout || transitionsEnabled) return;
    const id = requestAnimationFrame(() => setTransitionsEnabled(true));
    return () => cancelAnimationFrame(id);
  }, [layout, transitionsEnabled]);

  const tooltipStyle: CSSProperties = transitionsEnabled
    ? {
        left: layout?.cardLeft ?? 16,
        top: layout?.cardTop ?? 16,
        opacity: 1,
        transition:
          "left 280ms cubic-bezier(0.22,1,0.36,1), top 280ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease",
      }
    : {
        left: layout?.cardLeft ?? 16,
        top: layout?.cardTop ?? 16,
        opacity: 0,
        transition: "opacity 200ms ease",
      };

  if (!step) return null;

  return (
    <div className="absolute inset-0 z-[80]" style={{ pointerEvents: "none" }} aria-live="polite">
      <GuideOverlay clipPath={layout?.clipPath ?? "none"} allowInteraction={false} />

      {layout?.spotlight && (
        <>
          <div
            className="absolute pointer-events-none border border-amber-300/80 rounded-[clamp(14px,20%,24px)] shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_rgba(245,186,64,0.18)]"
            style={{
              left: layout.spotlight.x,
              top: layout.spotlight.y,
              width: layout.spotlight.width,
              height: layout.spotlight.height,
            }}
          />
          {!step.allowTargetInteraction && (
            <div
              className="absolute pointer-events-auto"
              style={{
                left: layout.spotlight.x,
                top: layout.spotlight.y,
                width: layout.spotlight.width,
                height: layout.spotlight.height,
              }}
            />
          )}
        </>
      )}

      <GuideTooltip
        ref={cardRef}
        step={step}
        guideLabel={guide.label}
        stepIndex={stepIndex}
        totalSteps={guide.steps.length}
        showSkipAll={guide.showSkipAll === true}
        onPrimaryAction={advanceStep}
        onBack={() => setStepIndex((current) => Math.max(0, current - 1))}
        onSkipAll={onSkipAll}
        style={tooltipStyle}
      />
    </div>
  );
}
