import { useState, useContext, useEffect, useRef, useMemo } from 'react'
import type { Card as CardType } from '../../types'
import { CardPreviewContext } from './CardPreviewContext'
import { useFaceDown } from '../../contexts/faceDownState'
import { CARD_BACK_IMAGE, BASIC_LANDS } from '../../constants/assets'

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

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

const BASIC_LAND_NAMES: Set<string> = new Set(BASIC_LANDS.map(l => l.name))

const isBasicLandOrTreasureToken = (card: CardType) =>
  BASIC_LAND_NAMES.has(card.name) ||
  (card.type_line.toLowerCase().includes('treasure') &&
    !card.type_line.toLowerCase().includes('land'))

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

  const contextFaceDown = useFaceDown(card.id)
  const effectiveFaceDown = faceDown || contextFaceDown

  const previewContext = useContext(CardPreviewContext)

  const showZoom = !isBasicLandOrTreasureToken(card)
  const showCopyBadge = isCopiedToken(card)
  const showRevealHiddenUpgradeButton =
    hiddenUpgradeCount > 0 && !effectiveFaceDown && !!onRevealHiddenUpgrades && (isHovered || selected)

  useEffect(() => {
    if (!isHovered || !previewContext || !showZoom) return
    if (effectiveFaceDown && !canPeekFaceDown) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'z' || e.key === 'Z') {
        if (card.upgrade_target) {
          previewContext.setPreviewCard(card.upgrade_target, [card])
        } else {
          previewContext.setPreviewCard(card, appliedUpgrades)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isHovered, previewContext, card, appliedUpgrades, effectiveFaceDown, canPeekFaceDown, showZoom])

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
    className,
  ].filter(Boolean).join(' ')

  const glowShadow = glow !== 'none' ? glowColors[glow] : undefined
  const boxShadow = glowShadow || (dragging ? '0 20px 40px rgba(0, 0, 0, 0.5)' : undefined)
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
    style: interactiveExternalStyle,
    ...restInteractiveProps
  } = interactiveProps ?? {}

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
        onDoubleClick={disabled ? undefined : onDoubleClick}
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
          <div className="skeleton absolute inset-0 flex items-center justify-center bg-gray-800">
            <span className="text-gray-400 text-xs text-center px-2">{card.name}</span>
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
        {card.flip_image_url && !effectiveFaceDown && (isHovered || selected) && (
          <button
            className="absolute top-1 right-1 bg-black/60 rounded px-2 py-0.5 text-white text-xs hover:bg-black/80 transition-colors"
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
            className={`absolute ${showCopyBadge ? 'top-8' : 'top-1'} left-1 bg-black/60 rounded p-1 text-white hover:bg-black/80 transition-colors`}
            onClick={(e) => {
              e.stopPropagation()
              if (card.upgrade_target) {
                previewContext.setPreviewCard(card.upgrade_target, [card])
              } else {
                previewContext.setPreviewCard(card, appliedUpgrades)
              }
            }}
            title="Preview card"
          >
            <svg
              className="w-4 h-4"
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
            className="absolute bottom-1 left-1 bg-purple-600/90 rounded px-2 py-0.5 text-white text-xs hover:bg-purple-500 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onRevealHiddenUpgrades?.()
            }}
          >
            {hiddenUpgradeCount > 1 ? 'Reveal Upgrades' : 'Reveal Upgrade'}
          </button>
        )}
        {counters && Object.keys(counters).length > 0 && (
          <div className={`absolute left-1 flex gap-1 ${showRevealHiddenUpgradeButton ? 'bottom-8' : 'bottom-1'}`}>
            {Object.entries(counters).map(([type, count]) => (
              <div
                key={type}
                className="bg-black/80 text-white text-xs px-1.5 py-0.5 rounded border border-amber-500"
              >
                {type === '+1/+1' ? `+${count}/+${count}` : `${count} ${type}`}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
