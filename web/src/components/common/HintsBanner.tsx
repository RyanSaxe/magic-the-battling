import { useState, useEffect, useRef, useCallback } from "react";
import { hintsFor, type HintPlace } from "../../constants/hints";
import { textForInput } from "../../utils/inputMode";

const CYCLE_INTERVAL = 8000;
const FADE_OUT_DURATION = 280;
const SWAP_PAUSE = 80;

type HintsBannerVariant = "default" | "dark" | "rail";

export function HintsBanner({ place, variant = "default" }: { place: HintPlace; variant?: HintsBannerVariant }) {
  const hints = hintsFor(place);
  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * hints.length),
  );
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeOutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeInRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTransitionTimers = useCallback(() => {
    if (fadeOutRef.current) {
      clearTimeout(fadeOutRef.current);
      fadeOutRef.current = null;
    }
    if (fadeInRef.current) {
      clearTimeout(fadeInRef.current);
      fadeInRef.current = null;
    }
  }, []);

  const goTo = useCallback((next: number) => {
    clearTransitionTimers();
    setVisible(false);
    fadeOutRef.current = setTimeout(() => {
      setIndex(next);
      fadeInRef.current = setTimeout(() => {
        setVisible(true);
        fadeInRef.current = null;
      }, SWAP_PAUSE);
      fadeOutRef.current = null;
    }, FADE_OUT_DURATION);
  }, [clearTransitionTimers]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      goTo((index + 1) % hints.length);
    }, CYCLE_INTERVAL);
  }, [index, goTo, hints.length]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearTransitionTimers();
    };
  }, [clearTransitionTimers]);

  const prev = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    goTo((index - 1 + hints.length) % hints.length);
  };

  const next = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    goTo((index + 1) % hints.length);
  };

  const wrapperClass = variant === "dark"
    ? "rounded-md border-l-[3px] border-l-amber-500 bg-black/40 flex items-center gap-2 !mb-0 py-1.5 px-3"
    : variant === "rail"
      ? "hint-rail flex items-center gap-2 !mb-0 py-1.5 px-3 sm:px-4"
      : "callout callout-tip flex items-center gap-2 !mb-0 !py-1.5";
  const labelClass = variant === "rail"
    ? "text-amber-200/95 font-semibold text-xs uppercase tracking-[0.04em] shrink-0"
    : "text-amber-400 font-medium text-xs shrink-0";
  const navButtonClass = variant === "rail"
    ? "touch-area text-[var(--ivory-muted)] hover:text-[var(--ivory)] transition-colors text-base leading-none shrink-0 px-1"
    : "text-[var(--ivory-muted)] hover:text-[var(--ivory)] transition-colors text-sm shrink-0";
  const tipTextClass = variant === "rail"
    ? "text-[12px] text-[var(--ivory-muted)]"
    : "text-xs text-[var(--ivory-muted)]";

  return (
    <div className={wrapperClass}>
      {variant !== "rail" ? <span className={labelClass}>Tip</span> : null}
      <button
        onClick={prev}
        className={navButtonClass}
        aria-label="Previous tip"
      >
        ‹
      </button>
      <p
        className={`flex-1 text-center leading-tight ${tipTextClass} ${visible ? "hint-fade-in" : "hint-fade-out"}`}
      >
        {textForInput(hints[index])}
      </p>
      <button
        onClick={next}
        className={navButtonClass}
        aria-label="Next tip"
      >
        ›
      </button>
    </div>
  );
}
