/** Interactive Build-phase basic land slot with an accessible land picker popover. */
import { useState, useRef, type KeyboardEvent, type ReactElement } from "react";
import { createPortal } from "react-dom";
import {
  useAutoFocus,
  useDocumentEvent,
  useEscapeKey,
} from "../../hooks/useDomEffects";
import { BasicLandCard } from "./BasicLandCard";
import { BoardBackdrop } from "./BoardBackdrop";
import { CardSlot } from "./CardSlot";
import { BASIC_LANDS, BASIC_LAND_IMAGES } from "../../constants/assets";
import { CARD_ASPECT_RATIO } from "../../hooks/cardSizeUtils";
import { POPOVER_CHROME } from "./styles";
import { usePanelHoldsEnter } from "../../hooks/usePanelHoldsEnter";

const VIEWPORT_MARGIN = 8;
const POPOVER_PADDING = 8; // p-2
const GRID_GAP = 6; // gap-1.5
const BUTTON_PADDING = 4; // p-1
const LABEL_HEIGHT = 14;
const LABEL_GAP = 2; // gap-0.5

function nextMenuOptionIndex(
  key: string,
  currentIndex: number,
  count: number,
): number | null {
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return currentIndex < 0 ? 0 : (currentIndex + 1) % count;
    case "ArrowUp":
    case "ArrowLeft":
      return currentIndex < 0 ? count - 1 : (currentIndex - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}

interface BasicLandSlotProps {
  selected: string | null;
  dimensions: { width: number; height: number };
  onPick: (name: string) => void;
  isMobile?: boolean;
}

export function BasicLandSlot({
  selected,
  dimensions,
  onPick,
  isMobile = false,
}: BasicLandSlotProps): ReactElement {
  const [open, setOpen] = useState(false);
  usePanelHoldsEnter(open);
  const triggerRef = useRef<HTMLDivElement>(null);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [landSize, setLandSize] = useState({
    w: dimensions.width,
    h: Math.round(dimensions.width * CARD_ASPECT_RATIO),
  });

  useAutoFocus(firstOptionRef, open);

  useDocumentEvent(
    "mousedown",
    (e) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target) ||
        backdropRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    },
    { enabled: open },
  );

  useEscapeKey(
    (event) => {
      event.preventDefault();
      // The picker is on top, and not everything that can be open under it checks defaultPrevented.
      event.stopImmediatePropagation();
      setOpen(false);
      triggerButtonRef.current?.focus();
    },
    { enabled: open, capture: true },
  );

  const handleToggle = (): void => {
    if (open) {
      setOpen(false);
      return;
    }
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const NON_LAND_H =
      2 * POPOVER_PADDING +
      GRID_GAP +
      2 * (2 * BUTTON_PADDING + LABEL_GAP + LABEL_HEIGHT);
    const availableHeight = vh - rect.bottom - 4 - VIEWPORT_MARGIN;
    const maxFromVertical = Math.floor(
      (availableHeight - NON_LAND_H) / (2 * CARD_ASPECT_RATIO),
    );
    const maxFromHorizontal = Math.floor(
      (vw -
        2 * VIEWPORT_MARGIN -
        2 * POPOVER_PADDING -
        2 * GRID_GAP -
        6 * BUTTON_PADDING) /
        3,
    );

    const landWidth = Math.min(
      dimensions.width,
      maxFromHorizontal,
      maxFromVertical,
    );
    const landHeight = Math.round(landWidth * CARD_ASPECT_RATIO);
    setLandSize({ w: landWidth, h: landHeight });

    const popoverWidth =
      3 * landWidth + 6 * BUTTON_PADDING + 2 * GRID_GAP + 2 * POPOVER_PADDING;

    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(left, vw - popoverWidth - VIEWPORT_MARGIN),
    );

    const top = rect.bottom + 4;

    setPos({ top, left });
    setOpen(true);
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const buttons = popoverRef.current
      ? Array.from(
          popoverRef.current.querySelectorAll<HTMLButtonElement>("button"),
        )
      : [];
    if (buttons.length === 0) return;
    const currentIndex = buttons.findIndex(
      (button) => button === document.activeElement,
    );
    const nextIndex = nextMenuOptionIndex(
      event.key,
      currentIndex,
      buttons.length,
    );
    if (nextIndex !== null) {
      event.preventDefault();
      buttons[nextIndex]?.focus();
    }
  };

  const emptyLabel = isMobile ? "+\nLand" : "Click to pick basic land";
  const triggerLabel = selected ? `Basic land: ${selected}` : "Pick basic land";

  return (
    <div ref={triggerRef}>
      <button
        ref={triggerButtonRef}
        type="button"
        onClick={handleToggle}
        aria-label={triggerLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className="cursor-pointer border-0 bg-transparent p-0 text-left block focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] focus-visible:outline-offset-[-2px] rounded-[var(--card-border-radius)]"
      >
        {selected ? (
          <BasicLandCard name={selected} dimensions={dimensions} />
        ) : (
          <CardSlot label={emptyLabel} dimensions={dimensions} />
        )}
      </button>
      {open && <BoardBackdrop ref={backdropRef} onTap={() => setOpen(false)} />}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="menu"
            tabIndex={-1}
            onKeyDown={handleMenuKeyDown}
            className={`fixed z-[95] ${POPOVER_CHROME} p-2`}
            style={{ top: pos.top, left: pos.left }}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {BASIC_LANDS.map(({ name }, index) => (
                <button
                  key={name}
                  ref={index === 0 ? firstOptionRef : undefined}
                  type="button"
                  onClick={() => {
                    onPick(name);
                    setOpen(false);
                    triggerButtonRef.current?.focus();
                  }}
                  className="menu-item flex flex-col items-center gap-0.5 p-1 rounded focus-visible:outline-2 focus-visible:outline-[var(--color-gold)] focus-visible:outline-offset-[-2px]"
                >
                  <img
                    src={BASIC_LAND_IMAGES[name]}
                    alt=""
                    className="object-cover"
                    style={{
                      width: landSize.w,
                      height: landSize.h,
                      borderRadius: "var(--card-border-radius)",
                    }}
                  />
                  <span className="text-[9px] text-[var(--ivory-muted)]">
                    {name}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
