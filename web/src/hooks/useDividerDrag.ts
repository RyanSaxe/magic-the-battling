/**
 * Pointer-drag interaction hook for resizable zone dividers.
 * Uses React 19.2 `useEffectEvent` for window listeners without ref-sync effects.
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEventHandler,
  type PointerEventHandler,
} from "react";

export interface DividerDragCallbacks {
  onDragStart: () => void;
  onDrag: (deltaPx: number) => void;
  onDragEnd: () => void;
  onDoubleClick?: () => void;
}

interface UseDividerDragOptions {
  orientation: "horizontal" | "vertical";
  callbacks: DividerDragCallbacks;
  enabled?: boolean;
}

export function useDividerDrag({
  orientation,
  callbacks,
  enabled = true,
}: UseDividerDragOptions): Pick<
  HTMLAttributes<HTMLElement>,
  "onClick" | "onDoubleClick" | "onPointerDown"
> {
  const [activePointerId, setActivePointerId] = useState<number | null>(null);
  const startPosRef = useRef(0);
  const userSelectRef = useRef("");

  const finishDrag = useEffectEvent(() => {
    document.body.style.userSelect = userSelectRef.current;
    callbacks.onDragEnd();
  });

  const handleWindowPointerMove = useEffectEvent((event: PointerEvent) => {
    if (!enabled || event.pointerId !== activePointerId) return;
    event.preventDefault();
    const current =
      orientation === "horizontal" ? event.clientY : event.clientX;
    const delta = current - startPosRef.current;
    if (!delta) return;
    startPosRef.current = current;
    callbacks.onDrag(delta);
  });

  const handleWindowPointerEnd = useEffectEvent((event: PointerEvent) => {
    if (event.pointerId !== activePointerId) return;
    setActivePointerId(null);
  });

  useEffect(() => {
    if (activePointerId === null) return undefined;
    window.addEventListener("pointermove", handleWindowPointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handleWindowPointerEnd);
    window.addEventListener("pointercancel", handleWindowPointerEnd);
    return (): void => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerEnd);
      window.removeEventListener("pointercancel", handleWindowPointerEnd);
      finishDrag();
    };
  }, [activePointerId]);

  const handlePointerDown: PointerEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (!enabled) return;

      event.preventDefault();
      event.stopPropagation();

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture can fail if the target unmounts mid-drag.
      }

      userSelectRef.current = document.body.style.userSelect;
      document.body.style.userSelect = "none";
      startPosRef.current =
        orientation === "horizontal" ? event.clientY : event.clientX;
      setActivePointerId(event.pointerId);
      callbacks.onDragStart();
    },
    [callbacks, enabled, orientation],
  );

  const handleClick: MouseEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (!enabled) return;
      event.preventDefault();
      event.stopPropagation();
    },
    [enabled],
  );

  const handleDoubleClick: MouseEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (!enabled || !callbacks.onDoubleClick) return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.onDoubleClick();
    },
    [callbacks, enabled],
  );

  return {
    onClick: handleClick,
    onDoubleClick: handleDoubleClick,
    onPointerDown: handlePointerDown,
  };
}
