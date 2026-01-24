import { useState } from 'react'
import type { GameState, Card as CardType, ZoneName } from '../../types'
import { GameDndProvider, useDndActions } from '../../dnd'
import { HandZone, BattlefieldZone, PileZone } from '../../components/zones'
import { Card, CardBack } from '../../components/card'

const isLand = (card: CardType) => card.type_line.toLowerCase().includes('land')

interface BattlePhaseProps {
  gameState: GameState
  actions: {
    battleMove: (cardId: string, fromZone: ZoneName, toZone: ZoneName) => void
    battleSubmitResult: (result: string) => void
  }
}

export function BattlePhase({ gameState, actions }: BattlePhaseProps) {
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    zone: ZoneName
  } | null>(null)
  const [tappedCards, setTappedCards] = useState<Set<string>>(new Set())

  const { handleCardMove, getValidDropZones } = useDndActions({
    phase: 'battle',
    battleMove: actions.battleMove,
  })

  const { self_player, current_battle } = gameState

  if (!current_battle) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-white mb-4">Waiting for Battle</div>
          <p className="text-gray-400">Waiting for opponent to finish building...</p>
        </div>
      </div>
    )
  }

  const { your_zones, opponent_zones, opponent_name, coin_flip_name, opponent_hand_count, result_submissions } = current_battle

  const opponentLands = opponent_zones.battlefield.filter(isLand)
  const opponentPermanents = opponent_zones.battlefield.filter((c) => !isLand(c))

  const handleCardClick = (card: CardType, zone: ZoneName) => {
    if (selectedCard?.card.id === card.id) {
      setSelectedCard(null)
    } else {
      setSelectedCard({ card, zone })
    }
  }

  const handleCardDoubleClick = (card: CardType) => {
    setTappedCards((prev) => {
      const next = new Set(prev)
      if (next.has(card.id)) {
        next.delete(card.id)
      } else {
        next.add(card.id)
      }
      return next
    })
  }

  const mySubmission = result_submissions[self_player.name]
  const opponentSubmission = result_submissions[opponent_name]

  return (
    <GameDndProvider onCardMove={handleCardMove} validDropZones={getValidDropZones}>
      <div className="flex flex-col h-full gap-2">
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-2">
          <div className="text-lg text-white">
            vs <span className="font-medium">{opponent_name}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">First:</span>
            <span className="text-amber-400 font-medium">{coin_flip_name}</span>
          </div>
        </div>

        {/* Opponent's hand (card backs) */}
        {opponent_hand_count > 0 && (
          <div className="px-4 py-2 bg-black/30">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              {opponent_name}'s Hand ({opponent_hand_count})
            </div>
            <div className="flex gap-1 overflow-x-auto">
              {Array.from({ length: opponent_hand_count }).map((_, i) => (
                <CardBack key={i} size="sm" />
              ))}
            </div>
          </div>
        )}

        {/* Opponent's battlefield */}
        <div className="flex-1 flex flex-col">
          <div className="relative flex-1 battlefield opacity-80">
            <div className="absolute top-2 left-2 text-xs text-gray-400 uppercase tracking-wide">
              {opponent_name}
            </div>
            <div className="flex flex-col gap-2 p-4 pt-8 min-h-[150px]">
              {/* Opponent's permanents (non-lands) */}
              <div className="flex flex-wrap gap-2">
                {opponentPermanents.length === 0 && opponentLands.length === 0 ? (
                  <div className="text-gray-500 text-sm">Empty battlefield</div>
                ) : (
                  opponentPermanents.map((card) => (
                    <Card key={card.id} card={card} size="sm" />
                  ))
                )}
              </div>
              {/* Opponent's lands */}
              {opponentLands.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-2 border-t border-gray-700/50">
                  {opponentLands.map((card) => (
                    <Card key={card.id} card={card} size="sm" />
                  ))}
                </div>
              )}
            </div>
            {/* Opponent's piles */}
            <div className="absolute bottom-2 right-2 flex gap-2">
              <PileZone
                zone="graveyard"
                cards={opponent_zones.graveyard}
                isOpponent
              />
              <PileZone
                zone="exile"
                cards={opponent_zones.exile}
                isOpponent
              />
            </div>
          </div>

          {/* Center divider */}
          <div className="border-t border-dashed border-gray-600/50 mx-4" />

          {/* Your battlefield */}
          <div className="relative flex-1">
            <BattlefieldZone
              cards={your_zones.battlefield}
              selectedCardId={selectedCard?.card.id}
              onCardClick={(card) => handleCardClick(card, 'battlefield')}
              onCardDoubleClick={handleCardDoubleClick}
              tappedCardIds={tappedCards}
              label="Your Battlefield"
              separateLands
            />
            {/* Your piles */}
            <div className="absolute bottom-2 right-2 flex gap-2">
              <PileZone
                zone="graveyard"
                cards={your_zones.graveyard}
                selectedCardId={selectedCard?.card.id}
                onCardClick={(card) => handleCardClick(card, 'graveyard')}
              />
              <PileZone
                zone="exile"
                cards={your_zones.exile}
                selectedCardId={selectedCard?.card.id}
                onCardClick={(card) => handleCardClick(card, 'exile')}
              />
            </div>
          </div>
        </div>

        {/* Your hand */}
        <HandZone
          cards={your_zones.hand}
          selectedCardId={selectedCard?.card.id}
          onCardClick={(card) => handleCardClick(card, 'hand')}
        />

        {/* Result submission */}
        <div className="px-4 pb-4">
          {mySubmission && (
            <div className="mb-3 text-sm text-gray-400 text-center">
              You reported: <span className="text-white">{mySubmission}</span>
              {opponentSubmission && mySubmission !== opponentSubmission && (
                <span className="text-red-400 ml-2">
                  (Conflict: opponent says {opponentSubmission})
                </span>
              )}
            </div>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={() => actions.battleSubmitResult(self_player.name)}
              className="btn btn-primary"
            >
              I Won
            </button>
            <button
              onClick={() => actions.battleSubmitResult('draw')}
              className="btn btn-secondary"
            >
              Draw
            </button>
            <button
              onClick={() => actions.battleSubmitResult(opponent_name)}
              className="btn btn-danger"
            >
              Opponent Won
            </button>
          </div>
        </div>
      </div>
    </GameDndProvider>
  )
}
