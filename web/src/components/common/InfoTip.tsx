import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { useEscapeKey, useWindowEvent } from "../../hooks/useDomEffects";
import { InfoIcon } from "../icons/InfoIcon";
import { usePanelHoldsEnter } from "../../hooks/usePanelHoldsEnter";
import { BoardBackdrop } from "./BoardBackdrop";
import { POPOVER_CHROME } from "./styles";

const TIP_WIDTH = 256;
const SCREEN_EDGE = 8;
const ROOM_NEEDED_ABOVE = 104;

function placeBeside(anchor: DOMRect): CSSProperties {
  const width = Math.min(TIP_WIDTH, window.innerWidth - 2 * SCREEN_EDGE);
  const left = Math.min(
    Math.max(anchor.right - width, SCREEN_EDGE),
    window.innerWidth - SCREEN_EDGE - width,
  );
  return anchor.top >= ROOM_NEEDED_ABOVE
    ? { left, width, bottom: window.innerHeight - anchor.top }
    : { left, width, top: anchor.bottom };
}

/** An ⓘ that explains the setting beside it on hover or focus, and until the next press when clicked or tapped. */
export function InfoTip({
  label,
  text,
}: {
  label: string;
  text: string;
}): ReactElement {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{
    placement: CSSProperties;
    pinned: boolean;
  } | null>(null);
  const isOpen = tip !== null;
  usePanelHoldsEnter(!!tip?.pinned);

  const show = (pinned: boolean): void => {
    const button = buttonRef.current;
    if (!button) return;
    const placement = placeBeside(button.getBoundingClientRect());
    setTip((open) => ({ placement, pinned: pinned || !!open?.pinned }));
  };

  useWindowEvent(
    "pointerdown",
    (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        buttonRef.current?.contains(target) ||
        backdropRef.current?.contains(target)
      ) {
        return;
      }
      setTip(null);
    },
    { enabled: isOpen },
  );
  useEscapeKey(() => setTip(null), { enabled: isOpen });
  useWindowEvent("resize", () => show(false), { enabled: isOpen });
  useWindowEvent("scroll", () => show(false), {
    enabled: isOpen,
    capture: true,
  });

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-describedby={isOpen ? id : undefined}
        onClick={() => (tip?.pinned ? setTip(null) : show(true))}
        onFocus={() => show(false)}
        // Pressing the backdrop blurs the button to nothing. The backdrop closes the tip on the click that follows.
        onBlur={(event) => {
          if (!tip?.pinned || event.relatedTarget) setTip(null);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") show(false);
        }}
        onPointerLeave={(event) => {
          if (
            event.pointerType === "mouse" &&
            !tip?.pinned &&
            document.activeElement !== buttonRef.current
          ) {
            setTip(null);
          }
        }}
        className="icon-target"
      >
        <InfoIcon size="md" className="h-3.5 w-3.5" />
      </button>
      {/* Only a pinned tip covers the felt: over a hovered one, the cover would end the hover */}
      {tip?.pinned && (
        <BoardBackdrop ref={backdropRef} onTap={() => setTip(null)} />
      )}
      {/* Out of the setup screens' scroll and zoom, which would clip and misplace it */}
      {tip &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={tip.placement}
            className={`pointer-events-none fixed z-[60] p-2 text-left text-[11px] leading-4 text-[var(--ivory)] min-[1920px]:text-sm ${POPOVER_CHROME}`}
          >
            {text}
          </span>,
          document.body,
        )}
    </>
  );
}
