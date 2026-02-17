import { useState, useEffect } from 'react'
import type { Card as CardType } from '../../types'

interface CardPreviewModalProps {
  card: CardType
  appliedUpgrades: CardType[]
  onClose: () => void
}

export function CardPreviewModal({ card, appliedUpgrades, onClose }: CardPreviewModalProps) {
  const [isFlipped, setIsFlipped] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const getImageUrl = (c: CardType, flipped: boolean) => {
    if (flipped && c.flip_image_url) {
      return c.flip_image_url
    }
    return c.png_url ?? c.image_url
  }

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]"
      onClick={onClose}
    >
      <div
        className="relative flex gap-4 items-center max-w-[95vw] max-h-[85vh] px-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={getImageUrl(card, isFlipped)}
          alt={card.name}
          className="max-h-[80vh] min-w-0 shrink rounded-lg shadow-2xl"
          style={{ maxWidth: `${Math.floor(90 / (1 + appliedUpgrades.length))}vw` }}
        />
        {appliedUpgrades.length > 0 && (
          <>
            <div className="text-white text-2xl font-bold shrink-0">&rarr;</div>
            {appliedUpgrades.map((upgrade) => (
              <img
                key={upgrade.id}
                src={getImageUrl(upgrade, isFlipped)}
                alt={upgrade.name}
                className="max-h-[80vh] min-w-0 shrink rounded-lg shadow-2xl"
                style={{ maxWidth: `${Math.floor(90 / (1 + appliedUpgrades.length))}vw` }}
              />
            ))}
          </>
        )}
        <button
          className="absolute -top-4 -right-4 bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80"
          onClick={onClose}
        >
          &times;
        </button>
        {card.flip_image_url && (
          <button
            className="absolute top-2 right-2 bg-black/60 text-white rounded px-3 py-1 text-sm hover:bg-black/80 transition-colors"
            onClick={() => setIsFlipped(!isFlipped)}
          >
            Flip
          </button>
        )}
      </div>
    </div>
  )
}
