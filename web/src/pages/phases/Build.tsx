import { useState, useCallback, useEffect, useRef } from 'react'
import type { GameState, Card as CardType, BuildSource } from '../../types'
import { Card } from '../../components/card'
import { UpgradeStack } from '../../components/sidebar/UpgradeStack'
import { UpgradeConfirmationModal } from '../../components/common/UpgradeConfirmationModal'
import { BASIC_LANDS, BASIC_LAND_IMAGES } from '../../constants/assets'
import { useDualZoneCardSizes } from '../../hooks/useDualZoneCardSizes'
import { useElementHeight } from '../../hooks/useElementHeight'

interface BuildPhaseProps {
  gameState: GameState
  actions: {
    buildMove: (cardId: string, source: BuildSource, destination: BuildSource) => void
    buildSwap: (cardAId: string, sourceA: BuildSource, cardBId: string, sourceB: BuildSource) => void
    buildReady: (basics: string[], playDrawPreference: 'play' | 'draw') => void
    buildUnready: () => void
    buildApplyUpgrade: (upgradeId: string, targetCardId: string) => void
    buildSetCompanion: (cardId: string) => void
    buildRemoveCompanion: () => void
  }
  selectedBasics: string[]
  onBasicsChange: (basics: string[]) => void
  isMobile?: boolean
}

type SelectionZone = 'hand' | 'sideboard'

interface CardWithIndex {
  card: CardType
  index: number
  zone: SelectionZone
}

