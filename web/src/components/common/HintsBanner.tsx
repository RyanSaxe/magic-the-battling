import { useState, useEffect, useRef, useCallback } from "react";
import { GAME_HINTS } from "../../constants/hints";

const CYCLE_INTERVAL = 8000;
const FADE_DURATION = 200;

export function HintsBanner() {
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

  return (
    <div className="flex items-center gap-2 w-full">
      <button
        onClick={prev}
        className="text-gray-500 hover:text-gray-300 transition-colors text-sm shrink-0"
        aria-label="Previous tip"
      >
        ‹
      </button>
      <div className="relative flex-1 h-5 sm:h-10 overflow-hidden">
        <p
          className={`absolute inset-0 flex items-center justify-center text-center text-xs text-gray-400 leading-tight ${visible ? "hint-fade-in" : "hint-fade-out"}`}
        >
          <span className="text-amber-500/80 font-medium mr-1.5">Tip:</span>
          {GAME_HINTS[index]}
        </p>
      </div>
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
