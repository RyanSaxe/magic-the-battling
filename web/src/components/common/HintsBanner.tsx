import type { ReactElement } from "react";
import { hintsFor, type HintPlace } from "../../constants/hints";
import { useHintCycler } from "../../hooks/ui/useOverlayAnimations";
import { textForInput } from "../../utils/inputMode";

const HINT_CYCLE_TIMINGS = {
  cycleMs: 8000,
  fadeOutMs: 280,
  swapPauseMs: 80,
};

type HintsBannerVariant = "default" | "dark" | "rail";

const WRAPPER_CLASSES: Record<HintsBannerVariant, string> = {
  dark: "rounded-md border-l-[3px] border-l-amber-500 bg-black/40 flex items-center gap-2 !mb-0 py-1.5 px-3",
  rail: "hint-rail flex items-center gap-2 !mb-0 py-1.5 px-3 sm:px-4",
  default: "callout callout-tip flex items-center gap-2 !mb-0 !py-1.5",
};

export function HintsBanner({
  place,
  variant = "default",
}: {
  place: HintPlace;
  variant?: HintsBannerVariant;
}): ReactElement {
  const hints = hintsFor(place);
  const { index, visible, prev, next } = useHintCycler(
    hints.length,
    HINT_CYCLE_TIMINGS,
  );

  const wrapperClass = WRAPPER_CLASSES[variant];
  const labelClass =
    variant === "rail"
      ? "text-amber-200/95 font-semibold text-xs uppercase tracking-[0.04em] shrink-0"
      : "text-amber-400 font-medium text-xs shrink-0";
  const navButtonClass =
    variant === "rail"
      ? "touch-area text-[var(--ivory-muted)] hover:text-[var(--ivory)] transition-colors text-base leading-none shrink-0 px-1"
      : "text-[var(--ivory-muted)] hover:text-[var(--ivory)] transition-colors text-sm shrink-0";
  const tipTextClass =
    variant === "rail"
      ? "text-[12px] text-[var(--ivory-muted)]"
      : "text-xs text-[var(--ivory-muted)]";

  return (
    <div className={wrapperClass}>
      {variant === "rail" ? null : <span className={labelClass}>Tip</span>}
      <button
        onClick={prev}
        className={navButtonClass}
        aria-label="Previous tip"
      >
        ‹
      </button>
      {/* The tips share one grid cell, so the rail is always as tall as the tallest and the felt stays put. */}
      <p
        className={`grid flex-1 items-center text-center leading-tight ${tipTextClass} ${visible ? "hint-fade-in" : "hint-fade-out"}`}
      >
        {hints.map((hint, i) => (
          <span
            key={hint.text}
            className={`col-start-1 row-start-1 ${i === index ? "" : "invisible"}`}
          >
            {textForInput(hint)}
          </span>
        ))}
      </p>
      <button onClick={next} className={navButtonClass} aria-label="Next tip">
        ›
      </button>
    </div>
  );
}
