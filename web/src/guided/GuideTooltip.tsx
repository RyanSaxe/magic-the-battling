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
  interactive?: boolean;
  ariaHidden?: boolean;
  buttonsDisabled?: boolean;
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
      interactive = true,
      ariaHidden = false,
      buttonsDisabled = false,
    },
    ref,
  ) {
    const isLastStep = stepIndex + 1 === totalSteps;
    const primaryActionLabel = step.primaryActionLabel ?? (isLastStep ? "Got it" : "Next");
    const showSkipTutorial = showSkipAll && stepIndex === 0;

    return (
      <div
        ref={ref}
        className={`absolute z-[82] w-[min(17.5rem,calc(100%-1rem))] sm:w-[min(22rem,calc(100%-2rem))] max-h-[calc(100%-1rem)] overflow-hidden rounded-xl border modal-chrome felt-raised-panel gold-border shadow-[0_18px_42px_rgba(0,0,0,0.58),0_6px_18px_rgba(0,0,0,0.3)] ${
          interactive ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          ...style,
          overscrollBehavior: "contain",
        }}
        role={ariaHidden ? undefined : "dialog"}
        aria-modal={ariaHidden ? undefined : "true"}
        aria-label={ariaHidden ? undefined : "Guide"}
        aria-hidden={ariaHidden || undefined}
      >
        <div className="flex items-center justify-between gap-3 border-b gold-divider px-4 py-2.5">
          <span className="text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-gold)]">
            {guideLabel}
          </span>
          {totalSteps > 1 && (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={`inline-block h-2 w-2 rounded-full ${
                    i === stepIndex
                      ? "bg-[var(--color-gold)]"
                      : "bg-white/25"
                  }`}
                />
              ))}
            </div>
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
            <p className="mt-2 text-[0.84rem] leading-relaxed text-amber-100/70">
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
                Cards shown here
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
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

        <div className="flex flex-nowrap items-center justify-between gap-2 border-t gold-divider px-4 py-3">
          <div className="flex min-w-0 flex-nowrap items-center gap-1.5">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={onBack}
                disabled={buttonsDisabled}
                className="btn btn-secondary shrink-0 whitespace-nowrap px-2 py-1 text-[11px] leading-none"
              >
                Back
              </button>
            )}
            {showSkipTutorial && (
              <button
                type="button"
                onClick={onSkipAll}
                disabled={buttonsDisabled}
                className="btn btn-danger shrink-0 whitespace-nowrap px-2 py-1 text-[11px] leading-none"
              >
                Skip All Guides
              </button>
            )}
          </div>
          <div className="ml-auto flex shrink-0 flex-nowrap items-center gap-1.5">
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={buttonsDisabled}
              className="btn btn-primary shrink-0 whitespace-nowrap px-2.5 py-1 text-[11px] leading-none"
            >
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </div>
    );
  },
);
