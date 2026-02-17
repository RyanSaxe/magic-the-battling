import { useState, useEffect, useRef } from 'react'
import type { GameState, Card as CardType, BuildSource } from '../../types'
import { Card } from '../../components/card'
import { CardSlot } from '../../components/common/CardSlot'
import { BasicLandSlot } from '../../components/common/BasicLandSlot'
import { TreasureCard } from '../../components/common/TreasureCard'
import { PoisonCard } from '../../components/common/PoisonCard'
import { CardGrid } from '../../components/common/CardGrid'
import { ZoneLayout } from '../../components/common/ZoneLayout'
import { useGameSummaryCardSize } from '../../hooks/useGameSummaryCardSize'

type Selection =
  | { type: 'card'; cardId: string; zone: 'hand' | 'sideboard' }
  | { type: 'empty'; slotIndex: number }
  | null

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

export function BuildPhase({ gameState, actions, selectedBasics, onBasicsChange, isMobile = false }: BuildPhaseProps) {
  const { self_player } = gameState
  const maxHandSize = self_player.hand_size
  const locked = self_player.build_ready

  const hasUserInteracted = useRef(false)
  const [selection, setSelection] = useState<Selection>(null)

  useEffect(() => {
    if (!hasUserInteracted.current && self_player.chosen_basics?.length && selectedBasics.length === 0) {
      onBasicsChange([...self_player.chosen_basics])
    }
  }, [self_player.chosen_basics, selectedBasics.length, onBasicsChange])

  const handleBasicPick = (index: number, name: string) => {
    if (locked) return
    hasUserInteracted.current = true
    const next = [...selectedBasics]
    next[index] = name
    onBasicsChange(next)
  }

  const appliedUpgrades = self_player.upgrades.filter((u) => u.upgrade_target)
  const upgradedCardIds = new Set(appliedUpgrades.map((u) => u.upgrade_target!.id))
  const getAppliedUpgrades = (cardId: string) =>
    appliedUpgrades.filter((u) => u.upgrade_target!.id === cardId)

  const isCompanion = (card: CardType) => card.oracle_text?.includes('Companion —') ?? false
  const selectedCompanionId = self_player.command_zone[0]?.id ?? null

  const handleEmptySlotClick = (slotIndex: number) => {
    if (locked) return
    if (selection?.type === 'card' && selection.zone === 'sideboard') {
      actions.buildMove(selection.cardId, 'sideboard', 'hand')
      setSelection(null)
    } else if (selection?.type === 'empty' && selection.slotIndex === slotIndex) {
      setSelection(null)
    } else {
      setSelection({ type: 'empty', slotIndex })
    }
  }

  const handleHandCardClick = (card: CardType) => {
    if (locked) return
    if (selection?.type === 'card' && selection.cardId === card.id) {
      setSelection(null)
    } else if (selection?.type === 'card' && selection.zone === 'sideboard') {
      actions.buildSwap(card.id, 'hand', selection.cardId, 'sideboard')
      setSelection(null)
    } else {
      setSelection({ type: 'card', cardId: card.id, zone: 'hand' })
    }
  }

  const handleSideboardCardClick = (card: CardType) => {
    if (locked) return
    if (selection?.type === 'card' && selection.cardId === card.id) {
      setSelection(null)
    } else if (selection?.type === 'card' && selection.zone === 'hand') {
      actions.buildSwap(selection.cardId, 'hand', card.id, 'sideboard')
      setSelection(null)
    } else if (selection?.type === 'empty') {
      actions.buildMove(card.id, 'sideboard', 'hand')
      setSelection(null)
    } else {
      setSelection({ type: 'card', cardId: card.id, zone: 'sideboard' })
    }
  }

  const battlefieldCount = 3 + 1 + 1 // 3 basic slots + treasure + poison
  const [containerRef, dims] = useGameSummaryCardSize({
    handCount: maxHandSize,
    battlefieldCount,
    sideboardCount: self_player.sideboard.length,
    commandZoneCount: 0,
  })

  const handDims = { width: dims.hand.width, height: dims.hand.height }
  const bfDims = { width: dims.battlefield.width, height: dims.battlefield.height }
  const sbDims = { width: dims.sideboard.width, height: dims.sideboard.height }

  const emptySlotLabel = isMobile ? 'Tap here and\na card below' : 'Click here and\na card below'

  const isCardSelected = (cardId: string) =>
    selection?.type === 'card' && selection.cardId === cardId

  const handItems = Array.from({ length: maxHandSize }, (_, i) => {
    const card = self_player.hand[i]
    if (card) {
      return (
        <div key={card.id} className="relative">
          <Card
            card={card}
            onClick={() => handleHandCardClick(card)}
            selected={isCardSelected(card.id)}
            dimensions={handDims}
            upgraded={upgradedCardIds.has(card.id)}
            appliedUpgrades={getAppliedUpgrades(card.id)}
          />
        </div>
      )
    }
    const slotSelected = selection?.type === 'empty' && selection.slotIndex === i
    return (
      <CardSlot
        key={`empty-${i}`}
        label={emptySlotLabel}
        dimensions={handDims}
        selected={slotSelected}
        onClick={() => handleEmptySlotClick(i)}
      />
    )
  })

  const basicSlots = Array.from({ length: 3 }, (_, i) => (
    <BasicLandSlot
      key={i}
      selected={selectedBasics[i] ?? null}
      dimensions={bfDims}
      onPick={(name) => handleBasicPick(i, name)}
      isMobile={isMobile}
    />
  ))

  return (
    <>
      {self_player.in_sudden_death && (
        <div className="bg-red-900/80 border-b-2 border-red-500 px-4 py-3 text-center shrink-0">
          <div className="text-red-100 font-bold text-lg tracking-wider uppercase animate-pulse flex items-center justify-center gap-2">
            Sudden Death
            <span className="relative group cursor-help">
              <span className="text-red-300/80 text-sm not-italic">&#9432;</span>
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

      <ZoneLayout
        containerRef={containerRef}
        className={`rounded-lg bg-gray-600/40 p-[1px] flex-1 min-h-0 flex flex-col m-2 transition-opacity ${locked ? 'opacity-60 pointer-events-none' : ''}`}
        hasHand={true}
        hasBattlefield={true}
        hasSideboard={self_player.sideboard.length > 0}
        hasUpgrades={false}
        handLabel={
          <>
            Hand
            <span className={`ml-1.5 ${self_player.hand.length === maxHandSize ? 'text-green-400' : 'text-gray-500'}`}>
              {self_player.hand.length}/{maxHandSize}
            </span>
          </>
        }
        handContent={
          <CardGrid columns={dims.hand.columns} cardWidth={handDims.width}>
            {handItems}
          </CardGrid>
        }
        battlefieldLabel="Battlefield"
        battlefieldContent={
          <CardGrid columns={dims.battlefield.columns} cardWidth={bfDims.width}>
            {basicSlots}
            <TreasureCard count={self_player.treasures} dimensions={bfDims} />
            <PoisonCard count={self_player.poison} dimensions={bfDims} />
          </CardGrid>
        }
        sideboardLabel={`Sideboard (${self_player.sideboard.length})`}
        sideboardContent={
          <CardGrid columns={dims.sideboard.columns} cardWidth={sbDims.width}>
            {self_player.sideboard.map((card) => {
              const cardIsCompanion = isCompanion(card)
              const isActiveCompanion = card.id === selectedCompanionId
              return (
                <div key={card.id} className="relative">
                  <Card
                    card={card}
                    onClick={() => handleSideboardCardClick(card)}
                    selected={isCardSelected(card.id)}
                    isCompanion={isActiveCompanion}
                    dimensions={sbDims}
                    upgraded={upgradedCardIds.has(card.id)}
                    appliedUpgrades={getAppliedUpgrades(card.id)}
                  />
                  {cardIsCompanion && (
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
                  )}
                </div>
              )
            })}
          </CardGrid>
        }
        upgradesLabel={null}
        upgradesContent={null}
      />
    </>
  )
}
