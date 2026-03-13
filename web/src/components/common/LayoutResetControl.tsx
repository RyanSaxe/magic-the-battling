import { useState } from "react";

interface LayoutResetControlProps {
  phaseLabel: string;
  currentStage: number;
  currentRound: number;
  originStage: number | null;
  originRound: number | null;
  isInherited: boolean;
  onConfirm: () => void;
  position?: "top-right" | "bottom-right";
  message?: string;
}

function positionClasses(position: "top-right" | "bottom-right") {
  if (position === "bottom-right") {
    return {
      wrapper: "absolute right-2 bottom-2 z-40 pointer-events-auto",
      popover: "absolute right-0 bottom-full mb-2",
    };
  }

  return {
    wrapper: "absolute right-2 top-2 z-40 pointer-events-auto sm:right-0 sm:top-0 sm:-translate-y-[calc(100%+0.5rem)]",
    popover: "absolute right-0 top-full mt-2",
  };
}

export function LayoutResetControl({
  phaseLabel,
  currentStage,
  currentRound,
  originStage,
  originRound,
  isInherited,
  onConfirm,
  position = "top-right",
  message,
}: LayoutResetControlProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { wrapper, popover } = positionClasses(position);

  return (
    <div className={wrapper} onClick={(e) => e.stopPropagation()}>
      <div className="relative">
        <button
          type="button"
          className="modal-chrome border gold-border rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-100/85 hover:text-white shadow-lg"
          onClick={() => setConfirmOpen((open) => !open)}
        >
          Reset Layout
        </button>
        {confirmOpen && (
          <div
            className={`${popover} w-64 modal-chrome border gold-border rounded-lg shadow-xl px-3 py-2 text-left`}
          >
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
              Reset {phaseLabel}
            </div>
            {isInherited && originStage != null && originRound != null && (
              <div className="mt-2 text-xs text-gray-300">
                Current layout is inherited from Stage {originStage}, Round {originRound}.
              </div>
            )}
            <div className="mt-2 text-xs leading-snug text-gray-200">
              {message ??
                `This resets Stage ${currentStage}, Round ${currentRound} and all future ${phaseLabel.toLowerCase()} layouts on this device.`}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-white"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md border gold-border bg-[#2a2320] px-2.5 py-1 text-xs text-amber-100 hover:text-white"
                onClick={() => {
                  onConfirm();
                  setConfirmOpen(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
