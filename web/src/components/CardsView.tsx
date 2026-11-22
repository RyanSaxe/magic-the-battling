import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getGameCards, type GameCardsResponse } from '../api/client'
import { CardPreviewModal } from './card/CardPreviewModal'
import type { Card } from '../types'
import { unknownToAppError } from '../utils/appError'
import { TEXT_INPUT } from './common/styles'
import { ManaSymbol } from './icons/ManaSymbol'

const COLOR_CHIPS = [
  { code: 'W', label: 'White' },
  { code: 'U', label: 'Blue' },
  { code: 'B', label: 'Black' },
  { code: 'R', label: 'Red' },
  { code: 'G', label: 'Green' },
  { code: 'C', label: 'Colorless' },
] as const

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G']

function colorSortKey(colors: string[]): number {
  if (colors.length === 0) return 100
  const minIndex = Math.min(...colors.map((c) => COLOR_ORDER.indexOf(c)).filter((i) => i >= 0))
  return colors.length * 10 + (minIndex >= 0 ? minIndex : 9)
}

export function CardsView({
  gameId,
  which,
  playerName,
}: {
  gameId: string
  which: 'cards' | 'upgrades'
  playerName?: string
}) {
  const [data, setData] = useState<GameCardsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchName, setSearchName] = useState('')
  const [searchType, setSearchType] = useState('')
  const [searchText, setSearchText] = useState('')
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set())
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const cacheRef = useRef<GameCardsResponse | null>(null)
  const cacheKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const cacheKey = `${gameId}:${playerName ?? ''}`
    if (cacheRef.current && cacheKeyRef.current === cacheKey) {
      setData(cacheRef.current)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getGameCards(gameId, playerName)
      .then((result) => {
        if (cancelled) return
        cacheKeyRef.current = cacheKey
        cacheRef.current = result
        setData(result)
      })
      .catch((err) => {
        if (cancelled) return
        setError(unknownToAppError(err, 'default', 'Failed to load cards').message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [gameId, playerName])

  if (loading) {
    return (
      <div className="cards-view-list flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return <div className="cards-view-list text-red-400 text-center py-8">{error}</div>
  }

  const allCards = which === 'cards' ? data?.cards ?? [] : data?.upgrades ?? []
  const nameLower = searchName.toLowerCase()
  const typeLower = searchType.toLowerCase()
  const textLower = searchText.toLowerCase()

  const filtered = allCards.filter((card) => {
    if (nameLower && !card.name.toLowerCase().includes(nameLower)) return false
    if (typeLower && !card.type_line.toLowerCase().includes(typeLower)) return false
    if (textLower && !(card.oracle_text?.toLowerCase().includes(textLower) ?? false)) return false
    if (selectedColors.size > 0) {
      if (selectedColors.has('C')) {
        if (card.colors.length !== 0) return false
      } else {
        for (const c of selectedColors) {
          if (!card.colors.includes(c)) return false
        }
      }
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const colorA = colorSortKey(a.colors)
    const colorB = colorSortKey(b.colors)
    if (colorA !== colorB) return colorA - colorB
    if (a.cmc !== b.cmc) return a.cmc - b.cmc
    return a.name.localeCompare(b.name)
  })

  const toggleColor = (code: string) => {
    setSelectedColors((prev) => {
      if (code === 'C') return prev.has('C') ? new Set() : new Set(['C'])
      const next = new Set(prev)
      next.delete('C')
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const inputClass =
    `${TEXT_INPUT} placeholder-[var(--ivory-faint)]`

  const showFilters = which === 'cards'

  return (
    <div className="cards-view flex flex-col min-h-0 flex-1">
      {showFilters && (
        <div className="cards-view-filters shrink-0 flex flex-col gap-2 pb-3">
          <div className="cards-view-fields grid grid-cols-3 gap-2">
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              placeholder="Name..."
              className={inputClass}
            />
            <input
              type="text"
              value={searchType}
              onChange={(e) => setSearchType(e.target.value)}
              placeholder="Type..."
              className={inputClass}
            />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Text..."
              className={inputClass}
            />
          </div>

          <div className="cards-view-colors flex items-center gap-1.5 flex-wrap">
            {COLOR_CHIPS.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                aria-label={label}
                aria-pressed={selectedColors.has(code)}
                onClick={() => toggleColor(code)}
                className={`mana-filter-btn ${selectedColors.size === 0 ? '' : selectedColors.has(code) ? 'is-on' : 'is-off'}`}
              >
                <ManaSymbol symbol={code} size="md" />
              </button>
            ))}
          </div>

          <div className="text-xs text-[var(--ivory-muted)]">
            {sorted.length === allCards.length
              ? `${allCards.length} cards`
              : `${sorted.length} of ${allCards.length} cards`}
          </div>
        </div>
      )}

      <div className="cards-view-list flex-1 overflow-y-auto min-h-0 pb-3">
        {sorted.length === 0 ? (
          <div className="text-[var(--ivory-muted)] text-center py-8">No cards match</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {sorted.map((card) => (
              <img
                key={card.id}
                src={card.image_url}
                alt={card.name}
                title={card.name}
                className="cursor-pointer hover:brightness-125 transition-all"
                style={{ borderRadius: 'var(--card-border-radius)' }}
                onClick={() => setPreviewCard(card)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Out of the Guide's container, which older Safari would fit the preview to instead of the screen. */}
      {previewCard && createPortal(
        <CardPreviewModal
          card={previewCard}
          appliedUpgrades={[]}
          onClose={() => setPreviewCard(null)}
        />,
        document.body,
      )}
    </div>
  )
}
