import { useEffect, useRef } from "react";
import { BoardBackdrop } from "./BoardBackdrop";
import { shouldCloseSubmitPopoverOnOutsideClick } from "./submitPopoverState";
import { POPOVER_CHROME } from "./styles";

interface SubmitPopoverOption {
  label: string;
  onClick: () => void;
  className?: string;
}

interface SubmitPopoverProps {
  options: SubmitPopoverOption[];
  onClose: () => void;
  guideTarget?: string;
  closeOnOutsideClick?: boolean;
  ignoreOutsideClickSelector?: string;
}

export function SubmitPopover({
  options,
  onClose,
  guideTarget,
  closeOnOutsideClick = true,
  ignoreOutsideClickSelector,
}: SubmitPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let pressWasOutside = true;
    const handlePointerDown = (e: PointerEvent) => {
      const pressed = e.target as Node;
      pressWasOutside =
        !ref.current?.contains(pressed) &&
        !backdropRef.current?.contains(pressed);
    };
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!ref.current || !target || backdropRef.current?.contains(target)) {
        return;
      }

      const clickedIgnoredElement = !!(
        ignoreOutsideClickSelector &&
        target instanceof Element &&
        target.closest(ignoreOutsideClickSelector)
      );

      if (
        shouldCloseSubmitPopoverOnOutsideClick({
          closeOnOutsideClick,
          // A press dragged out of the choices or off the board clicks what the two places share, and doesn't close.
          clickedInsidePopover:
            !pressWasOutside || ref.current.contains(target),
          clickedIgnoredElement,
        })
      ) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Closing can bring a minimized Guide back, which would otherwise close on this same press.
      e.preventDefault();
      onClose();
    };
    // Closing on the press would bring that Guide back under the finger, and it would take the tap from the button.
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleClick, true);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("keydown", handleKey);
    };
  }, [closeOnOutsideClick, ignoreOutsideClickSelector, onClose]);

  return (
    <>
      {closeOnOutsideClick && (
        <BoardBackdrop ref={backdropRef} onTap={onClose} />
      )}
      <div
        ref={ref}
        className="absolute bottom-full mb-4 right-2 min-w-[120px] z-[95]"
        data-guide-target={guideTarget}
      >
        <div className={`relative ${POPOVER_CHROME} p-2 flex flex-col gap-1.5`}>
          {options.map((option) => (
            <button
              key={option.label}
              onClick={option.onClick}
              data-ends-phase
              className={option.className ?? "btn btn-secondary text-sm py-1.5"}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
