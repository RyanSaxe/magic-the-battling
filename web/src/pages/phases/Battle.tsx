import { useState, useCallback, useRef, useEffect } from 'react'
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

export interface BattleSelectedCard {
  card: CardType
  zone: ZoneName
  owner: ZoneOwner
}

interface BattlePhaseProps {
  gameState: GameState
  actions: {
    battleMove: (cardId: string, fromZone: ZoneName, toZone: ZoneName, fromOwner: ZoneOwner, toOwner: ZoneOwner) => void
    battleSubmitResult: (result: string) => void
    battleUpdateCardState: (actionType: CardStateAction, cardId: string, data?: Record<string, unknown>) => void
  }
  isMobile?: boolean
  selectedCard: BattleSelectedCard | null
  onSelectedCardChange: (card: BattleSelectedCard | null) => void
  onCardHover?: (cardId: string, zone: ZoneName) => void
  onOpponentCardHover?: (cardId: string, zone: ZoneName) => void
  onCardHoverEnd?: () => void
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
  selectedCard,
  onSelectedCardChange,
  onCardHover,
  onOpponentCardHover,
  onCardHoverEnd,
}: BattlePhaseProps) {
  const setSelectedCard = onSelectedCardChange

  const selectedCardRef = useRef(selectedCard)
  const actionsRef = useRef(actions)
  useEffect(() => {
    selectedCardRef.current = selectedCard
    actionsRef.current = actions
  })

  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.card')) return

    const sel = selectedCardRef.current
    if (sel) {
      const zoneEl = (e.target as HTMLElement).closest('[data-zone]') as HTMLElement | null
      if (zoneEl) {
        const toZone = zoneEl.dataset.zone as ZoneName
        const toOwner = (zoneEl.dataset.zoneOwner ?? 'player') as ZoneOwner
        if (toZone !== sel.zone || toOwner !== sel.owner) {
          actionsRef.current.battleMove(sel.card.id, sel.zone, toZone, sel.owner, toOwner)
          setSelectedCard(null)
          return
        }
      }
      setSelectedCard(null)
    }
  }, [setSelectedCard])
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

  const yourPoison = battle?.your_poison ?? 0
  const opponentPoison = battle?.opponent_poison ?? 0

  const playerLandCount = countTopLevel(playerBf, playerAttachments, isLandOrTreasure) + 1
  const playerNonlandCount = countTopLevel(playerBf, playerAttachments, (c) => !isLandOrTreasure(c))
  const opponentLandCount = countTopLevel(opponentBf, opponentAttachments, isLandOrTreasure) + 1
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
  const flippedCardIds = new Set(your_zones.flipped_card_ids || [])
  const counters = your_zones.counters || {}
  const attachments = your_zones.attachments || {}

  const opponentTappedIds = new Set(opponent_zones.tapped_card_ids || [])
  const opponentFlippedIds = new Set(opponent_zones.flipped_card_ids || [])
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

  const handleCardClick = (card: CardType, zone: ZoneName, owner: ZoneOwner = 'player') => {
    if (selectedCard?.card.id === card.id) {
      setSelectedCard(null)
    } else {
      setSelectedCard({ card, zone, owner })
    }
  }

  const handleZoneClick = (toZone: ZoneName, toOwner: ZoneOwner) => {
    if (!selectedCard) return
    if (toZone !== selectedCard.zone || toOwner !== selectedCard.owner) {
      actions.battleMove(selectedCard.card.id, selectedCard.zone, toZone, selectedCard.owner, toOwner)
    }
    setSelectedCard(null)
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
    <div ref={containerRef} className="flex flex-col h-full" onClick={handleBackgroundClick}>
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
        <div id="opponent-hand" className="flex shrink-0 overflow-hidden" style={{ height: handHeight, background: 'rgba(34, 84, 61, 0.4)' }}>
          <div className="relative flex-1 min-w-0 px-2">
            {canManipulateOpponent ? (
              <DroppableZone
                zone="hand"
                zoneOwner="opponent"
                validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
                className="hand-zone flex items-center justify-center flex-nowrap w-full h-full"
                style={{ gap: Math.max(0, sizes.opponentHandGap) }}
              >
                {opponent_hand_revealed
                  ? opponent_zones.hand.map((card, i) => {
                      const count = opponent_zones.hand.length
                      const zIndex = sizes.opponentHandGap < 0
                        ? selectedCard?.card.id === card.id ? count + 1 : count - i
                        : undefined
                      return <DraggableCard key={card.id} card={card} zone="hand" zoneOwner="opponent" dimensions={sizes.opponentHand} isOpponent upgraded={opponentUpgradedCardIds.has(card.id)} appliedUpgrades={opponentUpgradesByCardId.get(card.id)} canPeekFaceDown={opponent_hand_revealed} selected={selectedCard?.card.id === card.id} onClick={() => handleCardClick(card, 'hand', 'opponent')} onContextMenu={(e) => handleOpponentContextMenu(e, card, 'hand')} onCardHover={onOpponentCardHover} onCardHoverEnd={onCardHoverEnd} style={{ ...(sizes.opponentHandGap < 0 && i > 0 ? { marginLeft: sizes.opponentHandGap } : undefined), ...(zIndex !== undefined ? { zIndex } : undefined) }} />
                    })
                  : Array.from({ length: oppHandCount }).map((_, i) => (
                      <CardBack key={i} dimensions={sizes.opponentHand} style={{ ...(sizes.opponentHandGap < 0 && i > 0 ? { marginLeft: sizes.opponentHandGap } : undefined), ...(sizes.opponentHandGap < 0 ? { zIndex: oppHandCount - i } : undefined) }} />
                    ))}
              </DroppableZone>
            ) : (
              <div className="hand-zone flex items-center justify-center flex-nowrap h-full" style={{ gap: Math.max(0, sizes.opponentHandGap) }}>
                {opponent_hand_revealed
                  ? opponent_zones.hand.map((card, i) => {
                      const count = opponent_zones.hand.length
                      const zIndex = sizes.opponentHandGap < 0
                        ? count - i
                        : undefined
                      return <Card key={card.id} card={card} dimensions={sizes.opponentHand} upgraded={opponentUpgradedCardIds.has(card.id)} appliedUpgrades={opponentUpgradesByCardId.get(card.id)} style={{ ...(sizes.opponentHandGap < 0 && i > 0 ? { marginLeft: sizes.opponentHandGap } : undefined), ...(zIndex !== undefined ? { zIndex } : undefined) }} />
                    })
                  : Array.from({ length: oppHandCount }).map((_, i) => (
                      <CardBack key={i} dimensions={sizes.opponentHand} style={{ ...(sizes.opponentHandGap < 0 && i > 0 ? { marginLeft: sizes.opponentHandGap } : undefined), ...(sizes.opponentHandGap < 0 ? { zIndex: oppHandCount - i } : undefined) }} />
                    ))}
              </div>
            )}
          </div>
          <CompactZoneDisplay
            title="Companion"
            zone="command_zone"
            cards={opponent_zones.command_zone}
            height={handHeight}
            width={zoneColumnWidth}
            isOpponent
            canManipulateOpponent={canManipulateOpponent}
            validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
            onCardHover={onOpponentCardHover}
            onCardHoverEnd={onCardHoverEnd}
            canPeekFaceDown={opponent_hand_revealed}
            selectedCardId={selectedCard?.card.id}
            onZoneClick={() => handleZoneClick('command_zone', 'opponent')}
            onCardClick={handleCardClick}
          />
        </div>

        {/* Opponent's battlefield */}
        <div className="flex shrink-0 battlefield overflow-hidden" style={{ height: bfHeight }}>
          <div className="relative flex-1 min-w-0">
            <BattlefieldZone
              cards={opponent_zones.battlefield}
              selectedCardId={selectedCard?.card.id}
              onCardClick={(card) => handleCardClick(card, 'battlefield', 'opponent')}
              onCardDoubleClick={canManipulateOpponent ? handleOpponentCardDoubleClick : undefined}
              onCardContextMenu={canManipulateOpponent ? (e, card) => handleOpponentContextMenu(e, card, 'battlefield') : undefined}
              onCardHover={onOpponentCardHover}
              onCardHoverEnd={onCardHoverEnd}
              tappedCardIds={opponentTappedIds}
              flippedCardIds={opponentFlippedIds}
              counters={opponentCounters}
              attachments={opponent_zones.attachments || {}}
              separateLands
              isOpponent
              canManipulateOpponent={canManipulateOpponent}
              upgradedCardIds={opponentUpgradedCardIds}
              upgradesByCardId={opponentUpgradesByCardId}
              poisonCount={opponentPoison}
              cardDimensions={sizes.opponentNonlands}
              rowHeight={rowHeight}
              landCardDimensions={sizes.opponentLands}
              nonlandCardDimensions={sizes.opponentNonlands}
              canPeekFaceDown={opponent_hand_revealed}
            />
          </div>
          <BattlefieldZoneColumn
            zones={opponent_zones}
            isOpponent
            canManipulateOpponent={canManipulateOpponent}
            rowHeight={rowHeight}
            columnWidth={zoneColumnWidth}
            onCardHover={onOpponentCardHover}
            onCardHoverEnd={onCardHoverEnd}
            canPeekFaceDown={opponent_hand_revealed}
            selectedCardId={selectedCard?.card.id}
            onZoneClick={handleZoneClick}
            onCardClick={handleCardClick}
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
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              tappedCardIds={tappedCardIds}
              flippedCardIds={flippedCardIds}
              counters={counters}
              attachments={attachments}
              separateLands
              upgradedCardIds={upgradedCardIds}
              upgradesByCardId={upgradesByCardId}
              poisonCount={yourPoison}
              cardDimensions={sizes.playerNonlands}
              rowHeight={rowHeight}
              landCardDimensions={sizes.playerLands}
              nonlandCardDimensions={sizes.playerNonlands}
            />
          </div>
          <BattlefieldZoneColumn
            zones={your_zones}
            rowHeight={rowHeight}
            columnWidth={zoneColumnWidth}
            onCardHover={onCardHover}
            onCardHoverEnd={onCardHoverEnd}
            selectedCardId={selectedCard?.card.id}
            onZoneClick={handleZoneClick}
            onCardClick={handleCardClick}
          />
        </div>

        {/* Your hand */}
        <div className="flex shrink-0 overflow-hidden" style={{ height: handHeight, background: 'rgba(34, 84, 61, 0.4)' }}>
          <div className="relative flex-1 min-w-0">
            <HandZone
              cards={your_zones.hand}
              selectedCardId={selectedCard?.card.id}
              onCardClick={(card) => handleCardClick(card, 'hand')}
              onCardContextMenu={(e, card) => handleContextMenu(e, card, 'hand')}
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              upgradedCardIds={upgradedCardIds}
              upgradesByCardId={upgradesByCardId}
              cardDimensions={sizes.playerHand}
              gap={sizes.playerHandGap}
            />
          </div>
          <CompactZoneDisplay
            title="Companion"
            zone="command_zone"
            cards={your_zones.command_zone}
            height={handHeight}
            width={zoneColumnWidth}
            validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone']}
            onCardHover={onCardHover}
            onCardHoverEnd={onCardHoverEnd}
            selectedCardId={selectedCard?.card.id}
            onZoneClick={() => handleZoneClick('command_zone', 'player')}
            onCardClick={handleCardClick}
          />
        </div>

        {/* Context menu */}
        {contextMenu && (
          <CardActionMenu
            card={contextMenu.card}
            position={contextMenu.position}
            zone={contextMenu.zone}
            isTapped={contextMenu.isOpponent ? opponentTappedIds.has(contextMenu.card.id) : tappedCardIds.has(contextMenu.card.id)}
            isFlipped={contextMenu.isOpponent ? opponentFlippedIds.has(contextMenu.card.id) : flippedCardIds.has(contextMenu.card.id)}
            counters={contextMenu.isOpponent ? opponentCounters[contextMenu.card.id] || {} : counters[contextMenu.card.id] || {}}
            isAttached={contextMenu.isOpponent ? isOpponentCardAttached(contextMenu.card.id) : isCardAttached(contextMenu.card.id)}
            battlefieldCards={contextMenu.isOpponent ? opponent_zones.battlefield : your_zones.battlefield}
            isOpponent={contextMenu.isOpponent}
            canManipulateOpponent={battle.can_manipulate_opponent}
            onAction={handleContextMenuAction}
            onMove={handleContextMenuMove}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
  )
}
