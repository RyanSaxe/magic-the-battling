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
  stepIndex: number;
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
  onClose,
  onSkipAll,
  onAdvanceStep,
  onBackStep,
}: GuidedWalkthroughProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transitionsEnabled, setTransitionsEnabled] = useState(false);
  const [displayLayout, setDisplayLayout] = useState<ReturnType<typeof useGuidePositioning>>(null);
  const latestLayoutRef = useRef<ReturnType<typeof useGuidePositioning>>(null);
  const committedStepKeyRef = useRef<string | null>(null);

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
  }, [finishGuide, onAdvanceStep, onBackStep, stepIndex]);

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
    latestLayoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    if (!layout) return;

    if (committedStepKeyRef.current !== stepKey) {
      const id = requestAnimationFrame(() => {
        const nextLayout = latestLayoutRef.current;
        if (!nextLayout) return;
        setTransitionsEnabled(true);
        setDisplayLayout(nextLayout);
        committedStepKeyRef.current = stepKey;
      });
      return () => cancelAnimationFrame(id);
    }

    const id = requestAnimationFrame(() => {
      const nextLayout = latestLayoutRef.current;
      if (!nextLayout) return;
      if (displayLayout === null) {
        committedStepKeyRef.current = stepKey;
        setTransitionsEnabled(true);
      }
      setDisplayLayout(nextLayout);
    });

    return () => cancelAnimationFrame(id);
  }, [displayLayout, layout, stepKey]);

  const tooltipStyle: CSSProperties = transitionsEnabled
    ? {
        left: displayLayout?.cardLeft ?? layout?.cardLeft ?? 16,
        top: displayLayout?.cardTop ?? layout?.cardTop ?? 16,
        opacity: 1,
        transition:
          "left 280ms cubic-bezier(0.22,1,0.36,1), top 280ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease",
      }
    : {
        left: displayLayout?.cardLeft ?? layout?.cardLeft ?? 16,
        top: displayLayout?.cardTop ?? layout?.cardTop ?? 16,
        opacity: (displayLayout ?? layout) ? 1 : 0,
        transition: "none",
      };

  if (!step) return null;

  return (
    <div className="absolute inset-0 z-[80]" style={{ pointerEvents: "none" }} aria-live="polite">
      <GuideOverlay clipPath={displayLayout?.clipPath ?? layout?.clipPath ?? "none"} allowInteraction={false} />

      {(displayLayout?.spotlight ?? layout?.spotlight) && (
        <>
          <div
            className="absolute pointer-events-none border border-amber-300/80 rounded-[clamp(14px,20%,24px)] shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_0_24px_rgba(245,186,64,0.18)]"
            style={{
              left: (displayLayout?.spotlight ?? layout?.spotlight)?.x,
              top: (displayLayout?.spotlight ?? layout?.spotlight)?.y,
              width: (displayLayout?.spotlight ?? layout?.spotlight)?.width,
              height: (displayLayout?.spotlight ?? layout?.spotlight)?.height,
            }}
          />
          {!step.allowTargetInteraction && (
            <div
              className="absolute pointer-events-auto"
              style={{
                left: (displayLayout?.spotlight ?? layout?.spotlight)?.x,
                top: (displayLayout?.spotlight ?? layout?.spotlight)?.y,
                width: (displayLayout?.spotlight ?? layout?.spotlight)?.width,
                height: (displayLayout?.spotlight ?? layout?.spotlight)?.height,
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
        onPrimaryAction={onAdvanceStep}
        onBack={onBackStep}
        onSkipAll={onSkipAll}
        style={tooltipStyle}
      />
    </div>
  );
}
