/**
 * Context menu for Battle library actions (Draw / Shuffle) positioned within
 * the viewport and capturing Escape while open.
 */
import { useCallback } from "react";
import { POPOVER_CHROME } from "../../components/common/styles";
import { useEscapeKey } from "../../hooks/useDomEffects";
import { usePanelHoldsEnter } from "../../utils/enterKey";

interface ZoneActionMenuProps {
  position: { x: number; y: number };
  onDraw: () => void;
  onShuffle: () => void;
  onClose: () => void;
}

export function ZoneActionMenu({
  position,
  onDraw,
  onShuffle,
  onClose,
}: ZoneActionMenuProps) {
  const menuRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const padding = 8;
      const x = Math.max(
        padding,
        Math.min(position.x, window.innerWidth - rect.width - padding),
      );
      const y = Math.max(
        padding,
        Math.min(position.y, window.innerHeight - rect.height - padding),
      );
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
    },
    [position],
  );

  usePanelHoldsEnter();
  // The menu is on top, so it takes Escape while the key is captured, before a panel under it hears it.
  useEscapeKey(
    (event) => {
      event.preventDefault();
      onClose();
    },
    { capture: true },
  );

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        ref={menuRef}
        className={`fixed ${POPOVER_CHROME} py-1 min-w-[160px] z-[51]`}
      >
        <button
          type="button"
          onClick={() => {
            onDraw();
            onClose();
          }}
          className="menu-item w-full px-3 py-1.5 text-left text-sm text-white transition-colors"
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => {
            onShuffle();
            onClose();
          }}
          className="menu-item w-full px-3 py-1.5 text-left text-sm text-white transition-colors"
        >
          Shuffle
        </button>
      </div>
    </>
  );
}
