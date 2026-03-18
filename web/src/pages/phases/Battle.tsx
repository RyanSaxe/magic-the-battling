import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react'
import type { GameState, Card as CardType, ZoneName, CardStateAction } from '../../types'
import { DraggableCard, DroppableZone, type ZoneOwner } from '../../dnd'
import { HandZone, BattlefieldZone } from '../../components/zones'
import { CompactZoneDisplay } from '../../components/zones/CompactZoneDisplay'
import { Card, CardBack, CardActionMenu } from '../../components/card'
import { ZoneDivider } from '../../components/common/ZoneDivider'
import { useBattleCardSizes } from '../../hooks/useBattleCardSizes'
import { buildAppliedUpgradeMap, buildHiddenAppliedUpgradeMap } from '../../utils/upgrades'

interface ContextMenuState {
  card: CardType
  zone: ZoneName
  position: { x: number; y: number }
  isOpponent?: boolean
}

interface ZoneContextMenuState {
  owner: ZoneOwner
  position: { x: number; y: number }
}

export interface BattleSelectedCard {
  card: CardType
  zone: ZoneName
  owner: ZoneOwner
}

export interface BattleZoneModalState {
  zone: "graveyard" | "exile" | "library"
  owner: ZoneOwner
}

interface BattlePhaseProps {
  gameState: GameState
  battleOverride?: GameState['current_battle']
  actions: {
    battleMove: (cardId: string, fromZone: ZoneName, toZone: ZoneName, fromOwner: ZoneOwner, toOwner: ZoneOwner) => void
    battleSubmitResult: (result: string) => void
    battleUpdateCardState: (actionType: CardStateAction, cardId: string, data?: Record<string, unknown>) => void
  }
  onRevealHiddenUpgrades?: (upgradeIds: string[]) => void
  isMobile?: boolean
  selectedCard: BattleSelectedCard | null
  onSelectedCardChange: (card: BattleSelectedCard | null) => void
  onCardHover?: (cardId: string, zone: ZoneName) => void
  onOpponentCardHover?: (cardId: string, zone: ZoneName) => void
  onCardHoverEnd?: () => void
  activeZoneModal: BattleZoneModalState | null
  onZoneModalOpenChange: (
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => void
  onLayoutMetricsChange?: (metrics: {
    topSectionHeight: number
    middleLaneHeight: number
  }) => void
}

const isLandOrTreasure = (card: CardType) =>
  card.type_line.toLowerCase().includes("land") ||
  card.type_line.toLowerCase().includes("treasure")

const STATIC_DIVIDER_CALLBACKS = {
  onDragStart: () => {},
  onDrag: () => {},
  onDragEnd: () => {},
}

function countTopLevel(cards: CardType[], attachments: Record<string, string[]>, predicate: (c: CardType) => boolean): number {
  const attachedIds = new Set(Object.values(attachments).flat())
  return cards.filter((c) => !attachedIds.has(c.id) && predicate(c)).length
}

function ZoneActionMenu({
  position,
  onDraw,
  onShuffle,
  onClose,
}: {
  position: { x: number; y: number }
  onDraw: () => void
  onShuffle: () => void
  onClose: () => void
}) {
  const menuRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const rect = node.getBoundingClientRect()
    const padding = 8
    const x = Math.max(padding, Math.min(position.x, window.innerWidth - rect.width - padding))
    const y = Math.max(padding, Math.min(position.y, window.innerHeight - rect.height - padding))
    node.style.left = `${x}px`
    node.style.top = `${y}px`
  }, [position])

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div
        ref={menuRef}
        className="fixed modal-chrome border gold-border rounded-lg shadow-xl py-1 min-w-[160px] z-[51]"
      >
        <button
          type="button"
          onClick={() => {
            onDraw()
            onClose()
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
        >
          Draw
        </button>
        <button
          type="button"
          onClick={() => {
            onShuffle()
            onClose()
          }}
          className="w-full px-3 py-1.5 text-left text-sm text-white hover:bg-white/10 transition-colors"
        >
          Shuffle
        </button>
      </div>
    </>
  )
}