export function BuildPhase({ gameState, actions, selectedBasics, onBasicsChange, isMobile = false }: BuildPhaseProps) {
  const { self_player } = gameState
  const maxHandSize = self_player.hand_size
  const locked = self_player.build_ready

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
      if (locked) return
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
    [locked, selectedCard, selectedUpgrade, actions]
  )

  const handleUpgradeClick = (upgrade: CardType) => {
    if (locked) return
    if (selectedCard) {
      setPendingUpgrade({ upgrade, target: selectedCard.card })
      setSelectedCard(null)
      return
    }
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

  const appliedUpgrades = self_player.upgrades.filter((u) => u.upgrade_target)
  const unappliedUpgrades = self_player.upgrades.filter((u) => !u.upgrade_target)
  const upgradedCardIds = new Set(appliedUpgrades.map((u) => u.upgrade_target!.id))
  const allUpgrades = [...appliedUpgrades, ...unappliedUpgrades]
  const getAppliedUpgrades = (cardId: string) =>
    appliedUpgrades.filter((u) => u.upgrade_target!.id === cardId)

  const isCompanion = (card: CardType) => card.oracle_text?.includes('Companion —') ?? false
  const selectedCompanionId = self_player.command_zone[0]?.id ?? null

  const poolItemCount = allUpgrades.length + self_player.sideboard.length

  const [topFixedRef, topFixedHeight] = useElementHeight()
  const [middleRef, middleHeight] = useElementHeight()

  const topExtra = self_player.hand.length > 0 ? topFixedHeight + 4 : topFixedHeight
  const fixedHeight = topExtra + middleHeight + 16

  const [containerRef, { top: handCardDims, bottom: poolCardDims }] = useDualZoneCardSizes({
    topCount: self_player.hand.length,
    bottomCount: poolItemCount,
    topGap: 6,
    bottomGap: 6,
    fixedHeight,
    topMaxWidth: 400,
    bottomMaxWidth: 300,
  })

  return (
    <div ref={containerRef} className={`flex flex-col h-full gap-2 p-4 overflow-hidden transition-opacity ${locked ? 'opacity-60 pointer-events-none' : ''}`}>
      {self_player.hand.length === 0 ? (
        <div ref={topFixedRef} className="text-center">
          <div className="text-gray-400 text-sm">Hand is empty</div>
        </div>
      ) : (
        <div>
          <div ref={topFixedRef} className="flex items-center gap-2 justify-center mb-1">
            <span className="text-xs text-gray-400 uppercase tracking-wide">Hand</span>
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                self_player.hand.length > maxHandSize ? 'bg-red-900/50 text-red-400' : 'text-gray-500'
              }`}
            >
              {self_player.hand.length}/{maxHandSize}
            </span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${handCardDims.columns}, ${handCardDims.width}px)`,
            gap: '6px',
            justifyContent: 'center',
            maxWidth: '100%',
            overflow: 'hidden',
          }}>
            {self_player.hand.map((card, index) => (
              <div key={card.id} className="relative">
                <Card
                  card={card}
                  onClick={() => handleCardClick(card, index, 'hand')}
                  selected={selectedCard?.card.id === card.id}
                  glow={selectedUpgrade ? 'green' : 'none'}
                  dimensions={handCardDims}
                  upgraded={upgradedCardIds.has(card.id)}
                  appliedUpgrades={getAppliedUpgrades(card.id)}
                />
                {selectedUpgrade && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setPendingUpgrade({ upgrade: selectedUpgrade, target: card })
                      setSelectedUpgrade(null)
                    }}
                    className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-medium py-0.5 rounded-b-lg bg-purple-600/80 text-white hover:bg-purple-500/90"
                  >
                    Apply
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={middleRef} className="flex flex-col gap-2">
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

        {/* Basic lands */}
        <div className="flex gap-1.5 justify-center px-2 py-1">
          {BASIC_LANDS.map(({ name }) => {
            const count = countBasic(name)
            return (
              <div key={name} className="relative">
                <img
                  src={BASIC_LAND_IMAGES[name]}
                  alt={name}
                  className="rounded object-cover shadow-lg cursor-pointer"
                  style={{ width: isMobile ? 52 : 90, height: isMobile ? 73 : 126 }}
                  title={name}
                  onClick={() => {
                    if (locked) return
                    if (selectedBasics.length < 3) {
                      addBasic(name)
                    } else if (count > 0) {
                      removeBasic(name)
                    }
                  }}
                />
                <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-1 bg-black/70 rounded-b py-0.5">
                  <button
                    onClick={() => removeBasic(name)}
                    disabled={locked || count === 0}
                    className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                  >
                    -
                  </button>
                  <span className="text-white text-xs w-4 text-center">{count}</span>
                  <button
                    onClick={() => addBasic(name)}
                    disabled={locked || selectedBasics.length >= 3}
                    className="w-5 h-5 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed text-white text-xs font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Pool (upgrades + sideboard) */}
      {poolItemCount === 0 ? (
        <div className="flex items-center justify-center">
          <div className="text-gray-500 text-sm text-center">
            All cards are in your hand
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${poolCardDims.columns}, ${poolCardDims.width}px)`,
          gap: '6px',
          justifyContent: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
        }}>
          {allUpgrades.map((upgrade) => {
            const isApplied = !!upgrade.upgrade_target
            return (
              <div key={upgrade.id} className="relative">
                {isApplied ? (
                  <UpgradeStack upgrade={upgrade} dimensions={poolCardDims} />
                ) : (
                  <>
                    <Card
                      card={upgrade}
                      dimensions={poolCardDims}
                      selected={selectedUpgrade?.id === upgrade.id}
                      glow={selectedCard ? 'green' : 'none'}
                      onClick={() => handleUpgradeClick(upgrade)}
                    />
                    {selectedCard && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setPendingUpgrade({ upgrade, target: selectedCard.card })
                          setSelectedCard(null)
                        }}
                        className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-medium py-0.5 rounded-b-lg bg-purple-600/80 text-white hover:bg-purple-500/90"
                      >
                        Apply
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          })}
          {self_player.sideboard.map((card, index) => {
            const cardIsCompanion = isCompanion(card)
            const isActiveCompanion = card.id === selectedCompanionId
            return (
              <div key={card.id} className="relative">
                <Card
                  card={card}
                  onClick={() => handleCardClick(card, index, 'sideboard')}
                  selected={selectedCard?.card.id === card.id}
                  glow={selectedUpgrade ? 'green' : isActiveCompanion ? 'gold' : 'none'}
                  dimensions={poolCardDims}
                  upgraded={upgradedCardIds.has(card.id)}
                  appliedUpgrades={getAppliedUpgrades(card.id)}
                />
                {selectedUpgrade ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setPendingUpgrade({ upgrade: selectedUpgrade, target: card })
                      setSelectedUpgrade(null)
                    }}
                    className="absolute bottom-0 left-0 right-0 text-center text-[10px] font-medium py-0.5 rounded-b-lg bg-purple-600/80 text-white hover:bg-purple-500/90"
                  >
                    Apply
                  </button>
                ) : cardIsCompanion ? (
                  <button
                    disabled={locked}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (isActiveCompanion) {
                        actions.buildRemoveCompanion()
                      } else {
                        actions.buildSetCompanion(card.id)
                      }
                    }}
                    className={`absolute bottom-0 left-0 right-0 text-center text-[10px] font-medium py-0.5 rounded-b-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActiveCompanion
                        ? 'bg-amber-500/90 text-black'
                        : 'bg-purple-600/80 text-white hover:bg-purple-500/90'
                    }`}
                  >
                    {isActiveCompanion ? 'Companion' : 'Set Companion'}
                  </button>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

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
