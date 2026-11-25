import { useEffect } from "react";

const CLICK_FOLLOWS_TOUCH_MS = 1000;

function inMiddleThird(point: number, start: number, size: number): boolean {
  return point >= start + size / 3 && point <= start + (2 * size) / 3;
}

/**
 * Gives a tap on the middle of a card to the card. Phone browsers move a tap's click onto a button a few pixels
 * away, which on a small card is the preview or a pill. Outside the middle that help for near misses stays.
 */
export function useCardMiddleTap(): void {
  useEffect(() => {
    let touch: { x: number; y: number; at: number } | null = null;

    const rememberTouch = (event: TouchEvent): void => {
      // The touch keeps the finger's position. The click that follows carries the moved one.
      const { clientX, clientY } = event.changedTouches[0];
      touch = { x: clientX, y: clientY, at: event.timeStamp };
    };

    const reclaimClick = (event: MouseEvent): void => {
      const tap = touch;
      touch = null;
      if (!tap || event.timeStamp - tap.at > CLICK_FOLLOWS_TOUCH_MS) return;
      if (
        !(event.target instanceof Element) ||
        !event.target.closest("button")
      ) {
        return;
      }

      const touched = document.elementFromPoint(tap.x, tap.y);
      if (!touched || touched.closest("button")) return;
      const card = touched.closest<HTMLElement>(".card");
      if (!card) return;
      const { x, y, width, height } = card.getBoundingClientRect();
      if (!inMiddleThird(tap.x, x, width) || !inMiddleThird(tap.y, y, height)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      card.click();
    };

    document.addEventListener("touchend", rememberTouch, {
      capture: true,
      passive: true,
    });
    document.addEventListener("click", reclaimClick, true);
    return (): void => {
      document.removeEventListener("touchend", rememberTouch, true);
      document.removeEventListener("click", reclaimClick, true);
    };
  }, []);
}
