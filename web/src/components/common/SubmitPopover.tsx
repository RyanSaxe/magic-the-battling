import { useRef, type ReactElement } from "react";
import { useSubmitPopoverDismiss } from "../../hooks/ui/useDialogBehavior";
import { BoardBackdrop } from "./BoardBackdrop";
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
}: SubmitPopoverProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useSubmitPopoverDismiss({
    popoverRef: ref,
    backdropRef,
    closeOnOutsideClick,
    ignoreOutsideClickSelector,
    onClose,
  });

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
