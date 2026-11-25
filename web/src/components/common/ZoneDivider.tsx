import type { ReactElement } from "react";
import {
  type DividerDragCallbacks,
  useDividerDrag,
} from "../../hooks/useDividerDrag";

interface ZoneDividerProps extends DividerDragCallbacks {
  orientation: "horizontal" | "vertical";
  interactive?: boolean;
}

function resolveDividerCursor(
  interactive: boolean,
  isHorizontal: boolean,
): "row-resize" | "col-resize" | undefined {
  if (!interactive) return undefined;
  return isHorizontal ? "row-resize" : "col-resize";
}

export function ZoneDivider({
  orientation,
  onDragStart,
  onDrag,
  onDragEnd,
  onDoubleClick,
  interactive = true,
}: ZoneDividerProps): ReactElement {
  const dragBindings = useDividerDrag({
    orientation,
    callbacks: { onDragStart, onDrag, onDragEnd, onDoubleClick },
    enabled: interactive,
  });

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      className={
        isHorizontal
          ? "zone-divider-line zone-divider-line--horizontal"
          : "zone-divider-line zone-divider-line--vertical"
      }
      style={{
        position: "relative",
        flexShrink: 0,
        ...(isHorizontal
          ? { height: 2, width: "100%" }
          : { width: 2, height: "100%" }),
      }}
    >
      <div
        {...dragBindings}
        style={{
          position: "absolute",
          cursor: resolveDividerCursor(interactive, isHorizontal),
          touchAction: interactive ? "none" : undefined,
          ...(isHorizontal
            ? { top: -5, left: 0, right: 0, height: 12 }
            : { left: -5, top: 0, bottom: 0, width: 12 }),
        }}
      />
    </div>
  );
}
