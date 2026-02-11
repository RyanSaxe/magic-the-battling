import { useState } from 'react'
import type { GameState, Card as CardType, ZoneName, CardStateAction } from '../../types'
import { DraggableCard, DroppableZone, type ZoneOwner } from '../../dnd'
import { HandZone, BattlefieldZone, BattlefieldZoneColumn } from '../../components/zones'
import { CompactZoneDisplay } from '../../components/zones/CompactZoneDisplay'
import { Card, CardBack, CardActionMenu } from '../../components/card'
import { useBattleCardSizes } from '../../hooks/useBattleCardSizes'

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
  }
  isMobile?: boolean
  sideboardCount?: number
  onShowSideboard?: () => void
  opponentSideboardCount?: number
  onShowOpponentSideboard?: () => void
}

const isLandOrTreasure = (card: CardType) =>
  card.type_line.toLowerCase().includes("land") ||
  card.type_line.toLowerCase().includes("treasure")

function countTopLevel(cards: CardType[], attachments: Record<string, string[]>, predicate: (c: CardType) => boolean): number {
  const attachedIds = new Set(Object.values(attachments).flat())
  return cards.filter((c) => !attachedIds.has(c.id) && predicate(c)).length
}

export function BattlePhase({
  gameState,
  actions,
  isMobile = false,
  sideboardCount = 0,
  onShowSideboard,
  opponentSideboardCount = 0,
  onShowOpponentSideboard,
}: BattlePhaseProps) {
  const [selectedCard, setSelectedCard] = useState<{
    card: CardType
    zone: ZoneName
  } | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const { current_battle } = gameState

  const battle = current_battle
  const yourZones = battle?.your_zones
  const oppZones = battle?.opponent_zones

  const playerHandCount = yourZones?.hand.length ?? 0
  const opponentHandCount = battle?.opponent_hand_count ?? 0
  const playerAttachments = yourZones?.attachments ?? {}
  const opponentAttachments = oppZones?.attachments ?? {}
  const playerBf = yourZones?.battlefield ?? []
  const opponentBf = oppZones?.battlefield ?? []

  const playerLandCount = countTopLevel(playerBf, playerAttachments, isLandOrTreasure)
  const playerNonlandCount = countTopLevel(playerBf, playerAttachments, (c) => !isLandOrTreasure(c))
  const opponentLandCount = countTopLevel(opponentBf, opponentAttachments, isLandOrTreasure)
  const opponentNonlandCount = countTopLevel(opponentBf, opponentAttachments, (c) => !isLandOrTreasure(c))

  const HAND_PADDING = 16
  const BF_PADDING = 20
  const suddenDeathHeight = battle?.is_sudden_death ? 70 : 0
  const fixedHeight = (2 * HAND_PADDING) + (2 * BF_PADDING) + suddenDeathHeight
  const zoneColumnWidth = isMobile ? 64 : 96

  const [containerRef, sizes] = useBattleCardSizes({
    playerHandCount,
    opponentHandCount,
    playerLandCount,
    playerNonlandCount,
    opponentLandCount,
    opponentNonlandCount,
    fixedHeight,
    zoneColumnWidth,
  })

  if (!battle) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-white mb-4">Waiting for Battle</div>
          <p className="text-gray-400">Waiting for opponent to finish building...</p>
        </div>
      </div>
    )
  }

  const { your_zones, opponent_zones, opponent_hand_count: oppHandCount, opponent_hand_revealed } = battle

  const canManipulateOpponent = true

  const tappedCardIds = new Set(your_zones.tapped_card_ids || [])
  const faceDownCardIds = new Set(your_zones.face_down_card_ids || [])
  const counters = your_zones.counters || {}
  const attachments = your_zones.attachments || {}

  const opponentTappedIds = new Set(opponent_zones.tapped_card_ids || [])
  const opponentFaceDownIds = new Set(opponent_zones.face_down_card_ids || [])
  const opponentCounters = opponent_zones.counters || {}

  const playerAppliedUpgrades = your_zones.upgrades.filter((u) => u.upgrade_target)
  const opponentAppliedUpgrades = opponent_zones.upgrades.filter((u) => u.upgrade_target)

  const upgradedCardIds = new Set(playerAppliedUpgrades.map((u) => u.upgrade_target!.id))
  const opponentUpgradedCardIds = new Set(opponentAppliedUpgrades.map((u) => u.upgrade_target!.id))

  const upgradesByCardId = new Map<string, CardType[]>()
  for (const u of playerAppliedUpgrades) {
    const id = u.upgrade_target!.id
    const existing = upgradesByCardId.get(id) ?? []
    existing.push(u)
    upgradesByCardId.set(id, existing)
  }
  const opponentUpgradesByCardId = new Map<string, CardType[]>()
  for (const u of opponentAppliedUpgrades) {
    const id = u.upgrade_target!.id
    const existing = opponentUpgradesByCardId.get(id) ?? []
    existing.push(u)
    opponentUpgradesByCardId.set(id, existing)
  }

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
    const opAttachments = opponent_zones.attachments || {}
    return Object.values(opAttachments).some(children => children.includes(cardId))
  }

  const { rowHeight } = sizes
  const handHeight = rowHeight + HAND_PADDING
  const bfHeight = 2 * rowHeight + BF_PADDING

  return (
    <div ref={containerRef} className="flex flex-col h-full">
        {/* Sudden Death Banner */}
        {battle.is_sudden_death && (
          <div className="bg-red-900/80 border-b-2 border-red-500 px-4 py-3 text-center shrink-0">
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

        {/* Opponent's hand */}
        <div className="flex shrink-0 overflow-hidden" style={{ height: handHeight, background: 'rgba(34, 84, 61, 0.4)' }}>
          <div className="relative flex-1 min-w-0 px-2">
            {canManipulateOpponent ? (
              <DroppableZone
                zone="hand"
                zoneOwner="opponent"
                validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
                className="flex items-center justify-center gap-1.5 flex-nowrap w-full h-full"
              >
                {opponent_hand_revealed
                  ? opponent_zones.hand.map((card) => (
                      <DraggableCard key={card.id} card={card} zone="hand" zoneOwner="opponent" dimensions={sizes.opponentHand} isOpponent upgraded={opponentUpgradedCardIds.has(card.id)} appliedUpgrades={opponentUpgradesByCardId.get(card.id)} />
                    ))
                  : Array.from({ length: oppHandCount }).map((_, i) => (
                      <CardBack key={i} dimensions={sizes.opponentHand} />
                    ))}
              </DroppableZone>
            ) : (
              <div className="flex items-center justify-center gap-1.5 flex-nowrap h-full">
                {opponent_hand_revealed
                  ? opponent_zones.hand.map((card) => (
                      <Card key={card.id} card={card} dimensions={sizes.opponentHand} upgraded={opponentUpgradedCardIds.has(card.id)} appliedUpgrades={opponentUpgradesByCardId.get(card.id)} />
                    ))
                  : Array.from({ length: oppHandCount }).map((_, i) => (
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
          <CompactZoneDisplay
            title="Comp"
            zone="command_zone"
            cards={opponent_zones.command_zone}
            height={handHeight}
            width={zoneColumnWidth}
            isOpponent
            canManipulateOpponent={canManipulateOpponent}
            validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
          />
        </div>

        {/* Opponent's battlefield */}
        <div className="flex shrink-0 battlefield opacity-80 overflow-hidden" style={{ height: bfHeight }}>
          <div className="relative flex-1 min-w-0">
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
              upgradesByCardId={opponentUpgradesByCardId}
              cardDimensions={sizes.opponentNonlands}
              rowHeight={rowHeight}
              landCardDimensions={sizes.opponentLands}
              nonlandCardDimensions={sizes.opponentNonlands}
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
          <BattlefieldZoneColumn
            zones={opponent_zones}
            isOpponent
            canManipulateOpponent={canManipulateOpponent}
            rowHeight={rowHeight}
            columnWidth={zoneColumnWidth}
          />
        </div>

        {/* Your battlefield */}
        <div className="flex shrink-0 overflow-hidden" style={{ height: bfHeight }}>
          <div className="relative flex-1 min-w-0">
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
              upgradesByCardId={upgradesByCardId}
              cardDimensions={sizes.playerNonlands}
              rowHeight={rowHeight}
              landCardDimensions={sizes.playerLands}
              nonlandCardDimensions={sizes.playerNonlands}
            />
            <button
              onClick={handleUntapAll}
              className="absolute bottom-2 right-2 text-xs bg-blue-600 hover:bg-blue-500 px-2 py-1 rounded text-white"
            >
              Untap All
            </button>
          </div>
          <BattlefieldZoneColumn
            zones={your_zones}
            rowHeight={rowHeight}
            columnWidth={zoneColumnWidth}
          />
        </div>

        {/* Your hand */}
        <div className="flex shrink-0 overflow-hidden" style={{ height: handHeight, background: 'rgba(34, 84, 61, 0.4)' }}>
          <div className="relative flex-1 min-w-0">
            <HandZone
              cards={your_zones.hand}
              selectedCardId={selectedCard?.card.id}
              onCardClick={(card) => handleCardClick(card, 'hand')}
              upgradedCardIds={upgradedCardIds}
              upgradesByCardId={upgradesByCardId}
              cardDimensions={sizes.playerHand}
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
          <CompactZoneDisplay
            title="Comp"
            zone="command_zone"
            cards={your_zones.command_zone}
            height={handHeight}
            width={zoneColumnWidth}
            validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
          />
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
