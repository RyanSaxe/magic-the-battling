import { useState, useEffect, useRef, useCallback } from "react";
import { GAME_HINTS } from "../../constants/hints";

const CYCLE_INTERVAL = 8000;
const FADE_DURATION = 200;

export function HintsBanner({ variant = "default" }: { variant?: "default" | "dark" } = {}) {
  const [index, setIndex] = useState(
    () => Math.floor(Math.random() * GAME_HINTS.length),
  );
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const goTo = useCallback((next: number) => {
    setVisible(false);
    setTimeout(() => {
      setIndex(next);
      setVisible(true);
    }, FADE_DURATION);
  }, []);

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
    : "callout callout-tip flex items-center gap-2 !mb-0 !py-1.5";

  return (
    <div className={wrapperClass}>
      <span className="text-amber-400 font-medium text-xs shrink-0">Tip:</span>
      <button
        onClick={prev}
        className="text-gray-500 hover:text-gray-300 transition-colors text-sm shrink-0"
        aria-label="Previous tip"
      >
        ‹
      </button>
      <p
        className={`flex-1 text-center text-xs text-gray-300 leading-tight ${visible ? "hint-fade-in" : "hint-fade-out"}`}
      >
        {GAME_HINTS[index]}
      </p>
      <button
        onClick={next}
        className="text-gray-500 hover:text-gray-300 transition-colors text-sm shrink-0"
        aria-label="Next tip"
      >
        ›
      </button>
    </div>
  );
}
