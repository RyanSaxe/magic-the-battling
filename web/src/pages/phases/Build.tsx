import { useState, useCallback, useEffect, useRef } from 'react'
import type { GameState, Card as CardType, BuildSource } from '../../types'
import { Card } from '../../components/card'
import { PlayerStatsBar } from '../../components/PlayerStatsBar'
import { BASIC_LANDS, BASIC_LAND_IMAGES } from '../../constants/assets'
import { useViewportCardSizes } from '../../hooks/useViewportCardSizes'

interface UpgradeConfirmationModalProps {
  upgrade: CardType
  target: CardType
  onConfirm: () => void
  onCancel: () => void
}

function UpgradeConfirmationModal({
  upgrade,
  target,
  onConfirm,
  onCancel,
}: UpgradeConfirmationModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onCancel])

  const getImageUrl = (card: CardType) => card.png_url ?? card.image_url

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="relative flex flex-col items-center gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-white text-lg font-semibold">Apply Upgrade?</div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-400 text-sm">Upgrade</span>
            <img
              src={getImageUrl(upgrade)}
              alt={upgrade.name}
              className="h-96 rounded-lg shadow-2xl"
            />
          </div>
          <div className="text-white text-3xl font-bold">→</div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-gray-400 text-sm">Target</span>
            <img
              src={getImageUrl(target)}
              alt={target.name}
              className="h-96 rounded-lg shadow-2xl"
            />
          </div>
        </div>
        <div className="text-yellow-500 text-sm">This action cannot be undone</div>
        <div className="flex gap-4 mt-2">
          <button
            className="btn btn-secondary px-6 py-2"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary px-6 py-2"
            onClick={onConfirm}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

interface BuildPhaseProps {
  gameState: GameState
  actions: {
    buildMove: (cardId: string, source: BuildSource, destination: BuildSource) => void
    buildSwap: (cardAId: string, sourceA: BuildSource, cardBId: string, sourceB: BuildSource) => void
    buildReady: (basics: string[]) => void
    buildUnready: () => void
    buildApplyUpgrade: (upgradeId: string, targetCardId: string) => void
    buildSetCompanion: (cardId: string) => void
    buildRemoveCompanion: () => void
  }
  selectedBasics: string[]
  onBasicsChange: (basics: string[]) => void
}

type SelectionZone = 'hand' | 'sideboard'

interface CardWithIndex {
  card: CardType
  index: number
  zone: SelectionZone
}

