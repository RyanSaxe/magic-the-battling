import { useState } from 'react'
import type { Card as CardType } from '../types'

interface CardProps {
  card: CardType
  onClick?: () => void
  selected?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-24 h-34',
  md: 'w-32 h-44',
  lg: 'w-48 h-67',
}

export function Card({ card, onClick, selected, size = 'md' }: CardProps) {
  const [showFlip, setShowFlip] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isHovered, setIsHovered] = useState(false)

  const normalUrl = showFlip && card.flip_image_url ? card.flip_image_url : card.image_url
  const pngUrl = showFlip && card.flip_png_url ? card.flip_png_url : card.png_url
  const imageUrl = isHovered && pngUrl ? pngUrl : normalUrl

  return (
    <div
      className={`relative ${sizeClasses[size]} rounded-lg overflow-hidden cursor-pointer transition-all duration-200 ${
        selected ? 'ring-4 ring-blue-500 scale-105' : 'hover:scale-125 hover:z-50'
      }`}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-gray-700 animate-pulse flex items-center justify-center">
          <span className="text-gray-400 text-xs">{card.name}</span>
        </div>
      )}
      <img
        src={imageUrl}
        alt={card.name}
        className={`w-full h-full object-cover ${isLoading ? 'invisible' : ''}`}
        onLoad={() => setIsLoading(false)}
        onError={() => setIsLoading(false)}
      />
      {card.flip_image_url && (
        <button
          className="absolute top-1 right-1 bg-black bg-opacity-50 rounded p-1 text-white text-xs"
          onClick={(e) => {
            e.stopPropagation()
            setShowFlip(!showFlip)
          }}
        >
          Flip
        </button>
      )}
      {card.tokens.length > 0 && (
        <div className="absolute bottom-1 left-1 bg-black bg-opacity-50 rounded px-1 text-white text-xs">
          {card.tokens.length} tokens
        </div>
      )}
    </div>
  )
}
