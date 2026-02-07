import { useState } from 'react'
import type { GameState, Card as CardType, ZoneName, CardStateAction } from '../../types'
import { DraggableCard, DroppableZone, type ZoneOwner } from '../../dnd'
import { HandZone, BattlefieldZone } from '../../components/zones'
import { Card, CardBack, CardActionMenu } from '../../components/card'
import { useViewportCardSizes } from '../../hooks/useViewportCardSizes'

interface ContextMenuState {
  card: CardType
  zone: ZoneName
  position: { x: number; y: number }
  isOpponent?: boolean
}

interface BattlePhaseProps {
  gameState: GameState
  actions: {
    battleMove: (cardId: string, fromZone: ZoneName, toZone: ZoneName, fromOwner: ZoneOwner, toOwner: ZoneOwner) => void
    battleSubmitResult: (result: string) => void
    battleUpdateCardState: (actionType: CardStateAction, cardId: string, data?: Record<string, unknown>) => void
    battleChoosePlayDraw: (choice: 'play' | 'draw') => void
  }
  sideboardCount?: number
  onShowSideboard?: () => void
  opponentSideboardCount?: number
  onShowOpponentSideboard?: () => void
}

function PlayDrawModal({ onChoose }: { onChoose: (choice: 'play' | 'draw') => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-lg p-6 max-w-sm border border-gray-700">
        <h2 className="text-xl text-white mb-4 text-center">You Won the Coin Flip!</h2>
        <p className="text-gray-300 mb-6 text-center">
          Choose to go first (play) or second (draw).
        </p>
        <div className="flex gap-3">
          <button
            className="flex-1 px-4 py-2 rounded bg-green-600 hover:bg-green-500 text-white font-medium"
            onClick={() => onChoose('play')}
          >
            Play First
          </button>
          <button
            className="flex-1 px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium"
            onClick={() => onChoose('draw')}
          >
            Draw First
          </button>
        </div>
      </div>
    </div>
  )
}

function WaitingForChoiceScreen({ coinFlipWinner }: { coinFlipWinner: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-xl text-white mb-4">Waiting for Choice</div>
        <p className="text-gray-400">{coinFlipWinner} is choosing play or draw...</p>
      </div>
    </div>
  )
}

