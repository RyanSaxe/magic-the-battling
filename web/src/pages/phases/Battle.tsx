import { useState } from 'react'
import { CardZone } from '../../components/CardZone'
import type { GameState, Card as CardType, ZoneName } from '../../types'

interface BattlePhaseProps {
  gameState: GameState
  actions: {
    battleMove: (cardId: string, fromZone: ZoneName, toZone: ZoneName) => void
    battleSubmitResult: (result: string) => void
  }
}

const ZONES: ZoneName[] = ['hand', 'battlefield', 'graveyard', 'exile']

export function BattlePhase({ gameState, actions }: BattlePhaseProps) {
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    zone: ZoneName
  } | null>(null)

  const { self_player, current_battle } = gameState

  if (!current_battle) {
    return (
      <div className="bg-gray-800 rounded-lg p-8 text-center">
        <h2 className="text-xl text-white mb-4">Waiting for Battle</h2>
        <p className="text-gray-400">Waiting for opponent to finish building...</p>
      </div>
    )
  }

  const { your_zones, opponent_zones, opponent_name, coin_flip_name, result_submissions } = current_battle

  const handleCardClick = (card: CardType, zone: ZoneName) => {
    if (selectedCard?.card.id === card.id) {
      setSelectedCard(null)
    } else {
      setSelectedCard({ card, zone })
    }
  }

  const handleMoveToZone = (toZone: ZoneName) => {
    if (selectedCard && selectedCard.zone !== toZone) {
      actions.battleMove(selectedCard.card.id, selectedCard.zone, toZone)
      setSelectedCard(null)
    }
  }

  const mySubmission = result_submissions[self_player.name]
  const opponentSubmission = result_submissions[opponent_name]

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">
            Battle vs {opponent_name}
          </h2>
          <div className="text-gray-400">
            Coin flip: <span className="text-yellow-400">{coin_flip_name}</span> goes first
          </div>
        </div>
      </div>

      <div className="bg-gray-700 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">{opponent_name}'s Board</h3>
        <div className="grid grid-cols-2 gap-4">
          <CardZone
            title="Battlefield"
            cards={opponent_zones.battlefield}
            emptyMessage="Empty"
          />
          <CardZone
            title="Graveyard"
            cards={opponent_zones.graveyard}
            emptyMessage="Empty"
          />
        </div>
      </div>

      {selectedCard && (
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex items-center gap-4">
            <span className="text-white">Move to:</span>
            {ZONES.map((zone) => (
              <button
                key={zone}
                onClick={() => handleMoveToZone(zone)}
                disabled={selectedCard.zone === zone}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-1 rounded capitalize"
              >
                {zone}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">Your Board</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ZONES.map((zone) => (
            <CardZone
              key={zone}
              title={zone.charAt(0).toUpperCase() + zone.slice(1)}
              cards={your_zones[zone] as CardType[]}
              onCardClick={(card) => handleCardClick(card, zone)}
              selectedCardId={selectedCard?.card.id}
              maxHeight="max-h-48"
            />
          ))}
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">Report Result</h3>

        {mySubmission && (
          <div className="mb-4 text-gray-400">
            You reported: <span className="text-white">{mySubmission}</span>
            {opponentSubmission && mySubmission !== opponentSubmission && (
              <span className="text-red-400 ml-2">
                (Opponent reported: {opponentSubmission})
              </span>
            )}
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={() => actions.battleSubmitResult(self_player.name)}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded"
          >
            I Won
          </button>
          <button
            onClick={() => actions.battleSubmitResult(opponent_name)}
            className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded"
          >
            Opponent Won
          </button>
          <button
            onClick={() => actions.battleSubmitResult('draw')}
            className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded"
          >
            Draw
          </button>
        </div>
      </div>
    </div>
  )
}
