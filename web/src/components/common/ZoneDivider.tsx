import { useRef, useCallback } from "react";

interface ZoneDividerProps {
  orientation: "horizontal" | "vertical";
  onDragStart: () => void;
  onDrag: (deltaPx: number) => void;
  onDragEnd: () => void;
  onDoubleClick?: () => void;
}

export function ZoneDivider({
  orientation,
  onDragStart,
  onDrag,
  onDragEnd,
  onDoubleClick,
}: ZoneDividerProps) {
  const startPos = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startPos.current =
        orientation === "horizontal" ? e.clientY : e.clientX;
      document.body.style.userSelect = "none";
      onDragStart();
    },
    [orientation, onDragStart],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!e.buttons) return;
      const current =
        orientation === "horizontal" ? e.clientY : e.clientX;
      const delta = current - startPos.current;
      startPos.current = current;
      onDrag(delta);
    },
    [orientation, onDrag],
  );

  const handlePointerUp = useCallback(() => {
    document.body.style.userSelect = "";
    onDragEnd();
  }, [onDragEnd]);

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={onDoubleClick}
        style={{
          position: "absolute",
          cursor: isHorizontal ? "row-resize" : "col-resize",
          touchAction: "none",
          ...(isHorizontal
            ? { top: -5, left: 0, right: 0, height: 12 }
            : { left: -5, top: 0, bottom: 0, width: 12 }),
        }}
      />
    </div>
  );
}
