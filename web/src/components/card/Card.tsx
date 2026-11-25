import {
  useState,
  useCallback,
  useContext,
  useRef,
  useMemo,
  type ReactElement,
} from "react";
import type { Card as CardType } from "../../types";
import { CardPreviewContext } from "./CardPreviewContext";
import { useFaceDown } from "../../contexts/faceDownState";
import { useWindowEvent } from "../../hooks/useDomEffects";
import { CARD_BACK_IMAGE, BASIC_LANDS } from "../../constants/assets";
import { canHover } from "../../utils/inputMode";
import { registerTap } from "../../utils/doubleTap";
import { fitCounters } from "../../utils/counters";
import { enterPressesControl } from "../../utils/enterKey";

interface CardProps {
  card: CardType;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  selected?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  dimensions?: { width: number; height: number };
  tapped?: boolean;
  faceDown?: boolean;
  flipped?: boolean;
  counters?: Record<string, number>;
  glow?: "none" | "gold" | "green" | "red";
  dragging?: boolean;
  disabled?: boolean;
  className?: string;
  isCompanion?: boolean;
  upgraded?: boolean;
  appliedUpgrades?: CardType[];
  hiddenUpgradeCount?: number;
  onRevealHiddenUpgrades?: () => void;
  canPeekFaceDown?: boolean;
  style?: React.CSSProperties;
  trackDomId?: boolean;
  interactiveRef?: React.Ref<HTMLDivElement>;
  interactiveStyle?: React.CSSProperties;
  interactiveProps?: React.HTMLAttributes<HTMLDivElement>;
}

const sizeStyles = {
  xs: { width: 50, height: 70 },
  sm: { width: 80, height: 112 },
  md: { width: 130, height: 182 },
  lg: { width: 200, height: 280 },
};

const glowColors = {
  none: "",
  gold: "0 0 20px rgba(212, 175, 55, 0.6)",
  green: "0 0 20px rgba(34, 197, 94, 0.6)",
  red: "0 0 20px rgba(239, 68, 68, 0.6)",
};

const BASIC_LAND_NAMES: Set<string> = new Set(BASIC_LANDS.map((l) => l.name));

const isBasicLandOrTreasureToken = (card: CardType): boolean =>
  BASIC_LAND_NAMES.has(card.name) ||
  (card.type_line.toLowerCase().includes("treasure") &&
    !card.type_line.toLowerCase().includes("land"));

const COUNTERS_BOTTOM = 1;
const COUNTERS_BOTTOM_OVER_FLIP = 22;
const COUNTERS_BOTTOM_OVER_REVEAL = 30;

const isCopiedToken = (card: CardType): boolean =>
  card.scryfall_id?.startsWith("token-copy-") ?? false;

function mergeRefs<T>(
  ...refs: Array<React.Ref<T> | undefined>
): (value: T | null) => void {
  return (value: T | null): void => {
    refs.forEach((ref) => {
      if (!ref) return;
      if (typeof ref === "function") {
        ref(value);
      } else {
        ref.current = value;
      }
    });
  };
}

function resolveCardImageUrl(options: {
  card: CardType;
  effectiveFaceDown: boolean;
  effectiveFlip: boolean;
  isHovered: boolean;
}): string {
  if (options.effectiveFaceDown) return CARD_BACK_IMAGE;
  const normalUrl =
    options.effectiveFlip && options.card.flip_image_url
      ? options.card.flip_image_url
      : options.card.image_url;
  if (!options.isHovered) return normalUrl;
  const pngUrl =
    options.effectiveFlip && options.card.flip_png_url
      ? options.card.flip_png_url
      : options.card.png_url;
  return pngUrl ?? normalUrl;
}

function resolveCountersBottom(options: {
  showRevealHiddenUpgradeButton: boolean;
  stacksButtons: boolean;
  showFlipButton: boolean;
  height: number;
}): number {
  if (options.showRevealHiddenUpgradeButton) {
    return Math.min(COUNTERS_BOTTOM_OVER_REVEAL, options.height / 2);
  }
  if (options.stacksButtons && options.showFlipButton) {
    return Math.min(COUNTERS_BOTTOM_OVER_FLIP, options.height / 2);
  }
  return COUNTERS_BOTTOM;
}

