import { useState, useContext } from 'react'
import type { Card as CardType } from '../../types'
import { CardBack } from './CardBack'
import { CardPreviewContext } from './CardPreviewContext'

interface CardProps {
  card: CardType
  onClick?: () => void
  onDoubleClick?: () => void
  selected?: boolean
  size?: 'sm' | 'md' | 'lg'
  tapped?: boolean
  faceDown?: boolean
  counters?: Record<string, number>
  glow?: 'none' | 'gold' | 'green' | 'red'
  dragging?: boolean
  disabled?: boolean
  className?: string
  showUpgradeTarget?: boolean
  enablePreview?: boolean
}

const sizeStyles = {
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

export function Card({
  card,
  onClick,
  onDoubleClick,
  selected,
  size = 'md',
  tapped = false,
  faceDown = false,
  counters,
  glow = 'none',
  dragging = false,
  disabled = false,
  className = '',
  showUpgradeTarget = false,
  enablePreview = false,
}: CardProps) {
  const [showFlip, setShowFlip] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isHovered, setIsHovered] = useState(false)
  const [showTargetModal, setShowTargetModal] = useState(false)

  const previewContext = useContext(CardPreviewContext)

  if (faceDown) {
    return (
      <CardBack
        size={size}
        tapped={tapped}
        onClick={onClick}
        className={className}
      />
    )
  }

  const normalUrl = showFlip && card.flip_image_url ? card.flip_image_url : card.image_url
  const pngUrl = showFlip && card.flip_png_url ? card.flip_png_url : card.png_url
  const imageUrl = isHovered && pngUrl ? pngUrl : normalUrl

  const dimensions = sizeStyles[size]

  const baseClasses = [
    'card',
    'relative rounded-lg overflow-hidden',
    disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
    selected && 'selected',
    tapped && 'tapped',
    dragging && 'dragging',
    className,
  ].filter(Boolean).join(' ')

  const glowShadow = glow !== 'none' ? glowColors[glow] : undefined
  const boxShadow = selected
    ? glowColors.gold
    : glowShadow || (dragging ? '0 20px 40px rgba(0, 0, 0, 0.5)' : undefined)

  return (
    <div
      className={baseClasses}
      style={{
        width: dimensions.width,
        height: dimensions.height,
        boxShadow,
      }}
      onClick={disabled ? undefined : onClick}
      onDoubleClick={disabled ? undefined : onDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false)
        if (enablePreview && previewContext) {
          previewContext.setPreviewCard(null)
        }
      }}
    >
      {isLoading && (
        <div className="skeleton absolute inset-0 flex items-center justify-center bg-gray-800">
          <span className="text-gray-400 text-xs text-center px-2">{card.name}</span>
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
      {card.flip_image_url && (
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
      {enablePreview && previewContext && isHovered && (
        <button
          className="absolute top-1 left-1 bg-black/60 rounded p-1 text-white hover:bg-black/80 transition-colors"
          onClick={(e) => {
            e.stopPropagation()
            previewContext.setPreviewCard(card)
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
      {card.tokens.length > 0 && (
        <div className="counter-badge">
          {card.tokens.length} tokens
        </div>
      )}
      {counters && Object.keys(counters).length > 0 && (
        <div className="absolute bottom-1 left-1 flex gap-1">
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
      {showUpgradeTarget && card.upgrade_target && (
        <>
          <button
            className="absolute bottom-0 left-0 right-0 bg-purple-900/90 text-white text-xs py-1 px-1 truncate hover:bg-purple-800/90 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setShowTargetModal(true)
            }}
          >
            → {card.upgrade_target.name}
          </button>
          {showTargetModal && (
            <div
              className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
              onClick={(e) => {
                e.stopPropagation()
                setShowTargetModal(false)
              }}
            >
              <div className="relative" onClick={(e) => e.stopPropagation()}>
                <img
                  src={card.upgrade_target.image_url}
                  alt={card.upgrade_target.name}
                  className="max-h-[80vh] rounded-lg shadow-2xl"
                />
                <button
                  className="absolute top-2 right-2 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80"
                  onClick={() => setShowTargetModal(false)}
                >
                  ×
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
