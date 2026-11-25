/** Context menu for fight-phase library actions (draw and shuffle). */
import { useCallback, type ReactNode } from "react";
import { POPOVER_CHROME } from "../../components/common/styles";
import { useEscapeKey } from "../../hooks/useDomEffects";
import { usePanelHoldsEnter } from "../../hooks/usePanelHoldsEnter";

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
}: ZoneActionMenuProps): ReactNode {
  const menuRef = useCallback(
    (node: HTMLDivElement | null): void => {
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
    (event): void => {
      event.preventDefault();
      onClose();
    },
    { capture: true },
  );

  return (
    <>
      <button
        type="button"
        aria-label="Close library menu"
        className="fixed inset-0 z-50 cursor-default bg-transparent border-0 p-0"
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className={`fixed ${POPOVER_CHROME} py-1 min-w-[160px] z-[51]`}
      >
        <button
          type="button"
          onClick={(): void => {
            onDraw();
            onClose();
          }}
          className="menu-item w-full px-3 py-1.5 text-left text-sm text-white transition-colors"
        >
          Draw
        </button>
        <button
          type="button"
          onClick={(): void => {
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
