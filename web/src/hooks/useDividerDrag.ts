import { useCallback, useEffect, useRef } from "react";
import type {
  HTMLAttributes,
  MouseEventHandler,
  PointerEventHandler,
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
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const startPosRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const removeListenersRef = useRef<(() => void) | null>(null);
  const userSelectRef = useRef("");

  const endDrag = useCallback(() => {
    if (activePointerIdRef.current === null) return;

    activePointerIdRef.current = null;
    removeListenersRef.current?.();
    removeListenersRef.current = null;
    document.body.style.userSelect = userSelectRef.current;
    callbacksRef.current.onDragEnd();
  }, []);

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      if (!enabled || event.pointerId !== activePointerIdRef.current) return;

      event.preventDefault();
      const current =
        orientation === "horizontal" ? event.clientY : event.clientX;
      const delta = current - startPosRef.current;

      if (!delta) return;

      startPosRef.current = current;
      callbacksRef.current.onDrag(delta);
    },
    [enabled, orientation],
  );

  const handleWindowPointerEnd = useCallback(
    (event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return;
      endDrag();
    },
    [endDrag],
  );

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
      activePointerIdRef.current = event.pointerId;

      window.addEventListener("pointermove", handleWindowPointerMove, {
        passive: false,
      });
      window.addEventListener("pointerup", handleWindowPointerEnd);
      window.addEventListener("pointercancel", handleWindowPointerEnd);
      removeListenersRef.current = () => {
        window.removeEventListener("pointermove", handleWindowPointerMove);
        window.removeEventListener("pointerup", handleWindowPointerEnd);
        window.removeEventListener("pointercancel", handleWindowPointerEnd);
      };

      callbacksRef.current.onDragStart();
    },
    [enabled, handleWindowPointerEnd, handleWindowPointerMove, orientation],
  );

  const handleClick: MouseEventHandler<HTMLElement> = useCallback((event) => {
    if (!enabled) return;
    event.preventDefault();
    event.stopPropagation();
  }, [enabled]);

  const handleDoubleClick: MouseEventHandler<HTMLElement> = useCallback(
    (event) => {
      if (!enabled || !callbacksRef.current.onDoubleClick) return;

      event.preventDefault();
      event.stopPropagation();
      callbacksRef.current.onDoubleClick();
    },
    [enabled],
  );

  useEffect(() => () => endDrag(), [endDrag]);

  return {
    onClick: handleClick,
    onDoubleClick: handleDoubleClick,
    onPointerDown: handlePointerDown,
  };
}