export function BattlePhase({
  gameState,
  actions,
  sideboardCount = 0,
  onShowSideboard,
  opponentSideboardCount = 0,
  onShowOpponentSideboard,
}: BattlePhaseProps) {
  const sizes = useViewportCardSizes()
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    zone: ZoneName
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const { current_battle } = gameState
  const playerName = gameState.self_player.name

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

  const needsChoice = current_battle.on_the_play_name === null &&
                      current_battle.coin_flip_name === playerName

  if (needsChoice) {
    return <PlayDrawModal onChoose={actions.battleChoosePlayDraw} />
  }

  if (current_battle.on_the_play_name === null) {
    return <WaitingForChoiceScreen coinFlipWinner={current_battle.coin_flip_name} />
  }

  const { your_zones, opponent_zones, opponent_hand_count, opponent_hand_revealed } = current_battle

  const canManipulateOpponent = true

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

  const handleContextMenuMove = (toZone: ZoneName, toOwner?: ZoneOwner) => {
    if (!contextMenu) return
    const fromOwner: ZoneOwner = contextMenu.isOpponent ? 'opponent' : 'player'
    const resolvedToOwner = toOwner ?? fromOwner
    actions.battleMove(contextMenu.card.id, contextMenu.zone, toZone, fromOwner, resolvedToOwner)
  }

  const handleOpponentCardDoubleClick = (card: CardType) => {
    const isTapped = opponentTappedIds.has(card.id)
    actions.battleUpdateCardState(isTapped ? 'untap' : 'tap', card.id)
  }

  const handleOpponentContextMenu = (e: React.MouseEvent, card: CardType, zone: ZoneName) => {
    e.preventDefault()
    setContextMenu({ card, zone, position: { x: e.clientX, y: e.clientY }, isOpponent: true })
  }

  const battlefieldIds = new Set(your_zones.battlefield.map((c) => c.id))
  const handleUntapAll = () => {
    for (const cardId of your_zones.tapped_card_ids || []) {
      if (battlefieldIds.has(cardId)) {
        actions.battleUpdateCardState('untap', cardId)
      }
    }
  }

  const opponentBattlefieldIds = new Set(opponent_zones.battlefield.map((c) => c.id))
  const handleOpponentUntapAll = () => {
    for (const cardId of opponent_zones.tapped_card_ids || []) {
      if (opponentBattlefieldIds.has(cardId)) {
        actions.battleUpdateCardState('untap', cardId)
      }
    }
  }

  const isCardAttached = (cardId: string): boolean => {
    return Object.values(attachments).some(children => children.includes(cardId))
  }

  const isOpponentCardAttached = (cardId: string): boolean => {
    const opponentAttachments = opponent_zones.attachments || {}
    return Object.values(opponentAttachments).some(children => children.includes(cardId))
  }

  const HAND_ZONE_PADDING = 16
  const handMinHeight = sizes.hand.height + HAND_ZONE_PADDING
  const opponentHandMinHeight = sizes.opponentHand.height + HAND_ZONE_PADDING

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
        <div className="relative px-2 py-2 shrink-0" style={{ background: 'rgba(34, 84, 61, 0.4)', minHeight: opponentHandMinHeight }}>
          {canManipulateOpponent ? (
            <DroppableZone
              zone="hand"
              zoneOwner="opponent"
              validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
              className="flex justify-center gap-1 flex-wrap w-full"
            >
              {opponent_hand_revealed
                ? opponent_zones.hand.map((card) => (
                    <DraggableCard key={card.id} card={card} zone="hand" zoneOwner="opponent" dimensions={sizes.opponentHand} isOpponent upgraded={opponentUpgradedCardIds.has(card.id)} />
                  ))
                : Array.from({ length: opponent_hand_count }).map((_, i) => (
                    <CardBack key={i} dimensions={sizes.opponentHand} />
                  ))}
            </DroppableZone>
          ) : (
            <div className="flex justify-center gap-1 flex-wrap">
              {opponent_hand_revealed
                ? opponent_zones.hand.map((card) => (
                    <Card key={card.id} card={card} dimensions={sizes.opponentHand} upgraded={opponentUpgradedCardIds.has(card.id)} />
                  ))
                : Array.from({ length: opponent_hand_count }).map((_, i) => (
                    <CardBack key={i} dimensions={sizes.opponentHand} />
                  ))}
            </div>
          )}
          {opponentSideboardCount > 0 && onShowOpponentSideboard && (
            <button
              onClick={onShowOpponentSideboard}
              className="absolute bottom-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300"
            >
              Sideboard ({opponentSideboardCount})
            </button>
          )}
        </div>

        {/* Battlefields */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Opponent's battlefield */}
          <div className="relative flex-1 battlefield opacity-80 min-h-0 overflow-hidden">
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
              cardDimensions={sizes.battlefield}
            />
            {opponentSideboardCount > 0 && (
              <button
                onClick={handleOpponentUntapAll}
                className="absolute top-2 right-2 text-xs bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-gray-300"
              >
                Untap All
              </button>
            )}
          </div>

          {/* Your battlefield */}
          <div className="relative flex-1 min-h-0 overflow-hidden">
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
              cardDimensions={sizes.battlefield}
            />
            <button
              onClick={handleUntapAll}
              className="absolute bottom-2 right-2 text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-white"
            >
              Untap All
            </button>
          </div>
        </div>

        {/* Your hand */}
        <div className="relative shrink-0" style={{ minHeight: handMinHeight, background: 'rgba(34, 84, 61, 0.4)' }}>
          <HandZone
            cards={your_zones.hand}
            selectedCardId={selectedCard?.card.id}
            onCardClick={(card) => handleCardClick(card, 'hand')}
            upgradedCardIds={upgradedCardIds}
            cardDimensions={sizes.hand}
          />
          {sideboardCount > 0 && onShowSideboard && (
            <button
              onClick={onShowSideboard}
              className="absolute top-2 right-2 text-xs bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded text-white"
            >
              Sideboard ({sideboardCount})
            </button>
          )}
        </div>

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
            isOpponent={contextMenu.isOpponent}
            onAction={handleContextMenuAction}
            onMove={handleContextMenuMove}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
  )
}
