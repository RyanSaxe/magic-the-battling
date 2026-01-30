import { useState } from 'react'
import type { GameState, Card as CardType, ZoneName, CardStateAction } from '../../types'
import { DraggableCard, DroppableZone } from '../../dnd'
import { HandZone, BattlefieldZone } from '../../components/zones'
import { Card, CardBack, CardActionMenu } from '../../components/card'

interface ContextMenuState {
  card: CardType
  zone: ZoneName
  position: { x: number; y: number }
  isOpponent?: boolean
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

  const opponentPlayer = gameState.players.find((p) => p.name === opponent_name)
  const canManipulateOpponent = opponentPlayer?.is_bot || opponentPlayer?.is_ghost || false

  const tappedCardIds = new Set(your_zones.tapped_card_ids || [])
  const faceDownCardIds = new Set(your_zones.face_down_card_ids || [])
  const counters = your_zones.counters || {}
  const attachments = your_zones.attachments || {}

  const opponentTappedIds = new Set(opponent_zones.tapped_card_ids || [])
  const opponentFaceDownIds = new Set(opponent_zones.face_down_card_ids || [])
  const opponentCounters = opponent_zones.counters || {}

  const upgradedCardIds = new Set(
    your_zones.upgrades.filter((u) => u.upgrade_target).map((u) => u.upgrade_target!.id)
  )
  const opponentUpgradedCardIds = new Set(
    opponent_zones.upgrades.filter((u) => u.upgrade_target).map((u) => u.upgrade_target!.id)
  )

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

  const handleOpponentCardDoubleClick = (card: CardType) => {
    const isTapped = opponentTappedIds.has(card.id)
    actions.battleUpdateCardState(isTapped ? 'untap' : 'tap', card.id)
  }

  const handleOpponentContextMenu = (e: React.MouseEvent, card: CardType, zone: ZoneName) => {
    e.preventDefault()
    setContextMenu({ card, zone, position: { x: e.clientX, y: e.clientY }, isOpponent: true })
  }

  const isCardAttached = (cardId: string): boolean => {
    return Object.values(attachments).some(children => children.includes(cardId))
  }

  const isOpponentCardAttached = (cardId: string): boolean => {
    const opponentAttachments = opponent_zones.attachments || {}
    return Object.values(opponentAttachments).some(children => children.includes(cardId))
  }

  return (
    <div className="flex flex-col h-full gap-2">
        {/* Sudden Death Banner */}
        {current_battle.is_sudden_death && (
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
              Fight to survive - loser is eliminated!
            </div>
          </div>
        )}

        {/* Opponent's hand - always visible */}
        <div className="relative px-4 py-3" style={{ background: 'rgba(34, 84, 61, 0.4)' }}>
          {canManipulateOpponent ? (
            <DroppableZone
              zone="hand"
              zoneOwner="opponent"
              validFromZones={['battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
              className="flex justify-center gap-1 flex-wrap min-h-[120px] w-full"
            >
              {opponent_hand_revealed
                ? opponent_zones.hand.map((card) => (
                    <DraggableCard key={card.id} card={card} zone="hand" zoneOwner="opponent" size="sm" isOpponent upgraded={opponentUpgradedCardIds.has(card.id)} />
                  ))
                : Array.from({ length: opponent_hand_count }).map((_, i) => (
                    <CardBack key={i} size="sm" />
                  ))}
            </DroppableZone>
          ) : (
            <div className="flex justify-center gap-1 flex-wrap min-h-[120px]">
              {opponent_hand_revealed
                ? opponent_zones.hand.map((card) => (
                    <Card key={card.id} card={card} size="sm" upgraded={opponentUpgradedCardIds.has(card.id)} />
                  ))
                : Array.from({ length: opponent_hand_count }).map((_, i) => (
                    <CardBack key={i} size="sm" />
                  ))}
            </div>
          )}
        </div>

        {/* Battlefields */}
        <div className="flex-1 flex flex-col">
          {/* Opponent's battlefield */}
          <div className="relative flex-1 battlefield opacity-80">
            <BattlefieldZone
              cards={opponent_zones.battlefield}
              selectedCardId={selectedCard?.card.id}
              onCardClick={(card) => handleCardClick(card, 'battlefield')}
              onCardDoubleClick={canManipulateOpponent ? handleOpponentCardDoubleClick : undefined}
              onCardContextMenu={canManipulateOpponent ? (e, card) => handleOpponentContextMenu(e, card, 'battlefield') : undefined}
              tappedCardIds={opponentTappedIds}
              faceDownCardIds={opponentFaceDownIds}
              counters={opponentCounters}
              attachments={opponent_zones.attachments || {}}
              separateLands
              isOpponent
              canManipulateOpponent={canManipulateOpponent}
              upgradedCardIds={opponentUpgradedCardIds}
            />
          </div>

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
              separateLands
              upgradedCardIds={upgradedCardIds}
            />
          </div>
        </div>

        {/* Your hand */}
        <HandZone
          cards={your_zones.hand}
          selectedCardId={selectedCard?.card.id}
          onCardClick={(card) => handleCardClick(card, 'hand')}
          upgradedCardIds={upgradedCardIds}
        />

        {/* Context menu */}
        {contextMenu && (
          <CardActionMenu
            card={contextMenu.card}
            position={contextMenu.position}
            zone={contextMenu.zone}
            isTapped={contextMenu.isOpponent ? opponentTappedIds.has(contextMenu.card.id) : tappedCardIds.has(contextMenu.card.id)}
            isFlipped={false}
            isFaceDown={contextMenu.isOpponent ? opponentFaceDownIds.has(contextMenu.card.id) : faceDownCardIds.has(contextMenu.card.id)}
            counters={contextMenu.isOpponent ? opponentCounters[contextMenu.card.id] || {} : counters[contextMenu.card.id] || {}}
            isAttached={contextMenu.isOpponent ? isOpponentCardAttached(contextMenu.card.id) : isCardAttached(contextMenu.card.id)}
            battlefieldCards={contextMenu.isOpponent ? opponent_zones.battlefield : your_zones.battlefield}
            onAction={handleContextMenuAction}
            onMove={handleContextMenuMove}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
  )
}