export function BattlePhase({
  gameState,
  battleOverride,
  actions,
  onRevealHiddenUpgrades,
  isMobile = false,
  selectedCard,
  onSelectedCardChange,
  onCardHover,
  onOpponentCardHover,
  onCardHoverEnd,
  activeZoneModal,
  onZoneModalOpenChange,
  onLayoutMetricsChange,
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
  const [zoneContextMenu, setZoneContextMenu] = useState<ZoneContextMenuState | null>(null)

  const { current_battle } = gameState

  const battle = battleOverride ?? current_battle
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
  const MID_DIVIDER_HEIGHT = 2
  const suddenDeathHeight = battle?.is_sudden_death ? 70 : 0
  const fixedHeight = (2 * HAND_PADDING) + (2 * BF_PADDING) + suddenDeathHeight + MID_DIVIDER_HEIGHT
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

  const { rowHeight } = sizes
  const handHeight = rowHeight + HAND_PADDING
  const bfHeight = 2 * rowHeight + BF_PADDING
  const opponentMidZoneHeight = Math.floor(bfHeight / 2)
  const opponentBottomZoneHeight = bfHeight - opponentMidZoneHeight
  const playerTopZoneHeight = Math.floor(bfHeight / 2)
  const playerMidZoneHeight = bfHeight - playerTopZoneHeight

  useLayoutEffect(() => {
    onLayoutMetricsChange?.({
      topSectionHeight: handHeight + opponentMidZoneHeight,
      middleLaneHeight: opponentBottomZoneHeight + MID_DIVIDER_HEIGHT + playerTopZoneHeight,
    })
  }, [
    handHeight,
    onLayoutMetricsChange,
    MID_DIVIDER_HEIGHT,
    opponentBottomZoneHeight,
    opponentMidZoneHeight,
    playerTopZoneHeight,
  ])

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

  const canManipulateOpponent = battle.can_manipulate_opponent

  const tappedCardIds = new Set(your_zones.tapped_card_ids || [])
  const flippedCardIds = new Set(your_zones.flipped_card_ids || [])
  const counters = your_zones.counters || {}
  const attachments = your_zones.attachments || {}

  const opponentTappedIds = new Set(opponent_zones.tapped_card_ids || [])
  const opponentFlippedIds = new Set(opponent_zones.flipped_card_ids || [])
  const opponentCounters = opponent_zones.counters || {}

  const { upgradedCardIds, appliedUpgradesByCardId: upgradesByCardId } = buildAppliedUpgradeMap(
    your_zones.upgrades,
    'revealed_applied',
  )
  const {
    upgradedCardIds: opponentUpgradedCardIds,
    appliedUpgradesByCardId: opponentUpgradesByCardId,
  } = buildAppliedUpgradeMap(opponent_zones.upgrades, 'revealed_applied')
  const hiddenUpgradesByCardId = buildHiddenAppliedUpgradeMap(your_zones.upgrades)

  const openRevealModalForCard = (cardId: string) => {
    const hiddenUpgrades = hiddenUpgradesByCardId.get(cardId) ?? []
    if (hiddenUpgrades.length === 0) return
    onRevealHiddenUpgrades?.(hiddenUpgrades.map((upgrade) => upgrade.id))
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

  const handleLibraryAction = (action: 'draw_library' | 'shuffle_library', owner: ZoneOwner) => {
    actions.battleUpdateCardState(action, '', owner === 'opponent' ? { for_opponent: true } : undefined)
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

  const isZoneModalOpen = (zone: BattleZoneModalState["zone"], owner: ZoneOwner): boolean =>
    activeZoneModal?.zone === zone && activeZoneModal.owner === owner

  const handleOpponentContextMenu = (e: React.MouseEvent, card: CardType, zone: ZoneName) => {
    e.preventDefault()
    setContextMenu({ card, zone, position: { x: e.clientX, y: e.clientY }, isOpponent: true })
  }

  const handleLibraryContextMenu = (
    e: React.MouseEvent<HTMLDivElement>,
    owner: ZoneOwner,
    count: number,
    canOpen: boolean,
  ) => {
    if (!canOpen || count <= 0) return
    e.preventDefault()
    setZoneContextMenu({
      owner,
      position: { x: e.clientX, y: e.clientY },
    })
  }

  const isCardAttached = (cardId: string): boolean => {
    return Object.values(attachments).some(children => children.includes(cardId))
  }

  const isOpponentCardAttached = (cardId: string): boolean => {
    const opAttachments = opponent_zones.attachments || {}
    return Object.values(opAttachments).some(children => children.includes(cardId))
  }

  const opponentTopZoneHeight = handHeight
  const playerBottomZoneHeight = handHeight

  return (
    <div
      ref={containerRef}
      className="battle-layout flex flex-col h-full min-h-0 overflow-hidden"
      onClick={handleBackgroundClick}
      data-guide-target="battle-board"
    >
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

        {/* Opponent's half */}
        <div className="flex shrink-0 overflow-hidden" style={{ height: handHeight + bfHeight }}>
          <div className="flex flex-col flex-1 min-w-0">
            {/* Opponent's hand */}
            <div
              id="opponent-hand"
              className="shrink-0 zone-hand overflow-hidden"
              style={{ height: handHeight }}
              data-guide-target="battle-opponent-hand"
            >
              {canManipulateOpponent ? (
                <DroppableZone
                  zone="hand"
                  zoneOwner="opponent"
                  validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
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
            {/* Opponent's battlefield */}
            <div className="relative flex-1 min-w-0 battlefield overflow-hidden battle-hand-separator-top">
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
          </div>
          {/* Opponent side zones: Library, Graveyard, Exile (top→bottom, mirrored) */}
          <div className="flex flex-col shrink-0 battle-side-column battle-side-column-opponent" style={{ width: zoneColumnWidth }}>
            <CompactZoneDisplay
              title="Library"
              zone="library"
              cards={opponent_zones.library}
              height={opponentTopZoneHeight}
              width={zoneColumnWidth}
              isOpponent
              canManipulateOpponent={canManipulateOpponent}
              validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
              onCardHover={onOpponentCardHover}
              onCardHoverEnd={onCardHoverEnd}
              forceFaceDown
              selectedCardId={selectedCard?.card.id}
              onZoneClick={() => handleZoneClick('library', 'opponent')}
              onCardClick={handleCardClick}
              upgradedCardIds={opponentUpgradedCardIds}
              upgradesByCardId={opponentUpgradesByCardId}
              containerClassName="battle-side-cell"
              onContextMenu={(e) => handleLibraryContextMenu(e, 'opponent', opponent_zones.library.length, canManipulateOpponent)}
              modalHeaderActions={canManipulateOpponent && opponent_zones.library.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleLibraryAction('draw_library', 'opponent')}
                    className="btn btn-secondary text-xs py-1 px-2"
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLibraryAction('shuffle_library', 'opponent')}
                    className="btn btn-secondary text-xs py-1 px-2"
                  >
                    Shuffle
                  </button>
                </>
              ) : undefined}
              isModalOpen={isZoneModalOpen('library', 'opponent')}
              onModalOpenChange={(open) => onZoneModalOpenChange('library', 'opponent', open)}
            />
            <CompactZoneDisplay
              title="Graveyard"
              zone="graveyard"
              cards={opponent_zones.graveyard}
              height={opponentMidZoneHeight}
              width={zoneColumnWidth}
              isOpponent
              canManipulateOpponent={canManipulateOpponent}
              validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
              onCardHover={onOpponentCardHover}
              onCardHoverEnd={onCardHoverEnd}
              canPeekFaceDown={opponent_hand_revealed}
              selectedCardId={selectedCard?.card.id}
              onZoneClick={() => handleZoneClick('graveyard', 'opponent')}
              onCardClick={handleCardClick}
              upgradedCardIds={opponentUpgradedCardIds}
              upgradesByCardId={opponentUpgradesByCardId}
              containerClassName="battle-side-cell"
              isModalOpen={isZoneModalOpen('graveyard', 'opponent')}
              onModalOpenChange={(open) => onZoneModalOpenChange('graveyard', 'opponent', open)}
            />
            <CompactZoneDisplay
              title="Exile"
              zone="exile"
              cards={opponent_zones.exile}
              height={opponentBottomZoneHeight}
              width={zoneColumnWidth}
              isOpponent
              canManipulateOpponent={canManipulateOpponent}
              validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
              onCardHover={onOpponentCardHover}
              onCardHoverEnd={onCardHoverEnd}
              canPeekFaceDown={opponent_hand_revealed}
              selectedCardId={selectedCard?.card.id}
              onZoneClick={() => handleZoneClick('exile', 'opponent')}
              onCardClick={handleCardClick}
              upgradedCardIds={opponentUpgradedCardIds}
              upgradesByCardId={opponentUpgradesByCardId}
              containerClassName="battle-side-cell"
              isModalOpen={isZoneModalOpen('exile', 'opponent')}
              onModalOpenChange={(open) => onZoneModalOpenChange('exile', 'opponent', open)}
            />
          </div>
        </div>

        <ZoneDivider
          orientation="horizontal"
          interactive={false}
          {...STATIC_DIVIDER_CALLBACKS}
        />

        {/* Your half */}
        <div className="flex shrink-0 overflow-hidden" style={{ height: handHeight + bfHeight }}>
          <div className="flex flex-col flex-1 min-w-0">
            {/* Your battlefield */}
            <div
              className="relative flex-1 min-w-0 battlefield overflow-hidden"
              data-guide-target="battle-battlefield"
            >
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
                hiddenUpgradesByCardId={hiddenUpgradesByCardId}
                onRevealHiddenUpgrades={openRevealModalForCard}
                poisonCount={yourPoison}
                cardDimensions={sizes.playerNonlands}
                rowHeight={rowHeight}
                landCardDimensions={sizes.playerLands}
                nonlandCardDimensions={sizes.playerNonlands}
              />
            </div>
            {/* Your hand */}
            <div
              className="shrink-0 zone-hand overflow-hidden battle-hand-separator-top"
              style={{ height: handHeight }}
              data-guide-target="battle-hand"
            >
              <HandZone
                cards={your_zones.hand}
                selectedCardId={selectedCard?.card.id}
                onCardClick={(card) => handleCardClick(card, 'hand')}
                onCardContextMenu={(e, card) => handleContextMenu(e, card, 'hand')}
                onCardHover={onCardHover}
                onCardHoverEnd={onCardHoverEnd}
                upgradedCardIds={upgradedCardIds}
                upgradesByCardId={upgradesByCardId}
                hiddenUpgradesByCardId={hiddenUpgradesByCardId}
                onRevealHiddenUpgrades={openRevealModalForCard}
                cardDimensions={sizes.playerHand}
                gap={sizes.playerHandGap}
              />
            </div>
          </div>
          {/* Your side zones: Exile, Graveyard, Library (top→bottom) */}
          <div className="flex flex-col shrink-0 battle-side-column battle-side-column-player" style={{ width: zoneColumnWidth }}>
            <CompactZoneDisplay
              title="Exile"
              zone="exile"
              cards={your_zones.exile}
              height={playerTopZoneHeight}
              width={zoneColumnWidth}
              validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              selectedCardId={selectedCard?.card.id}
              onZoneClick={() => handleZoneClick('exile', 'player')}
              onCardClick={handleCardClick}
              upgradedCardIds={upgradedCardIds}
              upgradesByCardId={upgradesByCardId}
              hiddenUpgradesByCardId={hiddenUpgradesByCardId}
              onRevealHiddenUpgrades={openRevealModalForCard}
              containerClassName="battle-side-cell"
              isModalOpen={isZoneModalOpen('exile', 'player')}
              onModalOpenChange={(open) => onZoneModalOpenChange('exile', 'player', open)}
            />
            <CompactZoneDisplay
              title="Graveyard"
              zone="graveyard"
              cards={your_zones.graveyard}
              height={playerMidZoneHeight}
              width={zoneColumnWidth}
              validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              selectedCardId={selectedCard?.card.id}
              onZoneClick={() => handleZoneClick('graveyard', 'player')}
              onCardClick={handleCardClick}
              upgradedCardIds={upgradedCardIds}
              upgradesByCardId={upgradesByCardId}
              hiddenUpgradesByCardId={hiddenUpgradesByCardId}
              onRevealHiddenUpgrades={openRevealModalForCard}
              containerClassName="battle-side-cell"
              isModalOpen={isZoneModalOpen('graveyard', 'player')}
              onModalOpenChange={(open) => onZoneModalOpenChange('graveyard', 'player', open)}
            />
            <CompactZoneDisplay
              title="Library"
              zone="library"
              cards={your_zones.library}
              height={playerBottomZoneHeight}
              width={zoneColumnWidth}
              validFromZones={['hand', 'battlefield', 'graveyard', 'exile', 'sideboard', 'command_zone', 'library']}
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              forceFaceDown
              selectedCardId={selectedCard?.card.id}
              onZoneClick={() => handleZoneClick('library', 'player')}
              onCardClick={handleCardClick}
              upgradedCardIds={upgradedCardIds}
              upgradesByCardId={upgradesByCardId}
              hiddenUpgradesByCardId={hiddenUpgradesByCardId}
              onRevealHiddenUpgrades={openRevealModalForCard}
              containerClassName="battle-side-cell"
              onContextMenu={(e) => handleLibraryContextMenu(e, 'player', your_zones.library.length, true)}
              modalHeaderActions={your_zones.library.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleLibraryAction('draw_library', 'player')}
                    className="btn btn-secondary text-xs py-1 px-2"
                  >
                    Draw
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLibraryAction('shuffle_library', 'player')}
                    className="btn btn-secondary text-xs py-1 px-2"
                  >
                    Shuffle
                  </button>
                </>
              ) : undefined}
              isModalOpen={isZoneModalOpen('library', 'player')}
              onModalOpenChange={(open) => onZoneModalOpenChange('library', 'player', open)}
            />
          </div>
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
        {zoneContextMenu && (
          <ZoneActionMenu
            position={zoneContextMenu.position}
            onDraw={() => handleLibraryAction('draw_library', zoneContextMenu.owner)}
            onShuffle={() => handleLibraryAction('shuffle_library', zoneContextMenu.owner)}
            onClose={() => setZoneContextMenu(null)}
          />
        )}
      </div>
  )
}
