import { useState, useCallback, useContext, useEffect, useRef, useMemo } from 'react'
import type { Card as CardType } from '../../types'
import { CardPreviewContext } from './CardPreviewContext'
import { useFaceDown } from '../../contexts/faceDownState'
import { CARD_BACK_IMAGE, BASIC_LANDS } from '../../constants/assets'
import { canHover } from '../../utils/inputMode'
import { registerTap } from '../../utils/doubleTap'
import { fitCounters } from '../../utils/counters'

interface CardProps {
  card: CardType
  onClick?: () => void
  onDoubleClick?: () => void
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void
  onHoverStart?: () => void
  onHoverEnd?: () => void
  selected?: boolean
  size?: 'xs' | 'sm' | 'md' | 'lg'
  dimensions?: { width: number; height: number }
  tapped?: boolean
  faceDown?: boolean
  flipped?: boolean
  counters?: Record<string, number>
  glow?: 'none' | 'gold' | 'green' | 'red'
  dragging?: boolean
  disabled?: boolean
  className?: string
  isCompanion?: boolean
  upgraded?: boolean
  appliedUpgrades?: CardType[]
  hiddenUpgradeCount?: number
  onRevealHiddenUpgrades?: () => void
  canPeekFaceDown?: boolean
  style?: React.CSSProperties
  trackDomId?: boolean
  interactiveRef?: React.Ref<HTMLDivElement>
  interactiveStyle?: React.CSSProperties
  interactiveProps?: React.HTMLAttributes<HTMLDivElement>
}

const sizeStyles = {
  xs: { width: 50, height: 70 },
  sm: { width: 80, height: 112 },
  md: { width: 130, height: 182 },
  lg: { width: 200, height: 280 },
}

const glowColors = {
  none: '',
  gold: '0 0 20px rgba(212, 175, 55, 0.6)',
  green: '0 0 20px rgba(34, 197, 94, 0.6)',
  red: '0 0 20px rgba(239, 68, 68, 0.6)',
}

const BASIC_LAND_NAMES: Set<string> = new Set(BASIC_LANDS.map(l => l.name))

const isBasicLandOrTreasureToken = (card: CardType) =>
  BASIC_LAND_NAMES.has(card.name) ||
  (card.type_line.toLowerCase().includes('treasure') &&
    !card.type_line.toLowerCase().includes('land'))

const COUNTERS_BOTTOM = 1
const COUNTERS_BOTTOM_OVER_FLIP = 22
const COUNTERS_BOTTOM_OVER_REVEAL = 30

const isCopiedToken = (card: CardType) =>
  card.scryfall_id?.startsWith('token-copy-') ?? false

function mergeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T | null) => {
    refs.forEach((ref) => {
      if (!ref) return
      if (typeof ref === 'function') {
        ref(value)
      } else {
        ;(ref as React.MutableRefObject<T | null>).current = value
      }
    })
  }
}

