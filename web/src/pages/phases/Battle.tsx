import { useState } from 'react'
import type { GameState, Card as CardType, ZoneName, CardStateAction } from '../../types'
import { DraggableCard } from '../../dnd'
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
  const [showSideboard, setShowSideboard] = useState(false)
  const [showOpponentSideboard, setShowOpponentSideboard] = useState(false)
  const [showOpponentFullSideboard, setShowOpponentFullSideboard] = useState(false)

  const { current_battle } = gameState

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

  const { your_zones, opponent_zones, opponent_name, opponent_hand_count, opponent_hand_revealed } = current_battle
  const sideboard = gameState.self_player.sideboard

  const opponentPlayer = gameState.players.find((p) => p.name === opponent_name)
  const canManipulateOpponent = opponentPlayer?.is_bot || opponentPlayer?.is_ghost || false
  const opponentFullSideboard = opponentPlayer?.full_sideboard || []
  const showFullSideboardButton = canManipulateOpponent && opponentFullSideboard.length > 0

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

  return (
    <div className="flex flex-col h-full gap-2">
        {/* Sudden Death Banner */}
        {current_battle.is_sudden_death && (
          <div className="bg-red-900/80 border-b-2 border-red-500 px-4 py-3 text-center">
            <div className="text-red-100 font-bold text-lg tracking-wider uppercase animate-pulse">
              Sudden Death
            </div>
            <div className="text-red-200/80 text-xs mt-1">
              Fight to survive - loser is eliminated!
            </div>
          </div>
        )}

        {/* Opponent's hand */}
        {opponent_hand_count > 0 && (
          <div className="px-4 py-2 bg-black/30">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-2">
              <span className="truncate max-w-[120px] inline-block align-bottom">{opponent_name}</span>'s Hand ({opponent_hand_count})
              {opponent_hand_revealed && <span className="text-amber-400 ml-2">(Revealed)</span>}
            </div>
            <div className="flex justify-center gap-1 overflow-x-auto">
              {opponent_hand_revealed
                ? opponent_zones.hand.map((card) => (
                    <Card key={card.id} card={card} size="sm" />
                  ))
                : Array.from({ length: opponent_hand_count }).map((_, i) => (
                    <CardBack key={i} size="sm" />
                  ))}
            </div>
          </div>
        )}

        {/* Opponent's revealed sideboard (companions, wish targets - only for bots) */}
        {(opponent_zones.sideboard.length > 0 || showFullSideboardButton) && (
          <div className="px-4 py-2 bg-black/30 border-t border-gray-700/50">
            <div className="flex justify-between items-center mb-2">
              <div className="text-xs text-gray-400 uppercase tracking-wide">
                {opponent_zones.sideboard.length > 0
                  ? <><span className="truncate max-w-[120px] inline-block align-bottom">{opponent_name}</span>'s Revealed Sideboard ({opponent_zones.sideboard.length})</>
                  : <><span className="truncate max-w-[120px] inline-block align-bottom">{opponent_name}</span>'s Sideboard</>}
              </div>
              <div className="flex gap-2">
                {showFullSideboardButton && (
                  opponent_zones.sideboard.length > 0 ? (
                    <button
                      onClick={() => setShowOpponentFullSideboard(true)}
                      className="text-xs px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white animate-pulse"
                    >
                      ⚠️ Sideboard in use - click to view
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowOpponentFullSideboard(true)}
                      className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300"
                    >
                      Full Sideboard ({opponentFullSideboard.length})
                    </button>
                  )
                )}
                {opponent_zones.sideboard.length > 0 && (
                  <button
                    onClick={() => setShowOpponentSideboard(true)}
                    className="text-xs bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded"
                  >
                    Expand Revealed
                  </button>
                )}
              </div>
            </div>
            {opponent_zones.sideboard.length > 0 && (
              <div className="flex justify-center gap-1 overflow-x-auto">
                {opponent_zones.sideboard.map((card) => (
                  <Card key={card.id} card={card} size="sm" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Battlefields */}
        <div className="flex-1 flex flex-col">
          {/* Opponent's battlefield */}
          <div className="relative flex-1 battlefield opacity-80">
            <div className="absolute top-2 left-2 text-xs text-gray-400 uppercase tracking-wide truncate max-w-[150px]">
              {opponent_name}
            </div>
            <div className="flex flex-col gap-2 p-4 pt-8 min-h-[150px]">
              {/* Opponent's lands (at top, always visible) */}
              <div className="flex justify-center flex-wrap gap-1 pb-2 border-b border-gray-700/50 min-h-[50px]">
                {opponentLands.length > 0 ? (
                  opponentLands.map((card) => (
                    <Card
                      key={card.id}
                      card={card}
                      size="sm"
                      tapped={opponentTappedIds.has(card.id)}
                      faceDown={opponentFaceDownIds.has(card.id)}
                      counters={opponentCounters[card.id]}
                    />
                  ))
                ) : (
                  <div className="text-gray-600 text-xs border border-dashed border-gray-700 rounded px-3 py-2">
                    Lands
                  </div>
                )}
              </div>
              {/* Opponent's permanents (non-lands) */}
              <div className="flex justify-center flex-wrap gap-2">
                {opponentPermanents.length === 0 ? (
                  <div className="text-gray-500 text-sm opacity-50">Empty battlefield</div>
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

        {/* Your hand with sideboard toggle */}
        <div className="relative">
          <HandZone
            cards={your_zones.hand}
            selectedCardId={selectedCard?.card.id}
            onCardClick={(card) => handleCardClick(card, 'hand')}
          />
          {sideboard.length > 0 && (
            <button
              onClick={() => setShowSideboard(true)}
              className="absolute top-2 right-4 text-xs bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded"
            >
              Sideboard ({sideboard.length})
            </button>
          )}
        </div>

        {/* Sideboard modal */}
        {showSideboard && (
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
            onClick={() => setShowSideboard(false)}
          >
            <div
              className="bg-gray-900 rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-medium">Your Sideboard ({sideboard.length})</h3>
                <button
                  onClick={() => setShowSideboard(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {sideboard.map((card) => (
                  <DraggableCard key={card.id} card={card} zone="sideboard" size="sm" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Opponent revealed sideboard modal */}
        {showOpponentSideboard && (
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
            onClick={() => setShowOpponentSideboard(false)}
          >
            <div
              className="bg-gray-900 rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-medium">{opponent_name}'s Revealed Sideboard ({opponent_zones.sideboard.length})</h3>
                <button
                  onClick={() => setShowOpponentSideboard(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {opponent_zones.sideboard.map((card) => (
                  <Card key={card.id} card={card} size="sm" />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Opponent full sideboard modal */}
        {showOpponentFullSideboard && (
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
            onClick={() => setShowOpponentFullSideboard(false)}
          >
            <div
              className="bg-gray-900 rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-white font-medium">{opponent_name}'s Full Sideboard ({opponentFullSideboard.length})</h3>
                <button
                  onClick={() => setShowOpponentFullSideboard(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {opponentFullSideboard.map((card) => (
                  <Card key={card.id} card={card} size="sm" />
                ))}
              </div>
            </div>
          </div>
        )}

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
      </div>
  )
}
