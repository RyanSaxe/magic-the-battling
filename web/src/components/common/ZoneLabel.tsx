import type { ReactNode } from "react";
import {
  type DividerDragCallbacks,
  useDividerDrag,
} from "../../hooks/useDividerDrag";

export const badgeCls =
  "bg-[#2a2320] text-gray-400 text-[10px] uppercase tracking-widest " +
  "px-2.5 py-0.5 rounded-full border zone-label-pill whitespace-nowrap " +
  "inline-flex items-center gap-1.5";

const badgeWrapCls =
  "absolute left-1/2 -translate-x-1/2 -top-[13px] z-40 inline-flex px-2 py-1 select-none";

const noopDragCallbacks: DividerDragCallbacks = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
};

const gripBarStyle = {
  width: 1,
  height: 6,
  borderRadius: 999,
  background: "rgba(255, 236, 181, 0.48)",
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.38)",
} as const;

interface ZoneLabelProps {
  children: ReactNode;
  className?: string;
  mobileDragCallbacks?: DividerDragCallbacks | null;
}

export function ZoneLabel({
  children,
  className,
  mobileDragCallbacks = null,
}: ZoneLabelProps) {
  const dragBindings = useDividerDrag({
    orientation: "horizontal",
    callbacks: mobileDragCallbacks ?? noopDragCallbacks,
    enabled: !!mobileDragCallbacks,
  });

  return (
    <span
      className={badgeWrapCls}
      data-drag-handle={mobileDragCallbacks ? "true" : undefined}
      style={mobileDragCallbacks ? { touchAction: "none" } : undefined}
      {...dragBindings}
    >
      <span className={className ? `${badgeCls} ${className}` : badgeCls}>
        <span
          aria-hidden="true"
          className="inline-flex items-center gap-[2px] opacity-70"
        >
          <span style={gripBarStyle} />
          <span style={gripBarStyle} />
          <span style={gripBarStyle} />
        </span>
        <span>{children}</span>
      </span>
    </span>
  );
}