export function BuildPhase({ gameState, actions, selectedBasics, onBasicsChange }: BuildPhaseProps) {
  const sizes = useViewportCardSizes()
  const { self_player } = gameState
  const maxHandSize = self_player.hand_size

  const [selectedCard, setSelectedCard] = useState<CardWithIndex | null>(null)
  const [selectedUpgrade, setSelectedUpgrade] = useState<CardType | null>(null)
  const [pendingUpgrade, setPendingUpgrade] = useState<{
    upgrade: CardType
    target: CardType
  } | null>(null)
  const hasUserInteracted = useRef(false)

  useEffect(() => {
    if (!hasUserInteracted.current && self_player.chosen_basics?.length && selectedBasics.length === 0) {
      onBasicsChange([...self_player.chosen_basics])
    }
  }, [self_player.chosen_basics, selectedBasics.length, onBasicsChange])

  const addBasic = (name: string) => {
    hasUserInteracted.current = true
    if (selectedBasics.length < 3) {
      onBasicsChange([...selectedBasics, name])
    }
  }

  const removeBasic = (name: string) => {
    hasUserInteracted.current = true
    const idx = selectedBasics.indexOf(name)
    if (idx !== -1) {
      onBasicsChange([...selectedBasics.slice(0, idx), ...selectedBasics.slice(idx + 1)])
    }
  }

  const countBasic = (basic: string) => selectedBasics.filter((b) => b === basic).length

  const handleCardClick = useCallback(
    (card: CardType, index: number, zone: SelectionZone) => {
      if (selectedUpgrade) {
        setPendingUpgrade({ upgrade: selectedUpgrade, target: card })
        setSelectedUpgrade(null)
        return
      }

      if (selectedCard?.card.id === card.id) {
        setSelectedCard(null)
        return
      }

      if (!selectedCard) {
        setSelectedCard({ card, index, zone })
        return
      }

      if (selectedCard.zone === zone) {
        setSelectedCard({ card, index, zone })
        return
      }

      actions.buildSwap(selectedCard.card.id, selectedCard.zone, card.id, zone)
      setSelectedCard(null)
    },
    [selectedCard, selectedUpgrade, actions]
  )

  const handleUpgradeClick = (upgrade: CardType) => {
    if (selectedUpgrade?.id === upgrade.id) {
      setSelectedUpgrade(null)
    } else {
      setSelectedUpgrade(upgrade)
      setSelectedCard(null)
    }
  }

  const handleConfirmUpgrade = useCallback(() => {
    if (pendingUpgrade) {
      actions.buildApplyUpgrade(pendingUpgrade.upgrade.id, pendingUpgrade.target.id)
      setPendingUpgrade(null)
    }
  }, [pendingUpgrade, actions])

  const handleCancelUpgrade = useCallback(() => {
    setPendingUpgrade(null)
  }, [])

  const unappliedUpgrades = self_player.upgrades.filter((u) => !u.upgrade_target)
  const handExceedsLimit = self_player.hand.length > maxHandSize
  const upgradedCardIds = new Set(
    self_player.upgrades.filter((u) => u.upgrade_target).map((u) => u.upgrade_target!.id)
  )

  const isCompanion = (card: CardType) => card.oracle_text?.includes('Companion —') ?? false
  const companionCards = self_player.sideboard.filter(isCompanion)
  const selectedCompanionId = self_player.command_zone[0]?.id ?? null
  const hasCompanions = companionCards.length > 0

  return (
    <div className="relative flex flex-col h-full gap-4 p-4">
      <PlayerStatsBar treasures={self_player.treasures} poison={self_player.poison} />

      {/* Sudden Death Banner */}
      {gameState.self_player.in_sudden_death && (
        <div className="bg-red-900/80 border-b-2 border-red-500 px-4 py-3 text-center">
          <div className="text-red-100 font-bold text-lg tracking-wider uppercase animate-pulse flex items-center justify-center gap-2">
            Sudden Death
            <span className="relative group cursor-help">
              <span className="text-red-300/80 text-sm not-italic">ⓘ</span>
              <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-64 p-2 bg-black/95 border border-red-500/50 rounded text-xs text-left text-red-100 font-normal normal-case tracking-normal opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                Multiple players reached lethal poison. The two with the lowest poison are reset to 9 and face off. A draw causes both players to rebuild. Play continues until one is eliminated.
              </span>
            </span>
          </div>
          <div className="text-red-200/80 text-xs mt-1">
            Build your deck - fight to survive!
          </div>
        </div>
      )}

      {/* Hand area - large cards at top */}
      <div className="flex-1 flex flex-col items-center justify-center min-h-0">
        <div className="flex justify-between items-center w-full max-w-4xl mb-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Your Hand</span>
          <span
            className={`text-sm ${
              self_player.hand.length > maxHandSize ? 'text-red-400' : 'text-gray-400'
            }`}
          >
            {self_player.hand.length} / {maxHandSize}
          </span>
        </div>
        {self_player.hand.length === 0 ? (
          <div className="text-center">
            <div className="text-gray-400 text-lg mb-2">Hand is empty</div>
            <p className="text-gray-500 text-sm">
              Click a card from your pool to add it to your hand
            </p>
          </div>
        ) : (
          <div className="flex gap-4 justify-center flex-wrap overflow-auto p-1">
            {self_player.hand.map((card, index) => (
              <Card
                key={card.id}
                card={card}
                onClick={() => handleCardClick(card, index, 'hand')}
                selected={selectedCard?.card.id === card.id}
                glow={selectedUpgrade ? 'green' : 'none'}
                size={sizes.featured}
                upgraded={upgradedCardIds.has(card.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upgrade application instruction */}
      {selectedUpgrade && (
        <div className="bg-purple-900/40 rounded-lg p-3 text-center">
          <span className="text-purple-400 text-sm">
            Click a card to apply "{selectedUpgrade.name}" to it
          </span>
          <button
            onClick={() => setSelectedUpgrade(null)}
            className="ml-4 text-gray-400 text-sm hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Companion selection row */}
      {hasCompanions && (
        <div className="bg-amber-900/30 rounded-lg p-2 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400 uppercase tracking-wide">⬢ Companion</span>
              <span className="text-xs text-gray-400">(optional)</span>
            </div>
            <div className="flex gap-3 flex-1 justify-center items-center">
              {companionCards.map((card) => {
                const isSelected = card.id === selectedCompanionId
                return (
                  <div key={card.id} className="flex items-center gap-2">
                    <Card
                      card={card}
                      size="sm"
                      glow={isSelected ? 'gold' : 'none'}
                      onClick={() => isSelected ? actions.buildRemoveCompanion() : actions.buildSetCompanion(card.id)}
                    />
                    <button
                      onClick={() => isSelected ? actions.buildRemoveCompanion() : actions.buildSetCompanion(card.id)}
                      className={`text-xs px-2 py-1 rounded ${
                        isSelected
                          ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          : 'bg-amber-600 hover:bg-amber-500 text-white'
                      }`}
                    >
                      {isSelected ? 'Remove' : 'Select'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Basic lands - horizontal row */}
      <div className="bg-slate-800/50 rounded-lg p-2 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Basic Lands</span>
            <span className="text-xs text-gray-400">({selectedBasics.length}/3)</span>
          </div>
          <div className="flex gap-3 flex-1 justify-center">
            {BASIC_LANDS.map(({ name }) => {
              const count = countBasic(name)
              return (
                <div key={name} className="flex items-center gap-1">
                  <img
                    src={BASIC_LAND_IMAGES[name]}
                    alt={name}
                    className="rounded object-cover shadow-lg"
                    style={{ width: 60, height: 84 }}
                    title={name}
                  />
                  <div className="flex flex-col gap-0.5">
                    <button
                      onClick={() => addBasic(name)}
                      disabled={selectedBasics.length >= 3}
                      className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                    >
                      +
                    </button>
                    <span className="text-white text-xs w-5 text-center">{count}</span>
                    <button
                      onClick={() => removeBasic(name)}
                      disabled={count === 0}
                      className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                    >
                      -
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {handExceedsLimit && !self_player.build_ready && (
            <div className="text-red-400 text-xs">
              Hand exceeds limit ({self_player.hand.length}/{maxHandSize})
            </div>
          )}
        </div>
      </div>

      {/* Pool and Upgrades side by side */}
      <div className="flex gap-4 max-h-[30vh] min-h-[100px] shrink-0 overflow-hidden">
        {/* Pool (sideboard) */}
        <div className="bg-slate-800/50 rounded-lg p-3 flex-1 overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Your Pool</span>
            <span className="text-sm text-gray-400">{self_player.sideboard.length} cards</span>
          </div>
          {self_player.sideboard.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-4">
              All cards are in your hand
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 justify-center max-w-[1100px] mx-auto p-1">
              {self_player.sideboard.map((card, index) => (
                <Card
                  key={card.id}
                  card={card}
                  onClick={() => handleCardClick(card, index, 'sideboard')}
                  selected={selectedCard?.card.id === card.id}
                  glow={selectedUpgrade ? 'green' : 'none'}
                  size={sizes.pool}
                  upgraded={upgradedCardIds.has(card.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Unapplied upgrades */}
        {gameState.use_upgrades && unappliedUpgrades.length > 0 && (
          <div className="bg-purple-950/30 rounded-lg p-3 w-48 flex-shrink-0 overflow-auto">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              Apply Upgrade
            </div>
            <div className="flex flex-col gap-2">
              {unappliedUpgrades.map((upgrade) => (
                <Card
                  key={upgrade.id}
                  card={upgrade}
                  size="sm"
                  selected={selectedUpgrade?.id === upgrade.id}
                  onClick={() => handleUpgradeClick(upgrade)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {pendingUpgrade && (
        <UpgradeConfirmationModal
          upgrade={pendingUpgrade.upgrade}
          target={pendingUpgrade.target}
          onConfirm={handleConfirmUpgrade}
          onCancel={handleCancelUpgrade}
        />
      )}
    </div>
  )
}