function buildCardClasses(options: {
  disabled: boolean;
  selected?: boolean;
  tapped: boolean;
  dragging: boolean;
  isCompanion: boolean;
  upgraded: boolean;
  hiddenUpgradeCount: number;
  className: string;
}): string {
  return [
    "card",
    "relative overflow-hidden",
    options.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
    options.selected && "selected",
    options.tapped && "tapped",
    options.dragging && "dragging",
    options.isCompanion && "companion",
    options.upgraded && "upgraded",
    options.hiddenUpgradeCount > 0 && "unrevealed-upgrade",
    options.className,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildInteractiveTransform(options: {
  baseTransform?: string;
  dragging: boolean;
  tapped: boolean;
}): string | undefined {
  const parts = [
    options.baseTransform,
    options.dragging ? "scale(1.05)" : "",
    options.tapped ? "rotate(90deg)" : "",
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function resolveCardBoxShadow(
  glow: "none" | "gold" | "green" | "red",
  dragging: boolean,
): string | undefined {
  if (glow !== "none") return glowColors[glow];
  if (dragging) return "0 20px 40px rgba(0, 0, 0, 0.5)";
  return undefined;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function shouldActivateCardOnKey(
  e: React.KeyboardEvent<HTMLElement>,
  disabled: boolean,
): boolean {
  if (disabled || e.defaultPrevented || e.target !== e.currentTarget) {
    return false;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  if (e.key === "Enter") return enterPressesControl(e.nativeEvent);
  return e.key === " " || e.key === "Spacebar";
}

interface CardCountersOverlayProps {
  counters?: Record<string, number>;
  dims: { width: number; height: number };
  bottom: number;
}

function CardCountersOverlay({
  counters,
  dims,
  bottom,
}: CardCountersOverlayProps): ReactElement | null {
  if (!counters || Object.keys(counters).length === 0) return null;

  return (
    <div className="card-counters" style={{ bottom }}>
      {fitCounters(counters, dims.width, dims.height - bottom).map(
        ({ type, text, fontSize, paddingInline }) => (
          <span
            key={type}
            className="counter-chip"
            style={{ fontSize, paddingInline }}
          >
            {text}
          </span>
        ),
      )}
    </div>
  );
}

interface CardActionOverlaysProps {
  showFlipButton: boolean;
  showPreviewButton: boolean;
  showRevealHiddenUpgradeButton: boolean;
  stacksButtons: boolean;
  showCopyBadge: boolean;
  hiddenUpgradeCount: number;
  onToggleFlip: () => void;
  onOpenPreview: () => void;
  onRevealHiddenUpgrades?: () => void;
}

function CardActionOverlays({
  showFlipButton,
  showPreviewButton,
  showRevealHiddenUpgradeButton,
  stacksButtons,
  showCopyBadge,
  hiddenUpgradeCount,
  onToggleFlip,
  onOpenPreview,
  onRevealHiddenUpgrades,
}: CardActionOverlaysProps): ReactElement {
  const previewPosClass = stacksButtons
    ? "inset-x-0.5 top-0.5 flex h-[18px] items-center justify-center rounded-[2px]"
    : `${showCopyBadge ? "top-8" : "top-1"} left-1 rounded p-1`;

  return (
    <>
      {showFlipButton && (
        <button
          className={`absolute ${stacksButtons ? "inset-x-0.5 bottom-0.5 h-[18px] rounded-[2px] text-[11px]" : "top-1 right-1 rounded px-2 py-0.5 text-xs"} bg-black/60 text-white hover:bg-black/80 transition-colors`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFlip();
          }}
        >
          Flip
        </button>
      )}
      {showPreviewButton && (
        <button
          className={`absolute ${previewPosClass} bg-black/60 text-white hover:bg-black/80 transition-colors`}
          onClick={(e) => {
            e.stopPropagation();
            onOpenPreview();
          }}
          title="Preview card"
          aria-label="Preview card"
        >
          <svg
            className={stacksButtons ? "w-3.5 h-3.5" : "w-4 h-4"}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
            />
          </svg>
        </button>
      )}
      {showRevealHiddenUpgradeButton && (
        <button
          className="btn-game absolute bottom-1 left-1 rounded px-2 py-0.5 text-xs transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            onRevealHiddenUpgrades?.();
          }}
        >
          {hiddenUpgradeCount > 1 ? "Reveal Upgrades" : "Reveal Upgrade"}
        </button>
      )}
    </>
  );
}

interface CardVisualState {
  dims: { width: number; height: number };
  imageUrl: string;
  baseClasses: string;
  boxShadow?: string;
  interactiveTransform?: string;
  showCopyBadge: boolean;
  showFlipButton: boolean;
  showPreviewButton: boolean;
  showRevealHiddenUpgradeButton: boolean;
  stacksButtons: boolean;
  countersBottom: number;
  canZoomOnHover: boolean;
}

function canCardZoom(options: {
  card: CardType;
  effectiveFaceDown: boolean;
  canPeekFaceDown: boolean;
  hasPreviewContext: boolean;
}): boolean {
  if (!options.hasPreviewContext) return false;
  if (isBasicLandOrTreasureToken(options.card)) return false;
  return !options.effectiveFaceDown || options.canPeekFaceDown;
}

function computeCardButtonsVisibility(options: {
  card: CardType;
  dims: { width: number; height: number };
  hiddenUpgradeCount: number;
  effectiveFaceDown: boolean;
  isHovered: boolean;
  selected?: boolean;
  canPeekFaceDown: boolean;
  hasPreviewContext: boolean;
  hasRevealCallback: boolean;
}): {
  showCopyBadge: boolean;
  showFlipButton: boolean;
  showPreviewButton: boolean;
  showRevealHiddenUpgradeButton: boolean;
  stacksButtons: boolean;
  canZoomOnHover: boolean;
} {
  const isActive = options.isHovered || Boolean(options.selected);
  const zoomable = canCardZoom(options);
  const showCopyBadge = isCopiedToken(options.card);
  const faceVisibleAndActive = !options.effectiveFaceDown && isActive;
  const showRevealHiddenUpgradeButton =
    faceVisibleAndActive &&
    options.hiddenUpgradeCount > 0 &&
    options.hasRevealCallback;
  const showFlipButton =
    faceVisibleAndActive && Boolean(options.card.flip_image_url);
  // Under 88px the magnifier and Flip overlap side by side. The Copy badge and Reveal Upgrade need the top and bottom.
  const stacksButtons =
    options.dims.width < 88 && !showCopyBadge && !showRevealHiddenUpgradeButton;

  return {
    showCopyBadge,
    showFlipButton,
    showPreviewButton: zoomable && isActive,
    showRevealHiddenUpgradeButton,
    stacksButtons,
    canZoomOnHover: zoomable && options.isHovered,
  };
}

function computeCardVisualState(options: {
  card: CardType;
  size: "xs" | "sm" | "md" | "lg";
  dimensions?: { width: number; height: number };
  glow: "none" | "gold" | "green" | "red";
  dragging: boolean;
  tapped: boolean;
  disabled: boolean;
  selected?: boolean;
  isCompanion: boolean;
  upgraded: boolean;
  hiddenUpgradeCount: number;
  className: string;
  effectiveFaceDown: boolean;
  effectiveFlip: boolean;
  isHovered: boolean;
  canPeekFaceDown: boolean;
  hasPreviewContext: boolean;
  hasRevealCallback: boolean;
  baseTransform?: string;
}): CardVisualState {
  const dims = options.dimensions ?? sizeStyles[options.size];
  const buttons = computeCardButtonsVisibility({ ...options, dims });

  return {
    dims,
    imageUrl: resolveCardImageUrl(options),
    baseClasses: buildCardClasses(options),
    boxShadow: resolveCardBoxShadow(options.glow, options.dragging),
    interactiveTransform: buildInteractiveTransform(options),
    ...buttons,
    countersBottom: resolveCountersBottom({
      showRevealHiddenUpgradeButton: buttons.showRevealHiddenUpgradeButton,
      stacksButtons: buttons.stacksButtons,
      showFlipButton: buttons.showFlipButton,
      height: dims.height,
    }),
  };
}

function useCardTouchEndHandler(options: {
  disabled: boolean;
  onDoubleClick?: () => void;
  interactiveOnTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
}): React.TouchEventHandler<HTMLDivElement> | undefined {
  const lastTapAtRef = useRef<number | null>(null);
  // iOS does not reliably fire dblclick, so touch screens count taps instead. Each tap
  // still clicks, so the second tap undoes the first tap's selection, as a double click does.
  const detectsDoubleTap =
    !canHover && !options.disabled && Boolean(options.onDoubleClick);
  if (!detectsDoubleTap) return options.interactiveOnTouchEnd;

  return (e: React.TouchEvent<HTMLDivElement>): void => {
    options.interactiveOnTouchEnd?.(e);
    const tap = registerTap(lastTapAtRef.current, e.timeStamp);
    const onOverlayButton =
      e.target instanceof Element &&
      e.target.closest("button:not([data-card-face-button])") !== null;
    if (onOverlayButton && !tap.isDoubleTap) return;
    lastTapAtRef.current = tap.lastTapAt;
    if (!tap.isDoubleTap) return;
    // The first tap reveals the card's magnifier, and WebKit moves a tap's click onto the
    // nearest button, so the second tap clicks the card itself.
    e.preventDefault();
    e.currentTarget.click();
    options.onDoubleClick?.();
  };
}

function useCardInteractionHandlers(options: {
  disabled: boolean;
  outerRef: React.RefObject<HTMLDivElement | null>;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onHoverStart?: () => void;
  onHoverEnd?: () => void;
  setIsHovered: (hovered: boolean) => void;
  interactiveProps?: React.HTMLAttributes<HTMLDivElement>;
}): {
  hasClickAction: boolean;
  interactiveExternalStyle?: React.CSSProperties;
  restInteractiveProps: React.HTMLAttributes<HTMLDivElement>;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onFaceKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  onOuterKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  onDoubleClick?: () => void;
  onTouchEnd?: React.TouchEventHandler<HTMLDivElement>;
  onContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseEnter?: React.MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLDivElement>;
} {
  const {
    onMouseEnter: interactiveOnMouseEnter,
    onMouseLeave: interactiveOnMouseLeave,
    onContextMenu: interactiveOnContextMenu,
    onTouchEnd: interactiveOnTouchEnd,
    onKeyDown: interactiveOnKeyDown,
    onClick: interactiveOnClick,
    style: interactiveExternalStyle,
    ...restInteractiveProps
  } = options.interactiveProps ?? {};

  const hasClickAction =
    !options.disabled &&
    (Boolean(options.onClick) || Boolean(interactiveOnClick));

  const onTouchEnd = useCardTouchEndHandler({
    disabled: options.disabled,
    onDoubleClick: options.onDoubleClick,
    interactiveOnTouchEnd,
  });

  const handleClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (options.disabled) return;
    interactiveOnClick?.(e);
    options.onClick?.();
  };

  const handleFaceKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
  ): void => {
    if (!shouldActivateCardOnKey(e, options.disabled)) return;
    e.preventDefault();
    if (options.onClick) {
      options.onClick();
    } else if (interactiveOnClick) {
      options.outerRef.current?.click();
    }
  };

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>): void => {
    interactiveOnMouseEnter?.(e);
    options.setIsHovered(true);
    options.onHoverStart?.();
  };

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>): void => {
    interactiveOnMouseLeave?.(e);
    options.setIsHovered(false);
    options.onHoverEnd?.();
  };

  return {
    hasClickAction,
    interactiveExternalStyle,
    restInteractiveProps,
    onClick: hasClickAction ? handleClick : undefined,
    onFaceKeyDown: handleFaceKeyDown,
    onOuterKeyDown: interactiveOnKeyDown,
    onDoubleClick:
      options.disabled || !canHover ? undefined : options.onDoubleClick,
    onTouchEnd,
    onContextMenu: (e): void => {
      interactiveOnContextMenu?.(e);
      options.onContextMenu?.(e);
    },
    onMouseEnter: canHover ? handleMouseEnter : interactiveOnMouseEnter,
    onMouseLeave: canHover ? handleMouseLeave : interactiveOnMouseLeave,
  };
}

