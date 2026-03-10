import { forwardRef, useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { GuidePlacement, GuideStepContent, GuideStepDefinition, GuidedWalkthroughContext } from "./types";
import { GuideProgress } from "./GuideProgress";

const TOOLTIP_MARGIN = 8;

const gripBarStyle = {
  width: 2,
  height: 10,
  borderRadius: 999,
  background: "rgba(255, 236, 181, 0.52)",
  boxShadow: "0 1px 0 rgba(0, 0, 0, 0.42)",
} as const;

interface GuideTooltipProps {
  step: GuideStepDefinition;
  guideLabel: string;
  stepIndex: number;
  totalSteps: number;
  placement: GuidePlacement;
  context: GuidedWalkthroughContext;
  isCollapsed: boolean;
  boundsWidth: number;
  boundsHeight: number;
  style?: CSSProperties;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onToggleCollapse: () => void;
}

function resolveActionHint(content: GuideStepContent, ctx: GuidedWalkthroughContext): string | undefined {
  if (!content.actionHint) return undefined;
  return typeof content.actionHint === "function" ? content.actionHint(ctx) : content.actionHint;
}

function entranceClass(placement: GuidePlacement): string {
  if (placement === "top") return "animate-guide-enter-down";
  return "animate-guide-enter-up";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolveStyleNumber(value: CSSProperties["left"] | CSSProperties["top"]): number {
  return typeof value === "number" ? value : 0;
}

function clampDragOffset(
  baseLeft: number,
  baseTop: number,
  offsetX: number,
  offsetY: number,
  panelWidth: number,
  panelHeight: number,
  boundsWidth: number,
  boundsHeight: number,
): { x: number; y: number } {
  if (!panelWidth || !panelHeight || !boundsWidth || !boundsHeight) {
    return { x: offsetX, y: offsetY };
  }

  const minLeft = TOOLTIP_MARGIN;
  const minTop = TOOLTIP_MARGIN;
  const maxLeft = Math.max(minLeft, boundsWidth - panelWidth - TOOLTIP_MARGIN);
  const maxTop = Math.max(minTop, boundsHeight - panelHeight - TOOLTIP_MARGIN);
  const left = clamp(baseLeft + offsetX, minLeft, maxLeft);
  const top = clamp(baseTop + offsetY, minTop, maxTop);

  return {
    x: left - baseLeft,
    y: top - baseTop,
  };
}

export const GuideTooltip = forwardRef<HTMLDivElement, GuideTooltipProps>(
  function GuideTooltip(
    {
      step,
      guideLabel,
      stepIndex,
      totalSteps,
      placement,
      context,
      isCollapsed,
      boundsWidth,
      boundsHeight,
      style,
      onNext,
      onBack,
      onSkip,
      onToggleCollapse,
    },
    ref,
  ) {
    const completionType = step.completion?.type ?? "manual";
    const isManual = completionType === "manual";
    const isLastStep = stepIndex + 1 === totalSteps;
    const actionHint = resolveActionHint(step.content, context);

    const [dragState, setDragState] = useState({ step: stepIndex, x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const dragStartRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0, width: 0, height: 0 });
    const stepIndexRef = useRef(stepIndex);
    const activePointerIdRef = useRef<number | null>(null);
    const removeListenersRef = useRef<(() => void) | null>(null);
    const userSelectRef = useRef("");
    const dragOffset = dragState.step === stepIndex ? dragState : { x: 0, y: 0 };
    const baseLeft = resolveStyleNumber(style?.left);
    const baseTop = resolveStyleNumber(style?.top);

    useEffect(() => {
      stepIndexRef.current = stepIndex;
    }, [stepIndex]);

    const stopDragging = useCallback(() => {
      if (activePointerIdRef.current === null) return;

      activePointerIdRef.current = null;
      removeListenersRef.current?.();
      removeListenersRef.current = null;
      document.body.style.userSelect = userSelectRef.current;
      setIsDragging(false);
    }, []);

    const handleWindowPointerMove = useCallback((event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return;

      event.preventDefault();
      const dx = event.clientX - dragStartRef.current.pointerX;
      const dy = event.clientY - dragStartRef.current.pointerY;
      const next = clampDragOffset(
        baseLeft,
        baseTop,
        dragStartRef.current.offsetX + dx,
        dragStartRef.current.offsetY + dy,
        dragStartRef.current.width,
        dragStartRef.current.height,
        boundsWidth,
        boundsHeight,
      );

      setDragState({
        step: stepIndexRef.current,
        ...next,
      });
    }, [baseLeft, baseTop, boundsHeight, boundsWidth]);

    const handleWindowPointerEnd = useCallback((event: PointerEvent) => {
      if (event.pointerId !== activePointerIdRef.current) return;
      stopDragging();
    }, [stopDragging]);

    const onPointerDown = useCallback(
      (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();

        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // Pointer capture can fail if the target unmounts mid-drag.
        }

        const rect = tooltipRef.current?.getBoundingClientRect();
        dragStartRef.current = {
          pointerX: e.clientX,
          pointerY: e.clientY,
          offsetX: dragOffset.x,
          offsetY: dragOffset.y,
          width: rect?.width ?? 0,
          height: rect?.height ?? 0,
        };
        userSelectRef.current = document.body.style.userSelect;
        document.body.style.userSelect = "none";
        activePointerIdRef.current = e.pointerId;
        window.addEventListener("pointermove", handleWindowPointerMove, { passive: false });
        window.addEventListener("pointerup", handleWindowPointerEnd);
        window.addEventListener("pointercancel", handleWindowPointerEnd);
        removeListenersRef.current = () => {
          window.removeEventListener("pointermove", handleWindowPointerMove);
          window.removeEventListener("pointerup", handleWindowPointerEnd);
          window.removeEventListener("pointercancel", handleWindowPointerEnd);
        };
        setIsDragging(true);
      },
      [dragOffset.x, dragOffset.y, handleWindowPointerEnd, handleWindowPointerMove],
    );

    useEffect(() => {
      const panel = tooltipRef.current;
      if (!panel) return;

      const rect = panel.getBoundingClientRect();
      const next = clampDragOffset(
        baseLeft,
        baseTop,
        dragOffset.x,
        dragOffset.y,
        rect.width,
        rect.height,
        boundsWidth,
        boundsHeight,
      );

      if (next.x !== dragOffset.x || next.y !== dragOffset.y) {
        setDragState({
          step: stepIndex,
          ...next,
        });
      }
    }, [baseLeft, baseTop, boundsHeight, boundsWidth, dragOffset.x, dragOffset.y, isCollapsed, stepIndex]);

    useEffect(() => () => stopDragging(), [stopDragging]);

    const mergedStyle: CSSProperties = {
      ...style,
      left: baseLeft + dragOffset.x,
      top: baseTop + dragOffset.y,
      overscrollBehavior: "contain",
    };

    const setTooltipRef = useCallback((node: HTMLDivElement | null) => {
      tooltipRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    }, [ref]);

    const handleControlPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
    }, []);

    return (
      <div
        ref={setTooltipRef}
        className={`absolute z-[82] pointer-events-auto modal-chrome felt-raised-panel gold-border border rounded-xl
          shadow-[0_8px_32px_rgba(0,0,0,0.55),0_2px_8px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden
          ${isCollapsed ? "w-[min(18rem,calc(100%-1rem))]" : "w-[min(22rem,calc(100%-1rem))] max-h-[calc(100%-0.5rem)]"}
          ${entranceClass(placement)}`}
        style={mergedStyle}
        role="dialog"
        aria-modal={isCollapsed ? undefined : true}
        aria-label={`${guideLabel} walkthrough`}
      >
        <div
          className={`flex items-center gap-3 px-4 py-3 select-none shrink-0
            ${isCollapsed ? "" : "border-b border-amber-400/15"}
            ${isDragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={onPointerDown}
          style={{ touchAction: "none" }}
        >
          <span aria-hidden="true" className="inline-flex items-center gap-[3px] opacity-80 shrink-0">
            <span style={gripBarStyle} />
            <span style={gripBarStyle} />
            <span style={gripBarStyle} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[0.68rem] uppercase tracking-widest text-amber-200/90 leading-none">
              {guideLabel}
            </div>
            {isCollapsed && (
              <div className="text-xs text-gray-200/90 truncate mt-1">
                {step.title}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <GuideProgress current={stepIndex} total={totalSteps} />
            <button
              type="button"
              onPointerDown={handleControlPointerDown}
              onClick={onToggleCollapse}
              className="btn btn-secondary text-xs py-1.5 px-2.5"
              aria-expanded={!isCollapsed}
            >
              {isCollapsed ? "Open" : "Hide"}
            </button>
          </div>
        </div>

        {!isCollapsed && (
          <>
            <div className="min-h-0 overflow-y-auto px-4 pt-3" style={{ overscrollBehavior: "contain" }}>
              <h2 className="text-[1.05rem] font-bold text-amber-50 leading-tight mb-2">{step.title}</h2>

              <p className="text-[0.88rem] text-gray-200/90 leading-relaxed">{step.content.summary}</p>
              {step.content.detail && (
                <p className="text-[0.82rem] text-gray-300/80 leading-relaxed mt-1.5">{step.content.detail}</p>
              )}

              {actionHint && (
                <p className="text-xs text-amber-400/90 mt-2">{actionHint}</p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-4 py-4 shrink-0">
              <button type="button" onClick={onSkip} className="btn btn-secondary text-xs">
                Skip
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onBack}
                  className="btn btn-secondary text-xs"
                  disabled={stepIndex === 0}
                >
                  Back
                </button>
                {isManual && (
                  <button type="button" onClick={onNext} className="btn btn-primary text-xs">
                    {isLastStep ? "Got it" : "Next"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  },
);
