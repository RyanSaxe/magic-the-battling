import { enterPressesControl } from "../../utils/enterKey";

interface CardSlotProps {
  label: string;
  dimensions: { width: number; height: number };
  selected?: boolean;
  onClick?: () => void;
}

export function CardSlot({
  label,
  dimensions,
  selected = false,
  onClick,
}: CardSlotProps) {
  const isInteractive = Boolean(onClick);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!onClick || e.defaultPrevented) return;
    if (e.target !== e.currentTarget) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;

    const isEnter = e.key === "Enter";
    const isSpace = e.key === " " || e.key === "Spacebar";
    if (!isEnter && !isSpace) return;
    if (isEnter && !enterPressesControl(e.nativeEvent)) return;

    e.preventDefault();
    onClick();
  };

  return (
    <div
      // A long label spills out of a small slot, so each slot's own box takes taps above its neighbors' labels.
      className={`card-slot after:absolute after:z-1 after:size-[inherit] flex items-center justify-center rounded border-2 border-dashed ${
        selected
          ? "border-amber-400 ring-2 ring-amber-400/50"
          : "border-[var(--stone-light)]/60"
      } ${isInteractive ? "cursor-pointer" : ""}`}
      style={{ width: dimensions.width, height: dimensions.height }}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={isInteractive ? "Empty hand slot" : undefined}
      aria-pressed={isInteractive ? selected : undefined}
      onClick={onClick}
      onKeyDown={isInteractive ? handleKeyDown : undefined}
    >
      <span
        className={`text-[9px] text-[var(--ivory-muted)] text-center leading-tight ${
          label.startsWith("+")
            ? "whitespace-pre-line first-line:text-[16px]"
            : "px-1"
        }`}
      >
        {label}
      </span>
    </div>
  );
}
