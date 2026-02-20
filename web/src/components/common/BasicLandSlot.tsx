import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { BasicLandCard } from "./BasicLandCard";
import { CardSlot } from "./CardSlot";
import { BASIC_LANDS, BASIC_LAND_IMAGES } from "../../constants/assets";

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
}: BasicLandSlotProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        popoverRef.current?.contains(target)
      )
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleOpen = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2,
    });
    setOpen(true);
  };

  const emptyLabel = isMobile
    ? "Tap to pick basic land"
    : "Click to pick basic land";

  return (
    <div ref={triggerRef}>
      <div onClick={handleOpen} className="cursor-pointer">
        {selected ? (
          <BasicLandCard name={selected} dimensions={dimensions} />
        ) : (
          <CardSlot label={emptyLabel} dimensions={dimensions} />
        )}
      </div>
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-50 bg-gray-900 border border-gray-600 rounded-lg p-2 shadow-xl"
            style={{
              top: pos.top,
              left: pos.left,
              transform: "translateX(-50%)",
            }}
          >
            <div className="grid grid-cols-3 gap-1.5">
              {BASIC_LANDS.map(({ name }) => (
                <button
                  key={name}
                  onClick={() => {
                    onPick(name);
                    setOpen(false);
                  }}
                  className="flex flex-col items-center gap-0.5 p-1 rounded hover:bg-gray-700/50"
                >
                  <img
                    src={BASIC_LAND_IMAGES[name]}
                    alt={name}
                    className="w-10 h-14 object-cover"
                    style={{ borderRadius: "var(--card-border-radius)" }}
                  />
                  <span className="text-[9px] text-gray-400">{name}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
