import type { ReactElement } from "react";
import { enterPressesControl } from "../../utils/enterKey";

interface CardSlotProps {
  label: string;
  dimensions: { width: number; height: number };
  selected?: boolean;
  onClick?: () => void;
}

function shouldActivateSlotOnKey(
  e: React.KeyboardEvent<HTMLButtonElement>,
): boolean {
  if (e.defaultPrevented || e.target !== e.currentTarget) return false;
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  if (e.key === "Enter") return enterPressesControl(e.nativeEvent);
  return e.key === " " || e.key === "Spacebar";
}

export function CardSlot({
  label,
  dimensions,
  selected = false,
  onClick,
}: CardSlotProps): ReactElement {
  const borderClass = selected
    ? "border-amber-400 ring-2 ring-amber-400/50"
    : "border-[var(--stone-light)]/60";
  const labelElement = (
    <span
      className={`text-[9px] text-[var(--ivory-muted)] text-center leading-tight ${
        label.startsWith("+")
          ? "whitespace-pre-line first-line:text-[16px]"
          : "px-1"
      }`}
    >
      {label}
    </span>
  );

  if (onClick) {
    return (
      <button
        type="button"
        // A long label spills out of a small slot, so each slot's own box takes taps above its neighbors' labels.
        className={`card-slot after:absolute after:z-1 after:size-[inherit] flex items-center justify-center rounded border-2 border-dashed bg-transparent p-0 cursor-pointer ${borderClass}`}
        style={{ width: dimensions.width, height: dimensions.height }}
        aria-label="Empty hand slot"
        aria-pressed={selected}
        onClick={onClick}
        onKeyDown={(e) => {
          if (!shouldActivateSlotOnKey(e)) return;
          e.preventDefault();
          onClick();
        }}
      >
        {labelElement}
      </button>
    );
  }

  return (
    <div
      className={`card-slot after:absolute after:z-1 after:size-[inherit] flex items-center justify-center rounded border-2 border-dashed ${borderClass}`}
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      {labelElement}
    </div>
  );
}
