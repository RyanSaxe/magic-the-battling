import { forwardRef, type CSSProperties, type ReactElement } from "react";
import type { GuideStepDefinition } from "./types";
import { POPOVER_CHROME } from "../components/common/styles";

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

function stepDotColor(index: number, stepIndex: number): string {
  if (index === stepIndex) return "bg-[var(--color-gold)]";
  if (index < stepIndex) return "bg-amber-400/40";
  return "bg-white/20";
}

function GuideTooltipBody({
  step,
}: {
  step: GuideStepDefinition;
}): ReactElement {
  return (
    <div className="max-h-[min(20rem,calc(100vh-12rem))] overflow-y-auto px-4 py-4">
      <h2 className="text-[16px] font-semibold leading-tight text-[var(--ivory)]">
        {step.title}
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-[var(--ivory)]">
        {step.content.summary}
      </p>
      {step.content.detail && (
        <p className="mt-2 text-[13px] leading-relaxed text-[var(--ivory-muted)]">
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
        <div className="mt-4 rounded-xl border gold-divider bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ivory-soft)]">
            Cards shown here
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {step.content.gallery.map((media) => (
              <img
                key={`${media.imageUrl}:${media.alt}`}
                src={media.imageUrl}
                alt={media.alt}
                className="w-full rounded-md border gold-divider shadow-sm"
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface GuideTooltipFooterProps {
  stepIndex: number;
  showSkipTutorial: boolean;
  primaryActionLabel: string;
  buttonsDisabled: boolean;
  onPrimaryAction: () => void;
  onBack: () => void;
  onSkipAll: () => void;
}

function GuideTooltipFooter({
  stepIndex,
  showSkipTutorial,
  primaryActionLabel,
  buttonsDisabled,
  onPrimaryAction,
  onBack,
  onSkipAll,
}: GuideTooltipFooterProps): ReactElement {
  return (
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
  );
}

export const GuideTooltip = forwardRef<HTMLDivElement, GuideTooltipProps>(
  function GuideTooltip(props, ref): ReactElement {
    const {
      step,
      guideLabel,
      stepIndex,
      totalSteps,
      showSkipAll,
      style,
      onPrimaryAction,
      onBack,
      onSkipAll,
    } = props;
    const interactive = props.interactive ?? true;
    const ariaHidden = props.ariaHidden ?? false;
    const buttonsDisabled = props.buttonsDisabled ?? false;
    const isLastStep = stepIndex + 1 === totalSteps;
    const primaryActionLabel =
      step.primaryActionLabel ?? (isLastStep ? "Got it" : "Next");
    const showSkipTutorial = showSkipAll && stepIndex === 0;
    const dialogProps = ariaHidden
      ? { "aria-hidden": true }
      : { role: "dialog", "aria-modal": true, "aria-label": "Guide" };

    return (
      <div
        ref={ref}
        data-guided-tooltip="true"
        className={`guided-tooltip absolute z-[82] w-[min(17.5rem,calc(100%-1rem))] sm:w-[min(22rem,calc(100%-2rem))] max-h-[calc(100%-1rem)] overflow-hidden ${POPOVER_CHROME} ${
          interactive ? "pointer-events-auto" : "pointer-events-none"
        }`}
        style={{
          ...style,
          overscrollBehavior: "contain",
        }}
        {...dialogProps}
      >
        <div className="flex items-center justify-between gap-3 border-b gold-divider px-4 py-2.5">
          <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-gold)]">
            {guideLabel}
          </span>
          {totalSteps > 1 && (
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalSteps }, (_, i) => (
                <span
                  key={i}
                  className={`inline-block h-2 w-2 rounded-full ${stepDotColor(i, stepIndex)}`}
                />
              ))}
            </div>
          )}
        </div>
        <GuideTooltipBody step={step} />
        <GuideTooltipFooter
          stepIndex={stepIndex}
          showSkipTutorial={showSkipTutorial}
          primaryActionLabel={primaryActionLabel}
          buttonsDisabled={buttonsDisabled}
          onPrimaryAction={onPrimaryAction}
          onBack={onBack}
          onSkipAll={onSkipAll}
        />
      </div>
    );
  },
);
