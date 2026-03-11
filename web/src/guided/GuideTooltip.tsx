import { forwardRef, type CSSProperties } from "react";
import type { GuideStepDefinition } from "./types";

interface GuideTooltipProps {
  step: GuideStepDefinition;
  guideLabel: string;
  stepIndex: number;
  totalSteps: number;
  showSkipAll: boolean;
  style?: CSSProperties;
  onPrimaryAction: () => void;
  onBack: () => void;
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
      onSkipAll,
    },
    ref,
  ) {
    const isLastStep = stepIndex + 1 === totalSteps;
    const primaryActionLabel = step.primaryActionLabel ?? (isLastStep ? "Got it" : "Next");

    return (
      <div
        ref={ref}
        className="absolute z-[82] pointer-events-auto w-[min(17.5rem,calc(100%-1rem))] max-h-[calc(100%-1rem)] overflow-hidden rounded-2xl border border-amber-300/20 bg-[linear-gradient(180deg,rgba(36,24,19,0.98),rgba(23,16,13,0.98))] shadow-[0_16px_36px_rgba(0,0,0,0.5)] backdrop-blur"
        style={{
          ...style,
          overscrollBehavior: "contain",
          transition: "left 220ms ease, top 220ms ease, opacity 180ms ease",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Guide"
      >
        <div className="flex items-center justify-between gap-3 border-b border-amber-200/10 px-4 py-2.5">
          <span className="text-[0.68rem] uppercase tracking-[0.18em] text-amber-200/80">
            {guideLabel}
          </span>
          {totalSteps > 1 && (
            <span className="text-[0.72rem] text-gray-500">
              {stepIndex + 1}/{totalSteps}
            </span>
          )}
        </div>
        <div className="max-h-[min(20rem,calc(100vh-12rem))] overflow-y-auto px-4 py-4">
          <h2 className="text-[0.98rem] font-semibold leading-tight text-amber-50">
            {step.title}
          </h2>
          <p className="mt-2 text-[0.92rem] leading-relaxed text-gray-100">
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
          {step.content.gallery && step.content.gallery.length > 0 && (
            <div className="mt-4 rounded-xl border border-sky-300/15 bg-black/20 p-3">
              <div className="text-[0.68rem] uppercase tracking-[0.18em] text-sky-100/80">
                Current upgrades
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {step.content.gallery.map((media) => (
                  <img
                    key={`${media.imageUrl}:${media.alt}`}
                    src={media.imageUrl}
                    alt={media.alt}
                    className="w-full rounded-md border border-sky-300/15 shadow-sm"
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-amber-200/10 px-4 py-3">
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
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={onPrimaryAction} className="btn btn-primary text-xs">
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
