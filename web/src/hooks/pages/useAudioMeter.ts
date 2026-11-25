/**
 * Animation-frame audio level meter for voice chat microphone indicators.
 *
 * Updates the `--mic-level` CSS custom property directly on the indicator bar
 * element to avoid React re-renders at display refresh rate.
 */
import { useEffect, useRef, type RefObject } from "react";
import { getAudioLevel } from "../useVoiceChat";

export function useAudioMeter(
  audioLevelKey?: string,
): RefObject<HTMLSpanElement | null> {
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!audioLevelKey) return;
    let rafId = 0;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      const el = barRef.current;
      if (!el) return;
      el.style.setProperty(
        "--mic-level",
        `${(getAudioLevel(audioLevelKey) * 100).toFixed(1)}%`,
      );
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [audioLevelKey]);

  return barRef;
}
