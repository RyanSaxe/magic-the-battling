import { useState, useEffect, useRef, useCallback } from "react";
import { GAME_HINTS } from "../../constants/hints";

const CYCLE_INTERVAL = 8000;
const FADE_OUT_DURATION = 280;
const SWAP_PAUSE = 80;

type HintsBannerVariant = "default" | "dark" | "rail";

export function HintsBanner({ variant = "default" }: { variant?: HintsBannerVariant } = {}) {
  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * GAME_HINTS.length),
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
      goTo((index + 1) % GAME_HINTS.length);
    }, CYCLE_INTERVAL);
  }, [index, goTo]);

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
    goTo((index - 1 + GAME_HINTS.length) % GAME_HINTS.length);
  };

  const next = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    goTo((index + 1) % GAME_HINTS.length);
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
    ? "text-amber-100/60 hover:text-amber-100 transition-colors text-base leading-none shrink-0 px-1"
    : "text-gray-500 hover:text-gray-300 transition-colors text-sm shrink-0";
  const tipTextClass = variant === "rail"
    ? "text-[12px] text-amber-50/90"
    : "text-xs text-gray-300";

  return (
    <div className={wrapperClass}>
      <span className={labelClass}>Tip</span>
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
        {GAME_HINTS[index]}
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
