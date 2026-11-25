import type { CSSProperties, ReactElement, ReactNode } from "react";
import {
  type DividerDragCallbacks,
  useDividerDrag,
} from "../../hooks/useDividerDrag";

export const badgeCls =
  "bg-[var(--zone-label-bg)] text-[var(--ivory-soft)] text-[10px] uppercase tracking-widest " +
  "px-2.5 py-0.5 rounded-full border zone-label-pill whitespace-nowrap " +
  "inline-flex items-center gap-1.5";

const badgeWrapCls =
  "absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 z-40 inline-flex px-2 py-1 select-none";

const constrainedWrapCls = "max-w-[calc(100%-0.5rem)]";
const constrainedBadgeCls = "min-w-0 max-w-full";
const compactBadgeCls = "px-1.5 gap-1 text-[9px] tracking-[0.12em]";

const noopDragCallbacks: DividerDragCallbacks = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
};

const gripBarStyle: CSSProperties = {
  width: 1,
  height: 6,
  borderRadius: 999,
  background: "rgba(255, 236, 181, 0.48)",
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.38)",
};

interface ZoneLabelProps {
  children: ReactNode;
  className?: string;
  wrapClassName?: string;
  dragCallbacks?: DividerDragCallbacks | null;
  compact?: boolean;
  constrainToParent?: boolean;
  hideGrip?: boolean;
}

function resolveZoneLabelClasses(options: {
  className?: string;
  wrapClassName?: string;
  compact: boolean;
  constrainToParent: boolean;
}): { wrapClasses: string; badgeClasses: string; textClasses: string } {
  const wrapClasses = [
    badgeWrapCls,
    options.constrainToParent ? constrainedWrapCls : "",
    options.wrapClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const badgeClasses = [
    badgeCls,
    options.constrainToParent ? constrainedBadgeCls : "",
    options.compact ? compactBadgeCls : "",
    options.className,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    wrapClasses,
    badgeClasses,
    textClasses: options.constrainToParent ? "min-w-0 truncate" : "",
  };
}

export function ZoneLabel(props: ZoneLabelProps): ReactElement {
  const {
    children,
    className,
    wrapClassName,
    dragCallbacks,
    compact,
    constrainToParent,
    hideGrip,
  } = props;
  const hasDrag = Boolean(dragCallbacks);
  const dragBindings = useDividerDrag({
    orientation: "horizontal",
    callbacks: dragCallbacks ?? noopDragCallbacks,
    enabled: hasDrag,
  });
  const { wrapClasses, badgeClasses, textClasses } = resolveZoneLabelClasses({
    className,
    wrapClassName,
    compact: Boolean(compact),
    constrainToParent: Boolean(constrainToParent),
  });

  return (
    <span
      className={wrapClasses}
      data-zone-label
      data-drag-handle={hasDrag ? "true" : undefined}
      style={
        hasDrag ? { touchAction: "none", cursor: "row-resize" } : undefined
      }
      {...dragBindings}
    >
      <span className={badgeClasses}>
        {!hideGrip && (
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-[2px] opacity-70 shrink-0"
          >
            <span style={gripBarStyle} />
            <span style={gripBarStyle} />
            <span style={gripBarStyle} />
          </span>
        )}
        <span className={textClasses}>{children}</span>
      </span>
    </span>
  );
}
