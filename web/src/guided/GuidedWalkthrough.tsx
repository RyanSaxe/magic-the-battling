import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GuidedGuideId, GuideRequest, GuideStepMeta, GuidedWalkthroughContext } from "./types";
import { buildGuideDefinition } from "./content";
import { useGuidePositioning } from "./useGuidePositioning";
import { GuideOverlay } from "./GuideOverlay";
import { GuideTooltip } from "./GuideTooltip";

const STEP_AUTO_ADVANCE_MS = 180;

interface GuidedWalkthroughProps {
  rootRef: React.RefObject<HTMLElement | null>;
  request: GuideRequest;
  context: GuidedWalkthroughContext;
  onClose: (guideId: GuidedGuideId, completed: boolean) => void;
  onSecondaryAction?: (actionId: string) => void;
}

function resolveTarget(root: HTMLElement | null, targetId?: string, targetSelector?: string): HTMLElement | null {
  if (!root) {
    if (targetSelector) {
      const selectorTarget = document.querySelector<HTMLElement>(targetSelector);
      if (selectorTarget) return selectorTarget;
    }
    if (!targetId) return null;
    return document.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`);
  }
  if (targetSelector) {
    const selectorTarget = root.querySelector<HTMLElement>(targetSelector);
    if (selectorTarget) return selectorTarget;
    const documentSelectorTarget = document.querySelector<HTMLElement>(targetSelector);
    if (documentSelectorTarget) return documentSelectorTarget;
  }
  if (!targetId) return null;
  return root.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`)
    ?? document.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`);
}

export function GuidedWalkthrough({ rootRef, request, context, onClose, onSecondaryAction }: GuidedWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isUserCollapsed, setIsUserCollapsed] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const stepMetaRef = useRef<GuideStepMeta | undefined>(undefined);
  const autoAdvanceRef = useRef<number | null>(null);
  const lastEnteredStepRef = useRef<number>(-1);

  const guide = useMemo(
    () => buildGuideDefinition(request.guideId, context, !!request.isReplay),
    [request.guideId, request.isReplay, context],
  );

  const step = guide.steps[stepIndex] ?? null;
  const stepKey = `${request.nonce}:${step?.id ?? stepIndex}`;
  const resolvedTargetSelector = useMemo(() => {
    if (!step?.targetSelector) return undefined;
    return typeof step.targetSelector === "function"
      ? step.targetSelector(context)
      : step.targetSelector;
  }, [context, step]);

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  const finishGuide = useCallback(
    (completed: boolean) => {
      clearAutoAdvance();
      onClose(request.guideId, completed);
    },
    [clearAutoAdvance, onClose, request.guideId],
  );

  const resetCollapsedIfManual = useCallback((nextIndex: number) => {
    const nextStep = guide.steps[nextIndex];
    if (!nextStep?.completion || nextStep.completion.type === "manual") {
      setIsUserCollapsed(false);
    }
  }, [guide.steps]);

  const advanceStep = useCallback(() => {
    setStepIndex((cur) => {
      const next = cur + 1;
      if (next >= guide.steps.length) {
        queueMicrotask(() => finishGuide(true));
        return cur;
      }
      resetCollapsedIfManual(next);
      return next;
    });
  }, [finishGuide, guide.steps.length, resetCollapsedIfManual]);

  // auto-close when phase changes away from guide's phase
  useEffect(() => {
    if (guide.phase && context.currentPhase && context.currentPhase !== guide.phase) {
      finishGuide(true);
    }
  }, [context.currentPhase, finishGuide, guide.phase]);

  // onEnter — fire only once per step, not on every context change
  useEffect(() => {
    if (!step || lastEnteredStepRef.current === stepIndex) return;
    lastEnteredStepRef.current = stepIndex;
    stepMetaRef.current = step.onEnter?.(context) ?? undefined;
  }, [context, step, stepIndex]);

  // auto-minimize when user interacts outside tooltip during interactive steps
  useEffect(() => {
    if (!step) return;
    const completionType = step.completion?.type ?? "manual";
    const isInteractive =
      completionType === "target-click" ||
      (completionType === "condition" && step.completion?.type === "condition" && !!step.completion.allowInteraction);
    if (!isInteractive || isUserCollapsed) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      setIsUserCollapsed(true);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [isUserCollapsed, step]);

  // target-click handler
  useEffect(() => {
    if (!step || step.completion?.type !== "target-click") return;
    const root = rootRef.current;
    const target = resolveTarget(root, step.targetId, resolvedTargetSelector);
    if (!target) return;

    const handleClick = (e: MouseEvent) => {
      if (!target.contains(e.target as Node)) return;
      window.setTimeout(advanceStep, 0);
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [advanceStep, resolvedTargetSelector, rootRef, step]);

  // condition auto-advance
  useEffect(() => {
    if (!step || step.completion?.type !== "condition") {
      clearAutoAdvance();
      return;
    }
    if (!step.completion.isComplete(context, stepMetaRef.current)) {
      clearAutoAdvance();
      return;
    }
    clearAutoAdvance();
    autoAdvanceRef.current = window.setTimeout(() => {
      advanceStep();
      autoAdvanceRef.current = null;
    }, STEP_AUTO_ADVANCE_MS);
    return clearAutoAdvance;
  }, [advanceStep, clearAutoAdvance, context, step]);

  useEffect(() => () => clearAutoAdvance(), [clearAutoAdvance]);

  // keyboard nav
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        finishGuide(false);
      } else if ((e.key === "ArrowRight" || e.key === "Enter") && (step?.completion?.type ?? "manual") === "manual") {
        advanceStep();
      } else if (e.key === "ArrowLeft" && stepIndex > 0) {
        const prev = stepIndex - 1;
        resetCollapsedIfManual(prev);
        setStepIndex(prev);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [advanceStep, finishGuide, resetCollapsedIfManual, step, stepIndex]);

  const layout = useGuidePositioning(
    rootRef,
    cardRef,
    step?.targetId,
    resolvedTargetSelector,
    step?.placement ?? "bottom",
    step?.spotlightPadding,
    stepKey,
  );

  if (!step) return null;

  const completionType = step.completion?.type ?? "manual";
  const isCollapsed = isUserCollapsed;
  const allowInteraction =
    completionType === "target-click" ||
    (completionType === "condition" && step.completion?.type === "condition" && !!step.completion.allowInteraction);
  const overlayAllowsInteraction = allowInteraction || isCollapsed;
  const handlePrimaryAction = () => {
    if ((step.primaryActionMode ?? "advance") === "minimize") {
      setIsUserCollapsed(true);
      return;
    }
    advanceStep();
  };

  return (
    <div className="absolute inset-0 z-[80]" style={{ pointerEvents: "none" }} aria-live="polite">
      <GuideOverlay
        clipPath={layout?.clipPath ?? "none"}
        allowInteraction={overlayAllowsInteraction}
      />

      {layout?.spotlight && (
        <div
          className="absolute pointer-events-none border border-amber-400/70 rounded-[clamp(14px,20%,24px)] animate-guide-spotlight-pulse"
          style={{
            left: layout.spotlight.x,
            top: layout.spotlight.y,
            width: layout.spotlight.width,
            height: layout.spotlight.height,
          }}
        />
      )}

      <GuideTooltip
        ref={cardRef}
        step={step}
        guideLabel={guide.label}
        stepIndex={stepIndex}
        totalSteps={guide.steps.length}
        placement={layout?.resolvedPlacement ?? "bottom"}
        context={context}
        isCollapsed={isCollapsed}
        boundsWidth={layout?.containerWidth ?? 0}
        boundsHeight={layout?.containerHeight ?? 0}
        onPrimaryAction={handlePrimaryAction}
        onBack={() => {
          const prev = Math.max(0, stepIndex - 1);
          resetCollapsedIfManual(prev);
          setStepIndex(prev);
        }}
        onDismiss={() => finishGuide(false)}
        onCollapse={() => setIsUserCollapsed(true)}
        onExpand={() => setIsUserCollapsed(false)}
        onSecondaryAction={onSecondaryAction}
        style={{
          left: layout?.cardLeft ?? 16,
          top: layout?.cardTop ?? 16,
        }}
      />
    </div>
  );
}
