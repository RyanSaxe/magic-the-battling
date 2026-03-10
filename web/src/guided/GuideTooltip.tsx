import { forwardRef, useCallback, useRef, useState, type CSSProperties } from "react";
import type { GuidePlacement, GuideStepContent, GuideStepDefinition, GuidedWalkthroughContext } from "./types";
import { GuideProgress } from "./GuideProgress";

interface GuideTooltipProps {
  step: GuideStepDefinition;
  guideLabel: string;
  stepIndex: number;
  totalSteps: number;
  placement: GuidePlacement;
  context: GuidedWalkthroughContext;
  style?: CSSProperties;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

function resolveActionHint(content: GuideStepContent, ctx: GuidedWalkthroughContext): string | undefined {
  if (!content.actionHint) return undefined;
  return typeof content.actionHint === "function" ? content.actionHint(ctx) : content.actionHint;
}

function entranceClass(placement: GuidePlacement): string {
  if (placement === "top") return "animate-guide-enter-down";
  return "animate-guide-enter-up";
}

export const GuideTooltip = forwardRef<HTMLDivElement, GuideTooltipProps>(
  function GuideTooltip(
    { step, guideLabel, stepIndex, totalSteps, placement, context, style, onNext, onBack, onSkip },
    ref,
  ) {
    const completionType = step.completion?.type ?? "manual";
    const isManual = completionType === "manual";
    const isLastStep = stepIndex + 1 === totalSteps;
    const actionHint = resolveActionHint(step.content, context);

    const [dragState, setDragState] = useState({ step: stepIndex, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragStartRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });
    const dragOffset = dragState.step === stepIndex ? dragState : { x: 0, y: 0 };

    const onPointerDown = useCallback(
      (e: React.PointerEvent) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragStartRef.current = {
          pointerX: e.clientX,
          pointerY: e.clientY,
          offsetX: dragOffset.x,
          offsetY: dragOffset.y,
        };
        setIsDragging(true);
      },
      [dragOffset],
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartRef.current.pointerX;
        const dy = e.clientY - dragStartRef.current.pointerY;
        setDragState({
          step: stepIndex,
          x: dragStartRef.current.offsetX + dx,
          y: dragStartRef.current.offsetY + dy,
        });
      },
      [isDragging, stepIndex],
    );

    const onPointerUp = useCallback(() => {
      setIsDragging(false);
    }, []);

    const mergedStyle: CSSProperties = {
      ...style,
      left: (style?.left as number ?? 0) + dragOffset.x,
      top: (style?.top as number ?? 0) + dragOffset.y,
    };

    return (
      <div
        ref={ref}
        className={`absolute z-[82] pointer-events-auto modal-chrome felt-raised-panel gold-border border rounded-xl
          w-[min(22rem,calc(100%-2rem))] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.3)]
          ${entranceClass(placement)}`}
        style={mergedStyle}
        role="dialog"
        aria-modal="true"
        aria-label={`${guideLabel} walkthrough`}
      >
        <div
          className={`flex items-center justify-between gap-3 mb-2 pb-2 border-b border-amber-400/15
            ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <span className="text-[0.68rem] uppercase tracking-widest text-amber-200/90 leading-none select-none">
            {guideLabel}
          </span>
          <GuideProgress current={stepIndex} total={totalSteps} />
        </div>

        <h2 className="text-[1.05rem] font-bold text-amber-50 leading-tight mb-2">{step.title}</h2>

        <p className="text-[0.88rem] text-gray-200/90 leading-relaxed">{step.content.summary}</p>
        {step.content.detail && (
          <p className="text-[0.82rem] text-gray-300/80 leading-relaxed mt-1.5">{step.content.detail}</p>
        )}

        {actionHint && (
          <p className="text-xs text-amber-400/90 mt-2">{actionHint}</p>
        )}

        <div className="flex items-center justify-between gap-2 mt-3">
          <button type="button" onClick={onSkip} className="btn btn-secondary text-xs">
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onBack}
              className="btn btn-secondary text-xs"
              disabled={stepIndex === 0}
            >
              Back
            </button>
            {isManual && (
              <button type="button" onClick={onNext} className="btn btn-primary text-xs">
                {isLastStep ? "Got it" : "Next"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  },
);