export function Card({
  card,
  onClick,
  onDoubleClick,
  onContextMenu,
  onHoverStart,
  onHoverEnd,
  selected,
  size = 'md',
  dimensions,
  tapped = false,
  faceDown = false,
  flipped = false,
  counters,
  glow = 'none',
  dragging = false,
  disabled = false,
  className = '',
  isCompanion = false,
  upgraded = false,
  appliedUpgrades,
  hiddenUpgradeCount = 0,
  onRevealHiddenUpgrades,
  canPeekFaceDown = true,
  style: externalStyle,
  trackDomId = true,
  interactiveRef,
  interactiveStyle,
  interactiveProps,
}: CardProps) {
  const [showFlip, setShowFlip] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const lastTapAtRef = useRef<number | null>(null)

  const contextFaceDown = useFaceDown(card.id)
  const effectiveFaceDown = faceDown || contextFaceDown

  const previewContext = useContext(CardPreviewContext)

  const showZoom = !isBasicLandOrTreasureToken(card)
  const showCopyBadge = isCopiedToken(card)
  const showRevealHiddenUpgradeButton =
    hiddenUpgradeCount > 0 && !effectiveFaceDown && !!onRevealHiddenUpgrades && (isHovered || selected)

  const openPreview = useCallback(() => {
    const shown = card.upgrade_target ?? card
    const upgrades = card.upgrade_target ? [card] : appliedUpgrades
    if (counters) previewContext?.setPreviewCard(shown, upgrades, counters)
    else previewContext?.setPreviewCard(shown, upgrades)
  }, [previewContext, card, appliedUpgrades, counters])

  useEffect(() => {
    if (!isHovered || !previewContext || !showZoom) return
    if (effectiveFaceDown && !canPeekFaceDown) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'z' || e.key === 'Z') openPreview()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isHovered, previewContext, openPreview, effectiveFaceDown, canPeekFaceDown, showZoom])

  const effectiveFlip = flipped !== showFlip
  const normalUrl = effectiveFaceDown
    ? CARD_BACK_IMAGE
    : (effectiveFlip && card.flip_image_url ? card.flip_image_url : card.image_url)
  const pngUrl = effectiveFaceDown
    ? null
    : (effectiveFlip && card.flip_png_url ? card.flip_png_url : card.png_url)
  const imageUrl = isHovered && pngUrl ? pngUrl : normalUrl

  const dims = dimensions ?? sizeStyles[size]

  const baseClasses = [
    'card',
    'relative overflow-hidden',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    selected && 'selected',
    tapped && 'tapped',
    dragging && 'dragging',
    isCompanion && 'companion',
    upgraded && 'upgraded',
    hiddenUpgradeCount > 0 && 'unrevealed-upgrade',
    className,
  ].filter(Boolean).join(' ')

  const glowShadow = glow !== 'none' ? glowColors[glow] : undefined
  const boxShadow = glowShadow || (dragging ? '0 20px 40px rgba(0, 0, 0, 0.5)' : undefined)
  const showFlipButton = !!card.flip_image_url && !effectiveFaceDown && (isHovered || !!selected)
  // Under 88px the magnifier and Flip overlap side by side. The Copy badge and Reveal Upgrade need the top and bottom.
  const stacksButtons = dims.width < 88 && !showCopyBadge && !showRevealHiddenUpgradeButton
  const countersBottom = showRevealHiddenUpgradeButton
    ? Math.min(COUNTERS_BOTTOM_OVER_REVEAL, dims.height / 2)
    : stacksButtons && showFlipButton
      ? Math.min(COUNTERS_BOTTOM_OVER_FLIP, dims.height / 2)
      : COUNTERS_BOTTOM
  const interactiveTransform = [
    interactiveStyle?.transform,
    dragging ? 'scale(1.05)' : '',
    tapped ? 'rotate(90deg)' : '',
  ].filter(Boolean).join(' ') || undefined

  const mergedInteractiveRef = useMemo(
    () => mergeRefs<HTMLDivElement>(interactiveRef),
    [interactiveRef],
  )
  const {
    onMouseEnter: interactiveOnMouseEnter,
    onMouseLeave: interactiveOnMouseLeave,
    onContextMenu: interactiveOnContextMenu,
    onTouchEnd: interactiveOnTouchEnd,
    style: interactiveExternalStyle,
    ...restInteractiveProps
  } = interactiveProps ?? {}

  // iOS does not reliably fire dblclick, so touch screens count taps instead. Each tap
  // still clicks, so the second tap undoes the first tap's selection, as a double click does.
  const detectsDoubleTap = !canHover && !disabled && !!onDoubleClick
  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    interactiveOnTouchEnd?.(e)
    const tap = registerTap(lastTapAtRef.current, e.timeStamp)
    const onButton = !!(e.target as HTMLElement).closest('button')
    if (onButton && !tap.isDoubleTap) return
    lastTapAtRef.current = tap.lastTapAt
    if (!tap.isDoubleTap) return
    // The first tap reveals the card's magnifier, and WebKit moves a tap's click onto the
    // nearest button, so the second tap clicks the card itself.
    e.preventDefault()
    e.currentTarget.click()
    onDoubleClick?.()
  }

  return (
    <div
      ref={anchorRef}
      style={{
        ...externalStyle,
        width: dims.width,
        height: dims.height,
        position: 'relative',
      }}
    >
      <div
        ref={mergedInteractiveRef}
        className={baseClasses}
        data-guide-card-id={card.id}
        data-card-id={trackDomId ? card.id : undefined}
        style={{
          ...interactiveExternalStyle,
          ...interactiveStyle,
          width: dims.width,
          height: dims.height,
          boxShadow,
          transform: interactiveTransform,
        }}
        onClick={disabled ? undefined : onClick}
        onDoubleClick={disabled || !canHover ? undefined : onDoubleClick}
        onTouchEnd={detectsDoubleTap ? handleTouchEnd : interactiveOnTouchEnd}
        onContextMenu={(e) => {
          interactiveOnContextMenu?.(e)
          onContextMenu?.(e)
        }}
        onMouseEnter={canHover ? (e) => {
          interactiveOnMouseEnter?.(e)
          setIsHovered(true)
          onHoverStart?.()
        } : interactiveOnMouseEnter}
        onMouseLeave={canHover ? (e) => {
          interactiveOnMouseLeave?.(e)
          setIsHovered(false)
          onHoverEnd?.()
        } : interactiveOnMouseLeave}
        {...restInteractiveProps}
      >
        {isLoading && (
          <div className="skeleton absolute inset-0 flex items-center justify-center">
            <span className="text-[var(--ivory-muted)] text-xs text-center px-2">{card.name}</span>
          </div>
        )}
        {showCopyBadge && (
          <div
            className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200"
            data-copy-token-badge
          >
            Copy
          </div>
        )}
        <img
          src={imageUrl}
          alt={card.name}
          className={`w-full h-full object-cover ${isLoading ? 'invisible' : ''}`}
          onLoad={() => setIsLoading(false)}
          onError={() => setIsLoading(false)}
          draggable={false}
        />
        {counters && Object.keys(counters).length > 0 && (
          <div className="card-counters" style={{ bottom: countersBottom }}>
            {fitCounters(counters, dims.width, dims.height - countersBottom).map(({ type, text, fontSize, paddingInline }) => (
              <span key={type} className="counter-chip" style={{ fontSize, paddingInline }}>
                {text}
              </span>
            ))}
          </div>
        )}
        {showFlipButton && (
          <button
            className={`absolute ${stacksButtons ? 'inset-x-0.5 bottom-0.5 h-[18px] rounded-[3px] text-[11px]' : 'top-1 right-1 rounded px-2 py-0.5 text-xs'} bg-black/60 text-white hover:bg-black/80 transition-colors`}
            onClick={(e) => {
              e.stopPropagation()
              setShowFlip(!showFlip)
            }}
          >
            Flip
          </button>
        )}
        {previewContext && showZoom && (!effectiveFaceDown || canPeekFaceDown) && (isHovered || selected) && (
          <button
            className={`absolute ${stacksButtons ? 'inset-x-0.5 top-0.5 flex h-[18px] items-center justify-center rounded-[3px]' : `${showCopyBadge ? 'top-8' : 'top-1'} left-1 rounded p-1`} bg-black/60 text-white hover:bg-black/80 transition-colors`}
            onClick={(e) => {
              e.stopPropagation()
              openPreview()
            }}
            title="Preview card"
          >
            <svg
              className={stacksButtons ? 'w-3.5 h-3.5' : 'w-4 h-4'}
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
              e.stopPropagation()
              onRevealHiddenUpgrades?.()
            }}
          >
            {hiddenUpgradeCount > 1 ? 'Reveal Upgrades' : 'Reveal Upgrade'}
          </button>
        )}
      </div>
    </div>
  )
}
