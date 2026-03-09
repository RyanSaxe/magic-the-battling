import {
  type DividerDragCallbacks,
  useDividerDrag,
} from "../../hooks/useDividerDrag";

interface ZoneDividerProps extends DividerDragCallbacks {
  orientation: "horizontal" | "vertical";
  interactive?: boolean;
}

export function ZoneDivider({
  orientation,
  onDragStart,
  onDrag,
  onDragEnd,
  onDoubleClick,
  interactive = true,
}: ZoneDividerProps) {
  const dragBindings = useDividerDrag({
    orientation,
    callbacks: { onDragStart, onDrag, onDragEnd, onDoubleClick },
    enabled: interactive,
  });

  const isHorizontal = orientation === "horizontal";

  return (
    <div
      style={{
        position: "relative",
        flexShrink: 0,
        ...(isHorizontal
          ? { height: 2, width: "100%" }
          : { width: 2, height: "100%" }),
        background: "var(--seam-stroke)",
      }}
    >
      <div
        {...dragBindings}
        style={{
          position: "absolute",
          cursor: interactive
            ? isHorizontal
              ? "row-resize"
              : "col-resize"
            : undefined,
          touchAction: interactive ? "none" : undefined,
          ...(isHorizontal
            ? { top: -5, left: 0, right: 0, height: 12 }
            : { left: -5, top: 0, bottom: 0, width: 12 }),
        }}
      />
    </div>
  );
}
