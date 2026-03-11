import { forwardRef, type CSSProperties } from "react";
import type { GuideStepDefinition } from "./types";
import { GuideProgress } from "./GuideProgress";

interface GuideTooltipProps {
  step: GuideStepDefinition;
  guideLabel: string;
  stepIndex: number;
  totalSteps: number;
  showSkipAll: boolean;
  style?: CSSProperties;
  onPrimaryAction: () => void;
  onBack: () => void;
  onDismiss: () => void;
  onSkipAll: () => void;
}

export const GuideTooltip = forwardRef<HTMLDivElement, GuideTooltipProps>(
  function GuideTooltip(
    {
      step,
      guideLabel,
      stepIndex,
      totalSteps,
      showSkipAll,
      style,
      onPrimaryAction,
      onBack,
      onDismiss,
      onSkipAll,
    },
    ref,
  ) {
    const isLastStep = stepIndex + 1 === totalSteps;
    const primaryActionLabel = step.primaryActionLabel ?? (isLastStep ? "Got it" : "Next");

    return (
      <div
        ref={ref}
        className="absolute z-[82] pointer-events-auto w-[min(21rem,calc(100%-1rem))] max-h-[calc(100%-1rem)] overflow-hidden rounded-2xl border border-amber-300/25 bg-[linear-gradient(180deg,rgba(38,26,20,0.98),rgba(24,16,13,0.98))] shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur"
        style={{
          ...style,
          overscrollBehavior: "contain",
          transition: "left 220ms ease, top 220ms ease, opacity 180ms ease",
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${guideLabel} guide`}
      >
        <div className="border-b border-amber-200/10 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[0.68rem] uppercase tracking-[0.24em] text-amber-200/75">
                {guideLabel}
              </div>
              <h2 className="mt-2 text-[1.04rem] font-semibold leading-tight text-amber-50">
                {step.title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="shrink-0 rounded-full border border-amber-200/15 px-2 py-1 text-[0.7rem] uppercase tracking-[0.18em] text-amber-100/70 transition-colors hover:text-white"
              aria-label="Dismiss guide"
            >
              Close
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <GuideProgress current={stepIndex} total={totalSteps} />
            <span className="text-[0.72rem] text-gray-400">
              {stepIndex + 1}/{totalSteps}
            </span>
          </div>
        </div>

        <div className="max-h-[min(20rem,calc(100vh-12rem))] overflow-y-auto px-4 py-4">
          <p className="text-[0.92rem] leading-relaxed text-gray-100">
            {step.content.summary}
          </p>
          {step.content.detail && (
            <p className="mt-2 text-[0.84rem] leading-relaxed text-gray-300">
              {step.content.detail}
            </p>
          )}
          {step.content.media && (
            <div className="mt-4 rounded-xl border border-amber-300/15 bg-black/20 p-3">
              <img
                src={step.content.media.imageUrl}
                alt={step.content.media.alt}
                className="mx-auto h-36 rounded-lg shadow-lg"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-amber-200/10 px-4 py-4">
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <button type="button" onClick={onBack} className="btn btn-secondary text-xs">
                Back
              </button>
            )}
            {showSkipAll && (
              <button
                type="button"
                onClick={onSkipAll}
                className="btn btn-secondary text-xs"
              >
                Skip Tutorial
              </button>
            )}
          </div>
          <button type="button" onClick={onPrimaryAction} className="btn btn-primary text-xs">
            {primaryActionLabel}
          </button>
        </div>
      </div>
    );
  },
);
