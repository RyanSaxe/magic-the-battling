import { useEffect, useRef } from "react";
import { shouldCloseSubmitPopoverOnOutsideClick } from "./submitPopoverState";

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

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (!ref.current || !target) {
        return;
      }

      const clickedIgnoredElement = !!(
        ignoreOutsideClickSelector
        && target instanceof Element
        && target.closest(ignoreOutsideClickSelector)
      );

      if (shouldCloseSubmitPopoverOnOutsideClick({
        closeOnOutsideClick,
        clickedInsidePopover: ref.current.contains(target),
        clickedIgnoredElement,
      })) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [closeOnOutsideClick, ignoreOutsideClickSelector, onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 right-0 min-w-[120px] z-[95]"
      data-guide-target={guideTarget}
    >
      <div className="relative translate-y-[3px] modal-chrome backdrop-blur border gold-border rounded-lg shadow-2xl p-2 flex flex-col gap-1.5">
        {options.map((option) => (
          <button
            key={option.label}
            onClick={option.onClick}
            className={option.className ?? "btn btn-secondary text-sm py-1.5"}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