function resolveCardOptions(props: CardProps): {
  size: "xs" | "sm" | "md" | "lg";
  tapped: boolean;
  faceDown: boolean;
  flipped: boolean;
  glow: "none" | "gold" | "green" | "red";
  dragging: boolean;
  disabled: boolean;
  className: string;
  isCompanion: boolean;
  upgraded: boolean;
  hiddenUpgradeCount: number;
  canPeekFaceDown: boolean;
  trackDomId: boolean;
} {
  return {
    size: props.size ?? "md",
    tapped: Boolean(props.tapped),
    faceDown: Boolean(props.faceDown),
    flipped: Boolean(props.flipped),
    glow: props.glow ?? "none",
    dragging: Boolean(props.dragging),
    disabled: Boolean(props.disabled),
    className: props.className ?? "",
    isCompanion: Boolean(props.isCompanion),
    upgraded: Boolean(props.upgraded),
    hiddenUpgradeCount: props.hiddenUpgradeCount ?? 0,
    canPeekFaceDown: props.canPeekFaceDown ?? true,
    trackDomId: props.trackDomId ?? true,
  };
}

export function Card(props: CardProps): ReactElement {
  const [showFlip, setShowFlip] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const outerCardRef = useRef<HTMLDivElement | null>(null);
  const opts = resolveCardOptions(props);

  const contextFaceDown = useFaceDown(props.card.id);
  const effectiveFaceDown = opts.faceDown || contextFaceDown;
  const previewContext = useContext(CardPreviewContext);

  const openPreview = useCallback(() => {
    const shown = props.card.upgrade_target ?? props.card;
    const upgrades = props.card.upgrade_target
      ? [props.card]
      : props.appliedUpgrades;
    if (props.counters) {
      previewContext?.setPreviewCard(shown, upgrades, props.counters);
    } else {
      previewContext?.setPreviewCard(shown, upgrades);
    }
  }, [previewContext, props.card, props.appliedUpgrades, props.counters]);

  const visual = computeCardVisualState({
    ...opts,
    card: props.card,
    dimensions: props.dimensions,
    selected: props.selected,
    effectiveFaceDown,
    effectiveFlip: opts.flipped !== showFlip,
    isHovered,
    hasPreviewContext: Boolean(previewContext),
    hasRevealCallback: Boolean(props.onRevealHiddenUpgrades),
    baseTransform: props.interactiveStyle?.transform,
  });

  useWindowEvent(
    "keydown",
    (e) => {
      if (isEditableElement(e.target)) return;
      if (e.key === "z" || e.key === "Z") openPreview();
    },
    { enabled: visual.canZoomOnHover },
  );

  const mergedInteractiveRef = useMemo(
    () => mergeRefs<HTMLDivElement>(outerCardRef, props.interactiveRef),
    [props.interactiveRef],
  );

  const interactions = useCardInteractionHandlers({
    disabled: opts.disabled,
    outerRef: outerCardRef,
    onClick: props.onClick,
    onDoubleClick: props.onDoubleClick,
    onContextMenu: props.onContextMenu,
    onHoverStart: props.onHoverStart,
    onHoverEnd: props.onHoverEnd,
    setIsHovered,
    interactiveProps: props.interactiveProps,
  });

  const cardLabel = effectiveFaceDown ? "Face-down card" : props.card.name;

  return (
    <div
      ref={anchorRef}
      style={{
        ...props.style,
        width: visual.dims.width,
        height: visual.dims.height,
        position: "relative",
      }}
    >
      <div
        ref={mergedInteractiveRef}
        role="presentation"
        className={visual.baseClasses}
        data-guide-card-id={props.card.id}
        data-card-id={opts.trackDomId ? props.card.id : undefined}
        style={{
          ...interactions.interactiveExternalStyle,
          ...props.interactiveStyle,
          width: visual.dims.width,
          height: visual.dims.height,
          boxShadow: visual.boxShadow,
          transform: visual.interactiveTransform,
        }}
        onClick={interactions.onClick}
        onKeyDown={interactions.onOuterKeyDown}
        onDoubleClick={interactions.onDoubleClick}
        onTouchEnd={interactions.onTouchEnd}
        onContextMenu={interactions.onContextMenu}
        onMouseEnter={interactions.onMouseEnter}
        onMouseLeave={interactions.onMouseLeave}
        {...interactions.restInteractiveProps}
      >
        {interactions.hasClickAction && (
          <button
            type="button"
            data-card-face-button=""
            aria-label={cardLabel}
            aria-pressed={props.selected}
            className="absolute inset-0 z-0 cursor-pointer border-0 bg-transparent p-0 rounded-[inherit]"
            onKeyDown={interactions.onFaceKeyDown}
          />
        )}
        {isLoading && (
          <div className="skeleton absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--ivory-muted)] text-xs text-center px-2">
              {props.card.name}
            </span>
          </div>
        )}
        {visual.showCopyBadge && (
          <div
            className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200"
            data-copy-token-badge
          >
            Copy
          </div>
        )}
        <img
          src={visual.imageUrl}
          alt={props.card.name}
          className={`w-full h-full object-cover ${isLoading ? "invisible" : ""}`}
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
          draggable={false}
        />
        <CardCountersOverlay
          counters={props.counters}
          dims={visual.dims}
          bottom={visual.countersBottom}
        />
        <CardActionOverlays
          showFlipButton={visual.showFlipButton}
          showPreviewButton={visual.showPreviewButton}
          showRevealHiddenUpgradeButton={visual.showRevealHiddenUpgradeButton}
          stacksButtons={visual.stacksButtons}
          showCopyBadge={visual.showCopyBadge}
          hiddenUpgradeCount={opts.hiddenUpgradeCount}
          onToggleFlip={() => setShowFlip((prev) => !prev)}
          onOpenPreview={openPreview}
          onRevealHiddenUpgrades={props.onRevealHiddenUpgrades}
        />
      </div>
    </div>
  );
}
