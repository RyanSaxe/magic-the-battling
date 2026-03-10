import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GuidedGuideId, GuidePlacement, GuideStepMeta, GuidedWalkthroughContext } from "../guided/types";
import { buildGuideDefinition } from "../guided/content";

interface GuideRequest {
  guideId: GuidedGuideId;
  isReplay?: boolean;
  nonce: number;
}

interface GuidedWalkthroughProps {
  rootRef: React.RefObject<HTMLElement | null>;
  request: GuideRequest | null;
  context: GuidedWalkthroughContext;
  onClose: (guideId: GuidedGuideId, completed: boolean) => void;
}

type MobileDock = "top" | "bottom";

const CARD_MARGIN = 16;
const SPOTLIGHT_PADDING = 12;
const STEP_AUTO_ADVANCE_MS = 180;

function resolveTarget(root: HTMLElement | null, targetId?: string): HTMLElement | null {
  if (!root || !targetId) {
    return null;
  }
  return root.querySelector<HTMLElement>(`[data-guide-target="${targetId}"]`);
}

function toRelativeRect(root: HTMLElement, target: HTMLElement, padding: number): DOMRect {
  const rootRect = root.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();

  return new DOMRect(
    targetRect.left - rootRect.left - padding,
    targetRect.top - rootRect.top - padding,
    targetRect.width + padding * 2,
    targetRect.height + padding * 2,
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function placementOrder(preferred: GuidePlacement): GuidePlacement[] {
  switch (preferred) {
    case "top":
      return ["top", "bottom", "right", "left"];
    case "right":
      return ["right", "left", "bottom", "top"];
    case "left":
      return ["left", "right", "bottom", "top"];
    case "bottom":
      return ["bottom", "top", "right", "left"];
    case "center":
    default:
      return ["center"];
  }
}

function computeCardPosition(
  placement: GuidePlacement,
  containerRect: DOMRect,
  targetRect: DOMRect | null,
  cardRect: DOMRect,
) {
  if (!targetRect || placement === "center") {
    return {
      left: clamp(
        containerRect.width / 2 - cardRect.width / 2,
        CARD_MARGIN,
        Math.max(CARD_MARGIN, containerRect.width - cardRect.width - CARD_MARGIN),
      ),
      top: clamp(
        containerRect.height / 2 - cardRect.height / 2,
        CARD_MARGIN,
        Math.max(CARD_MARGIN, containerRect.height - cardRect.height - CARD_MARGIN),
      ),
      resolvedPlacement: "center" as const,
    };
  }

  const centeredLeft = clamp(
    targetRect.left + targetRect.width / 2 - cardRect.width / 2,
    CARD_MARGIN,
    Math.max(CARD_MARGIN, containerRect.width - cardRect.width - CARD_MARGIN),
  );
  const centeredTop = clamp(
    targetRect.top + targetRect.height / 2 - cardRect.height / 2,
    CARD_MARGIN,
    Math.max(CARD_MARGIN, containerRect.height - cardRect.height - CARD_MARGIN),
  );

  const candidates = {
    top: {
      left: centeredLeft,
      top: targetRect.top - cardRect.height - CARD_MARGIN,
    },
    bottom: {
      left: centeredLeft,
      top: targetRect.bottom + CARD_MARGIN,
    },
    left: {
      left: targetRect.left - cardRect.width - CARD_MARGIN,
      top: centeredTop,
    },
    right: {
      left: targetRect.right + CARD_MARGIN,
      top: centeredTop,
    },
  };

  for (const nextPlacement of placementOrder(placement)) {
    if (nextPlacement === "center") {
      continue;
    }
    const candidate = candidates[nextPlacement];
    const fitsHorizontally =
      candidate.left >= CARD_MARGIN &&
      candidate.left + cardRect.width <= containerRect.width - CARD_MARGIN;
    const fitsVertically =
      candidate.top >= CARD_MARGIN &&
      candidate.top + cardRect.height <= containerRect.height - CARD_MARGIN;
    if (fitsHorizontally && fitsVertically) {
      return {
        left: candidate.left,
        top: candidate.top,
        resolvedPlacement: nextPlacement,
      };
    }
  }

  return {
    left: centeredLeft,
    top: clamp(
      targetRect.bottom + CARD_MARGIN,
      CARD_MARGIN,
      Math.max(CARD_MARGIN, containerRect.height - cardRect.height - CARD_MARGIN),
    ),
    resolvedPlacement: "bottom" as const,
  };
}

export function GuidedWalkthrough({
  rootRef,
  request,
  context,
  onClose,
}: GuidedWalkthroughProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [layoutState, setLayoutState] = useState<{
    targetRect: DOMRect | null;
    left: number;
    top: number;
    placement: GuidePlacement;
    containerWidth: number;
    containerHeight: number;
    cardWidth: number;
    cardHeight: number;
    isMobile: boolean;
    mobileDock: MobileDock | null;
  } | null>(null);
  const [collapsedMobileStepKey, setCollapsedMobileStepKey] = useState<string | null>(null);

  const cardRef = useRef<HTMLDivElement>(null);
  const stepMetaRef = useRef<GuideStepMeta | undefined>(undefined);
  const autoAdvanceTimerRef = useRef<number | null>(null);

  const guide = useMemo(() => {
    if (!request) return null;
    return buildGuideDefinition(request.guideId, context, !!request.isReplay);
  }, [context, request]);

  const step = guide?.steps[stepIndex] ?? null;

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  const finishGuide = useCallback((completed: boolean) => {
    if (!request) return;
    clearAutoAdvance();
    onClose(request.guideId, completed);
  }, [clearAutoAdvance, onClose, request]);

  const advanceStep = useCallback(() => {
    if (!guide) return;
    setStepIndex((current) => {
      const next = current + 1;
      if (next >= guide.steps.length) {
        queueMicrotask(() => finishGuide(true));
        return current;
      }
      return next;
    });
  }, [finishGuide, guide]);

  useEffect(() => {
    if (!step) {
      return;
    }
    stepMetaRef.current = step.onEnter?.(context) ?? undefined;
  }, [context, step]);

  useEffect(() => {
    if (!step || step.completion?.type !== "target-click") {
      return;
    }

    const root = rootRef.current;
    const target = resolveTarget(root, step.targetId);
    if (!target) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (!target.contains(event.target as Node)) {
        return;
      }
      window.setTimeout(() => {
        advanceStep();
      }, 0);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [advanceStep, rootRef, step]);

  useEffect(() => {
    if (!step || step.completion?.type !== "condition") {
      clearAutoAdvance();
      return;
    }

    if (!step.completion.isComplete(context, stepMetaRef.current)) {
      clearAutoAdvance();
      return;
    }

    clearAutoAdvance();
    autoAdvanceTimerRef.current = window.setTimeout(() => {
      advanceStep();
      autoAdvanceTimerRef.current = null;
    }, STEP_AUTO_ADVANCE_MS);

    return clearAutoAdvance;
  }, [advanceStep, clearAutoAdvance, context, step]);

  useEffect(() => () => clearAutoAdvance(), [clearAutoAdvance]);

  useLayoutEffect(() => {
    if (!request || !step) {
      return;
    }

    const root = rootRef.current;
    const card = cardRef.current;
    if (!root || !card) {
      return;
    }

    const update = () => {
      const nextRoot = rootRef.current;
      const nextCard = cardRef.current;
      if (!nextRoot || !nextCard) return;

      const target = resolveTarget(nextRoot, step.targetId);
      const padding = step.spotlightPadding ?? SPOTLIGHT_PADDING;
      const nextTargetRect = target
        ? toRelativeRect(nextRoot, target, padding)
        : null;
      const nextIsMobile = nextRoot.clientWidth <= 768;

      const nextRootRect = new DOMRect(
        0,
        0,
        nextRoot.clientWidth,
        nextRoot.clientHeight,
      );
      const nextCardRect = nextCard.getBoundingClientRect();
      let nextPosition = computeCardPosition(
        step.placement ?? "bottom",
        nextRootRect,
        nextTargetRect,
        nextCardRect,
      );
      let mobileDock: MobileDock | null = null;

      if (nextIsMobile && nextTargetRect && step.placement !== "center") {
        const targetMidpoint = nextTargetRect.top + nextTargetRect.height / 2;
        mobileDock =
          targetMidpoint > nextRoot.clientHeight * 0.52 ? "top" : "bottom";
        nextPosition = {
          left: 8,
          top:
            mobileDock === "top"
              ? 8
              : Math.max(8, nextRoot.clientHeight - nextCardRect.height - 8),
          resolvedPlacement: mobileDock === "top" ? "top" : "bottom",
        };
      }

      setLayoutState({
        targetRect: nextTargetRect,
        left: nextPosition.left,
        top: nextPosition.top,
        placement: nextPosition.resolvedPlacement,
        containerWidth: nextRoot.clientWidth,
        containerHeight: nextRoot.clientHeight,
        cardWidth: nextCardRect.width,
        cardHeight: nextCardRect.height,
        isMobile: nextIsMobile,
        mobileDock,
      });
    };

    const initialTarget = resolveTarget(root, step.targetId);
    if (initialTarget) {
      initialTarget.scrollIntoView({
        block: "center",
        inline: "center",
        behavior: "smooth",
      });
    }

    update();

    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(root);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [collapsedMobileStepKey, request, rootRef, step]);

  const bodyLines = step
    ? typeof step.body === "function"
      ? step.body(context)
      : step.body
    : [];

  const canGoBack = stepIndex > 0;
  const completionType = step?.completion?.type ?? "manual";
  const nextDisabled = completionType !== "manual";
  const stepKey = request ? `${request.nonce}:${step?.id ?? stepIndex}` : "";

  if (!request || !guide || !step) {
    return null;
  }

  const targetRect = layoutState?.targetRect ?? null;
  const containerWidth = layoutState?.containerWidth ?? 0;
  const containerHeight = layoutState?.containerHeight ?? 0;
  const isMobile = layoutState?.isMobile ?? false;
  const isInteractiveStep = completionType !== "manual";
  const isMobileCollapsed =
    isMobile &&
    isInteractiveStep &&
    collapsedMobileStepKey === stepKey;
  const targetActionVerb = isMobile ? "Tap" : "Click";
  const cardPosition = layoutState
    ? {
        left: layoutState.left,
        top: layoutState.top,
        placement: layoutState.placement,
      }
    : null;

  const arrowStyle = (() => {
    if (!targetRect || !cardPosition) return undefined;
    const cardWidth = layoutState?.cardWidth ?? 320;
    const cardHeight = layoutState?.cardHeight ?? 240;

    if (cardPosition.placement === "top" || cardPosition.placement === "bottom") {
      return {
        left: clamp(
          targetRect.left + targetRect.width / 2 - cardPosition.left - 7,
          16,
          Math.max(16, cardWidth - 24),
        ),
      };
    }

    return {
      top: clamp(
        targetRect.top + targetRect.height / 2 - cardPosition.top - 7,
        16,
        Math.max(16, cardHeight - 24),
      ),
    };
  })();

  const spotlightBorderRadius = targetRect
    ? clamp(Math.min(targetRect.width, targetRect.height) * 0.2, 14, 24)
    : undefined;

  const arrowClassName = (() => {
    if (isMobileCollapsed) {
      return "hidden";
    }
    switch (cardPosition?.placement) {
      case "top":
        return "guide-arrow guide-arrow-bottom";
      case "left":
        return "guide-arrow guide-arrow-right";
      case "right":
        return "guide-arrow guide-arrow-left";
      case "center":
        return "hidden";
      case "bottom":
      default:
        return "guide-arrow guide-arrow-top";
    }
  })();

  return (
    <div className="guided-overlay" aria-live="polite">
      {targetRect ? (
        <>
          <div className="guided-mask" style={{ left: 0, top: 0, width: containerWidth, height: Math.max(0, targetRect.top) }} />
          <div className="guided-mask" style={{ left: 0, top: targetRect.top, width: Math.max(0, targetRect.left), height: targetRect.height }} />
          <div className="guided-mask" style={{ left: targetRect.right, top: targetRect.top, width: Math.max(0, containerWidth - targetRect.right), height: targetRect.height }} />
          <div className="guided-mask" style={{ left: 0, top: targetRect.bottom, width: containerWidth, height: Math.max(0, containerHeight - targetRect.bottom) }} />
          <div
            className="guided-spotlight"
            style={{
              left: targetRect.left,
              top: targetRect.top,
              width: targetRect.width,
              height: targetRect.height,
              borderRadius:
                spotlightBorderRadius !== undefined
                  ? `${spotlightBorderRadius}px`
                  : undefined,
            }}
          />
        </>
      ) : (
        <div className="guided-mask" style={{ inset: 0 }} />
      )}

      <div
        ref={cardRef}
        className={`guided-card modal-chrome felt-raised-panel ${
          isMobile ? "guided-card-mobile" : ""
        } ${isMobileCollapsed ? "guided-card-mobile-compact" : ""} ${
          layoutState?.mobileDock === "top" ? "guided-card-mobile-top" : ""
        } ${layoutState?.mobileDock === "bottom" ? "guided-card-mobile-bottom" : ""}`}
        style={{
          left: cardPosition?.left ?? CARD_MARGIN,
          top: cardPosition?.top ?? CARD_MARGIN,
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`${guide.label} walkthrough`}
      >
        <div className={arrowClassName} style={arrowStyle} />
        {isMobileCollapsed ? (
          <div className="guided-card-compact-row">
            <div className="guided-card-compact-content">
              <div className="guided-card-compact-meta">
                <span className="guided-card-kicker">{guide.label}</span>
                <span className="guided-card-progress">
                  {stepIndex + 1}/{guide.steps.length}
                </span>
              </div>
              <p className="guided-card-compact-title">{step.title}</p>
              <p className="guided-card-compact-copy">
                {completionType === "target-click"
                  ? `${targetActionVerb} the highlighted area to continue.`
                  : "Complete the highlighted task to continue."}
              </p>
            </div>
            <div className="guided-card-compact-actions">
              <button
                type="button"
                onClick={() => setCollapsedMobileStepKey(null)}
                className="btn btn-secondary"
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => finishGuide(false)}
                className="btn btn-secondary"
              >
                Skip
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="guided-card-header">
              <span className="guided-card-kicker">{guide.label} Walkthrough</span>
              <span className="guided-card-progress">
                {stepIndex + 1}/{guide.steps.length}
              </span>
            </div>
            <h2 className="guided-card-title">{step.title}</h2>
            <div className="guided-card-body">
              {bodyLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            {completionType === "target-click" && (
              <p className="guided-card-hint">{targetActionVerb} the highlighted area to continue.</p>
            )}
            {completionType === "condition" && (
              <p className="guided-card-hint">Complete the highlighted task to continue.</p>
            )}
            <div className="guided-card-actions">
              <button
                type="button"
                onClick={() => finishGuide(false)}
                className="btn btn-secondary"
              >
                Skip
              </button>
              <div className="guided-card-actions-right">
                <button
                  type="button"
                  onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                  className="btn btn-secondary"
                  disabled={!canGoBack}
                >
                  Back
                </button>
                {isMobile && isInteractiveStep ? (
                  <button
                    type="button"
                    onClick={() => setCollapsedMobileStepKey(stepKey)}
                    className="btn btn-primary"
                  >
                    Let Me Do This
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={advanceStep}
                    className="btn btn-primary"
                    disabled={nextDisabled}
                  >
                    {stepIndex + 1 === guide.steps.length ? "Finish" : "Next"}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
