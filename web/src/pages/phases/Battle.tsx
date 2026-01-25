import { useState } from 'react'
import type { GameState, Card as CardType, ZoneName, CardStateAction } from '../../types'
import { GameDndProvider, useDndActions } from '../../dnd'
import { HandZone, BattlefieldZone } from '../../components/zones'
import { Card, CardBack, CardActionMenu } from '../../components/card'

const isLandOrTreasure = (card: CardType) =>
  card.type_line.toLowerCase().includes('land') ||
  card.type_line.toLowerCase().includes('treasure')

interface ContextMenuState {
  card: CardType
  zone: ZoneName
  position: { x: number; y: number }
}

interface BattlePhaseProps {
  gameState: GameState
  actions: {
    battleMove: (cardId: string, fromZone: ZoneName, toZone: ZoneName) => void
    battleSubmitResult: (result: string) => void
    battleUpdateCardState: (actionType: CardStateAction, cardId: string, data?: Record<string, unknown>) => void
  }
}

export function BattlePhase({ gameState, actions }: BattlePhaseProps) {
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    zone: ZoneName
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [isChangingResult, setIsChangingResult] = useState(false)

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

  const tappedCardIds = new Set(your_zones.tapped_card_ids || [])
  const faceDownCardIds = new Set(your_zones.face_down_card_ids || [])
  const counters = your_zones.counters || {}
  const attachments = your_zones.attachments || {}

  const opponentTappedIds = new Set(opponent_zones.tapped_card_ids || [])
  const opponentFaceDownIds = new Set(opponent_zones.face_down_card_ids || [])
  const opponentCounters = opponent_zones.counters || {}

  const opponentLands = opponent_zones.battlefield.filter(isLandOrTreasure)
  const opponentPermanents = opponent_zones.battlefield.filter((c) => !isLandOrTreasure(c))

  const handleCardClick = (card: CardType, zone: ZoneName) => {
    if (selectedCard?.card.id === card.id) {
      setSelectedCard(null)
    } else {
      setSelectedCard({ card, zone })
    }
  }

  const handleCardDoubleClick = (card: CardType) => {
    const isTapped = tappedCardIds.has(card.id)
    actions.battleUpdateCardState(isTapped ? 'untap' : 'tap', card.id)
  }

  const handleContextMenu = (e: React.MouseEvent, card: CardType, zone: ZoneName) => {
    e.preventDefault()
    setContextMenu({
      card,
      zone,
      position: { x: e.clientX, y: e.clientY },
    })
  }

  const handleContextMenuAction = (action: CardStateAction, data?: Record<string, unknown>) => {
    if (!contextMenu) return
    actions.battleUpdateCardState(action, contextMenu.card.id, data)
  }

  const handleContextMenuMove = (toZone: ZoneName) => {
    if (!contextMenu) return
    actions.battleMove(contextMenu.card.id, contextMenu.zone, toZone)
  }

  const isCardAttached = (cardId: string): boolean => {
    return Object.values(attachments).some(children => children.includes(cardId))
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
            <div className="flex justify-center gap-1 overflow-x-auto">
              {Array.from({ length: opponent_hand_count }).map((_, i) => (
                <CardBack key={i} size="sm" />
              ))}
            </div>
          </div>
        )}

        {/* Battlefields */}
        <div className="flex-1 flex flex-col">
          {/* Opponent's battlefield */}
          <div className="relative flex-1 battlefield opacity-80">
            <div className="absolute top-2 left-2 text-xs text-gray-400 uppercase tracking-wide">
              {opponent_name}
            </div>
            <div className="flex flex-col gap-2 p-4 pt-8 min-h-[150px]">
              {/* Opponent's permanents (non-lands) */}
              <div className="flex justify-center flex-wrap gap-2">
                {opponentPermanents.length === 0 && opponentLands.length === 0 ? (
                  <div className="text-gray-500 text-sm">Empty battlefield</div>
                ) : (
                  opponentPermanents.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      size="sm"
                      tapped={opponentTappedIds.has(card.id)}
                      faceDown={opponentFaceDownIds.has(card.id)}
                      counters={opponentCounters[card.id]}
                    />
                  ))
                )}
              </div>
              {/* Opponent's lands */}
              {opponentLands.length > 0 && (
                <div className="flex justify-center flex-wrap gap-1 pt-2 border-t border-gray-700/50">
                  {opponentLands.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      size="sm"
                      tapped={opponentTappedIds.has(card.id)}
                      faceDown={opponentFaceDownIds.has(card.id)}
                      counters={opponentCounters[card.id]}
                    />
                  ))}
                </div>
              )}
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
              onCardContextMenu={(e, card) => handleContextMenu(e, card, 'battlefield')}
              tappedCardIds={tappedCardIds}
              faceDownCardIds={faceDownCardIds}
              counters={counters}
              attachments={attachments}
              label="Your Battlefield"
              separateLands
            />
          </div>
        </div>

        {/* Your hand */}
        <HandZone
          cards={your_zones.hand}
          selectedCardId={selectedCard?.card.id}
          onCardClick={(card) => handleCardClick(card, 'hand')}
        />

        {/* Context menu */}
        {contextMenu && (
          <CardActionMenu
            card={contextMenu.card}
            position={contextMenu.position}
            zone={contextMenu.zone}
            isTapped={tappedCardIds.has(contextMenu.card.id)}
            isFlipped={false}
            isFaceDown={faceDownCardIds.has(contextMenu.card.id)}
            counters={counters[contextMenu.card.id] || {}}
            isAttached={isCardAttached(contextMenu.card.id)}
            battlefieldCards={your_zones.battlefield}
            onAction={handleContextMenuAction}
            onMove={handleContextMenuMove}
            onClose={() => setContextMenu(null)}
          />
        )}

        {/* Result submission */}
        <div className="px-4 pb-4">
          {mySubmission && !isChangingResult ? (
            <div className="text-center">
              {opponentSubmission && mySubmission !== opponentSubmission ? (
                <div className="mb-3">
                  <div className="text-red-400 mb-2">
                    Results don't match!
                  </div>
                  <div className="text-sm text-gray-400">
                    You: <span className="text-white">{mySubmission === self_player.name ? 'I Won' : mySubmission === 'draw' ? 'Draw' : 'Opponent Won'}</span>
                    <span className="mx-2">vs</span>
                    Opponent: <span className="text-white">{opponentSubmission === opponent_name ? 'I Won' : opponentSubmission === 'draw' ? 'Draw' : 'Opponent Won'}</span>
                  </div>
                  <button
                    onClick={() => setIsChangingResult(true)}
                    className="btn btn-secondary mt-3"
                  >
                    Change Your Selection
                  </button>
                </div>
              ) : (
                <div className="bg-black/40 rounded-lg p-4">
                  <div className="text-amber-400 mb-2">
                    Waiting for opponent...
                  </div>
                  <div className="text-sm text-gray-400 mb-3">
                    You reported: <span className="text-white">
                      {mySubmission === self_player.name ? 'I Won' : mySubmission === 'draw' ? 'Draw' : 'Opponent Won'}
                    </span>
                  </div>
                  <button
                    onClick={() => setIsChangingResult(true)}
                    className="btn btn-secondary"
                  >
                    Change Selection
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              {isChangingResult && (
                <div className="text-center mb-3">
                  <button
                    onClick={() => setIsChangingResult(false)}
                    className="text-gray-400 text-sm hover:text-white"
                  >
                    ← Cancel change
                  </button>
                </div>
              )}
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => {
                    actions.battleSubmitResult(self_player.name)
                    setIsChangingResult(false)
                  }}
                  className="btn btn-primary"
                >
                  I Won
                </button>
                <button
                  onClick={() => {
                    actions.battleSubmitResult('draw')
                    setIsChangingResult(false)
                  }}
                  className="btn btn-secondary"
                >
                  Draw
                </button>
                <button
                  onClick={() => {
                    actions.battleSubmitResult(opponent_name)
                    setIsChangingResult(false)
                  }}
                  className="btn btn-danger"
                >
                  Opponent Won
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </GameDndProvider>
  )
}
