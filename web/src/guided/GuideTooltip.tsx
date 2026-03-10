import { forwardRef, type CSSProperties } from "react";
import type { GuidePlacement, GuideStepContent, GuideStepDefinition, GuidedWalkthroughContext } from "./types";
import { GuideProgress } from "./GuideProgress";

interface GuideTooltipProps {
  step: GuideStepDefinition;
  guideLabel: string;
  stepIndex: number;
  totalSteps: number;
  placement: GuidePlacement;
  isMobile: boolean;
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
    { step, guideLabel, stepIndex, totalSteps, placement, isMobile, context, style, onNext, onBack, onSkip },
    ref,
  ) {
    const completionType = step.completion?.type ?? "manual";
    const isManual = completionType === "manual";
    const isLastStep = stepIndex + 1 === totalSteps;
    const actionHint = resolveActionHint(step.content, context);
    const isInteractive = !isManual;

    if (isMobile && isInteractive) {
      return (
        <div
          ref={ref}
          className={`absolute z-[82] pointer-events-auto modal-chrome felt-raised-panel gold-border border rounded-xl
            w-[calc(100%-1rem)] px-3 py-2.5 ${entranceClass(placement)}`}
          style={style}
          role="dialog"
          aria-modal="true"
          aria-label={`${guideLabel} walkthrough`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-amber-50 truncate">{step.title}</h2>
              {actionHint && (
                <p className="text-xs text-amber-400/90 mt-0.5 truncate">{actionHint}</p>
              )}
            </div>
            <GuideProgress current={stepIndex} total={totalSteps} />
          </div>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        className={`absolute z-[82] pointer-events-auto modal-chrome felt-raised-panel gold-border border rounded-xl
          w-[min(22rem,calc(100%-2rem))] p-4 ${entranceClass(placement)}`}
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={`${guideLabel} walkthrough`}
      >
        <div className="flex items-center justify-between gap-3 mb-2 pb-2 border-b border-amber-400/15">
          <span className="text-[0.68rem] uppercase tracking-widest text-amber-200/90 leading-none">
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
