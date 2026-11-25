/** Battle phase board: coordinates zone sizing, selection moves, context menus, and both player halves. */
import { useState, type MouseEvent, type ReactElement } from "react";
import type {
  GameState,
  Card as CardType,
  ZoneName,
  CardStateAction,
  BattleView,
  Zones,
} from "../../types";
import type { GameActions } from "../../hooks/useGame";
import type { ZoneOwner } from "../../dnd";
import { ZoneDivider } from "../../components/common/ZoneDivider";
import { useBattleLayoutMetricsSync } from "../../hooks/usePhaseHelpers";
import { useBattleCardSizes } from "../../hooks/useBattleCardSizes";
import { battleBoardMetrics } from "./phaseLayouts";
import {
  buildAppliedUpgradeMap,
  buildHiddenAppliedUpgradeMap,
} from "../../utils/upgrades";
import { canInteractWithBattleZone } from "../../utils/battleInteraction";
import { canHover } from "../../utils/inputMode";
import {
  BattleMenus,
  OpponentHalf,
  parseZoneName,
  parseZoneOwner,
  PlayerHalf,
  type BattleBoardSharedProps,
  type LibraryContextOptions,
} from "./BattleZones";

export interface BattleCardMenu {
  card: CardType;
  zone: ZoneName;
  position: { x: number; y: number };
  isOpponent?: boolean;
}

interface ZoneContextMenuState {
  owner: ZoneOwner;
  position: { x: number; y: number };
}

export interface BattleSelectedCard {
  card: CardType;
  zone: ZoneName;
  owner: ZoneOwner;
}

export interface BattleZoneModalState {
  zone: "graveyard" | "exile" | "library";
  owner: ZoneOwner;
}

type BattleActions = Pick<
  GameActions,
  "battleMove" | "battleSubmitResult" | "battleUpdateCardState"
>;

interface BattlePhaseProps {
  gameState: GameState;
  battleOverride?: GameState["current_battle"];
  actions: BattleActions;
  onRevealHiddenUpgrades?: (upgradeIds: string[]) => void;
  isMobile?: boolean;
  selectedCard: BattleSelectedCard | null;
  onSelectedCardChange: (card: BattleSelectedCard | null) => void;
  cardMenu: BattleCardMenu | null;
  onCardMenuChange: (menu: BattleCardMenu | null) => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onOpponentCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  activeZoneModal: BattleZoneModalState | null;
  onZoneModalOpenChange: (
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => void;
  onLayoutMetricsChange?: (metrics: {
    topSectionHeight: number;
    middleLaneHeight: number;
  }) => void;
}

const isLandOrTreasure = (card: CardType): boolean =>
  card.type_line.toLowerCase().includes("land") ||
  card.type_line.toLowerCase().includes("treasure");

const STATIC_DIVIDER_CALLBACKS = {
  onDragStart: (): void => {},
  onDrag: (): void => {},
  onDragEnd: (): void => {},
};

function countTopLevel(
  cards: CardType[],
  attachments: Record<string, string[]>,
  predicate: (c: CardType) => boolean,
): number {
  const attachedIds = new Set(Object.values(attachments).flat());
  return cards.filter((c) => !attachedIds.has(c.id) && predicate(c)).length;
}

function countBattlefieldPiles(zones: Zones | undefined): {
  landCount: number;
  nonlandCount: number;
} {
  if (!zones) return { landCount: 1, nonlandCount: 0 };
  return {
    landCount:
      countTopLevel(zones.battlefield, zones.attachments, isLandOrTreasure) + 1,
    nonlandCount: countTopLevel(
      zones.battlefield,
      zones.attachments,
      (c) => !isLandOrTreasure(c),
    ),
  };
}

function deriveBattleCounts(battle: BattleView | null): {
  playerHandCount: number;
  opponentHandCount: number;
  playerLandCount: number;
  playerNonlandCount: number;
  opponentLandCount: number;
  opponentNonlandCount: number;
} {
  const playerBf = countBattlefieldPiles(battle?.your_zones);
  const opponentBf = countBattlefieldPiles(battle?.opponent_zones);
  return {
    playerHandCount: battle?.your_zones.hand.length ?? 0,
    opponentHandCount: battle?.opponent_hand_count ?? 0,
    playerLandCount: playerBf.landCount,
    playerNonlandCount: playerBf.nonlandCount,
    opponentLandCount: opponentBf.landCount,
    opponentNonlandCount: opponentBf.nonlandCount,
  };
}

function findZoneDropTarget(
  target: HTMLElement | null,
): { toZone: ZoneName; toOwner: ZoneOwner } | null {
  const zoneEl = target?.closest<HTMLElement>("[data-zone]") ?? null;
  const toZone = parseZoneName(zoneEl?.dataset.zone);
  if (!zoneEl || !toZone) return null;
  return { toZone, toOwner: parseZoneOwner(zoneEl.dataset.zoneOwner) };
}

function BattleBoard({
  battle,
  actions,
  sizes,
  containerRef,
  handHeight,
  bfHeight,
  zoneColumnWidth,
  selectedCard,
  setSelectedCard,
  contextMenu,
  setContextMenu,
  zoneContextMenu,
  setZoneContextMenu,
  onRevealHiddenUpgrades,
  onCardHover,
  onOpponentCardHover,
  onCardHoverEnd,
  activeZoneModal,
  onZoneModalOpenChange,
}: {
  battle: BattleView;
  actions: BattleActions;
  sizes: ReturnType<typeof useBattleCardSizes>[1];
  containerRef: ReturnType<typeof useBattleCardSizes>[0];
  handHeight: number;
  bfHeight: number;
  zoneColumnWidth: number;
  selectedCard: BattleSelectedCard | null;
  setSelectedCard: (card: BattleSelectedCard | null) => void;
  contextMenu: BattleCardMenu | null;
  setContextMenu: (menu: BattleCardMenu | null) => void;
  zoneContextMenu: ZoneContextMenuState | null;
  setZoneContextMenu: (menu: ZoneContextMenuState | null) => void;
  onRevealHiddenUpgrades: ((upgradeIds: string[]) => void) | undefined;
  onCardHover: ((cardId: string, zone: ZoneName) => void) | undefined;
  onOpponentCardHover: ((cardId: string, zone: ZoneName) => void) | undefined;
  onCardHoverEnd: (() => void) | undefined;
  activeZoneModal: BattleZoneModalState | null;
  onZoneModalOpenChange: (
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => void;
}): ReactElement {
  const { your_zones, opponent_zones } = battle;
  const allowOpponentHandInteraction = canInteractWithBattleZone({
    owner: "opponent",
    zone: "hand",
    canManipulateOpponent: battle.can_manipulate_opponent,
  });

  const tappedCardIds = new Set(your_zones.tapped_card_ids);
  const flippedCardIds = new Set(your_zones.flipped_card_ids);
  const faceDownCardIds = new Set(your_zones.face_down_card_ids);
  const opponentTappedIds = new Set(opponent_zones.tapped_card_ids);
  const opponentFlippedIds = new Set(opponent_zones.flipped_card_ids);
  const opponentFaceDownIds = new Set(opponent_zones.face_down_card_ids);

  const { upgradedCardIds, appliedUpgradesByCardId: upgradesByCardId } =
    buildAppliedUpgradeMap(your_zones.upgrades, "revealed_applied");
  const {
    upgradedCardIds: opponentUpgradedCardIds,
    appliedUpgradesByCardId: opponentUpgradesByCardId,
  } = buildAppliedUpgradeMap(opponent_zones.upgrades, "revealed_applied");
  const hiddenUpgradesByCardId = buildHiddenAppliedUpgradeMap(
    your_zones.upgrades,
  );

  const openRevealModalForCard = (cardId: string): void => {
    const hiddenUpgrades = hiddenUpgradesByCardId.get(cardId) ?? [];
    if (hiddenUpgrades.length === 0) return;
    onRevealHiddenUpgrades?.(hiddenUpgrades.map((upgrade) => upgrade.id));
  };

  const handleBackgroundClick = (e: MouseEvent): void => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (target?.closest(".card") || !selectedCard) return;
    const destination = findZoneDropTarget(target);
    if (
      destination &&
      (destination.toZone !== selectedCard.zone ||
        destination.toOwner !== selectedCard.owner)
    ) {
      actions.battleMove({
        cardId: selectedCard.card.id,
        fromZone: selectedCard.zone,
        toZone: destination.toZone,
        fromOwner: selectedCard.owner,
        toOwner: destination.toOwner,
      });
    }
    setSelectedCard(null);
  };

  const handleCardClick = (
    card: CardType,
    zone: ZoneName,
    owner: ZoneOwner = "player",
  ): void => {
    setSelectedCard(
      selectedCard?.card.id === card.id ? null : { card, zone, owner },
    );
  };

  const handleZoneClick = (toZone: ZoneName, toOwner: ZoneOwner): void => {
    if (!selectedCard) return;
    if (toZone !== selectedCard.zone || toOwner !== selectedCard.owner) {
      actions.battleMove({
        cardId: selectedCard.card.id,
        fromZone: selectedCard.zone,
        toZone,
        fromOwner: selectedCard.owner,
        toOwner,
      });
    }
    setSelectedCard(null);
  };

  const handleLibraryAction = (
    action: "draw_library" | "shuffle_library",
    owner: ZoneOwner,
  ): void => {
    actions.battleUpdateCardState(
      action,
      "",
      owner === "opponent" ? { for_opponent: true } : undefined,
    );
  };

  const handleContextMenu = (
    e: MouseEvent,
    card: CardType,
    zone: ZoneName,
  ): void => {
    e.preventDefault();
    setContextMenu({ card, zone, position: { x: e.clientX, y: e.clientY } });
  };

  const handleOpponentContextMenu = (
    e: MouseEvent,
    card: CardType,
    zone: ZoneName,
  ): void => {
    e.preventDefault();
    setContextMenu({
      card,
      zone,
      position: { x: e.clientX, y: e.clientY },
      isOpponent: true,
    });
  };

  const handleLibraryContextMenu = (options: LibraryContextOptions): void => {
    if (!options.canOpen || options.count <= 0) return;
    options.event.preventDefault();
    setZoneContextMenu({
      owner: options.owner,
      position: { x: options.event.clientX, y: options.event.clientY },
    });
  };

  const opponentMidZoneHeight = Math.floor(bfHeight / 2);
  const opponentBottomZoneHeight = bfHeight - opponentMidZoneHeight;
  const playerTopZoneHeight = Math.floor(bfHeight / 2);
  const playerMidZoneHeight = bfHeight - playerTopZoneHeight;

  const shared: BattleBoardSharedProps = {
    battle,
    sizes,
    handHeight,
    bfHeight,
    zoneColumnWidth,
    selectedCardId: selectedCard?.card.id,
    isZoneModalOpen: (zone, owner) =>
      activeZoneModal?.zone === zone && activeZoneModal.owner === owner,
    onZoneModalOpenChange,
    onCardClick: handleCardClick,
    onZoneClick: handleZoneClick,
    onLibraryAction: handleLibraryAction,
    onLibraryContextMenu: handleLibraryContextMenu,
    onCardHoverEnd,
  };

  return (
    <div
      ref={containerRef}
      role="presentation"
      className="battle-layout flex flex-col h-full min-h-0 overflow-hidden"
      onClick={handleBackgroundClick}
      data-guide-target="battle-board"
    >
      <OpponentHalf
        shared={shared}
        midZoneHeight={opponentMidZoneHeight}
        bottomZoneHeight={opponentBottomZoneHeight}
        allowOpponentHandInteraction={allowOpponentHandInteraction}
        opponentTappedIds={opponentTappedIds}
        opponentFlippedIds={opponentFlippedIds}
        opponentFaceDownIds={opponentFaceDownIds}
        opponentCounters={opponent_zones.counters}
        opponentUpgradedCardIds={opponentUpgradedCardIds}
        opponentUpgradesByCardId={opponentUpgradesByCardId}
        onOpponentCardDoubleClick={(card) =>
          actions.battleUpdateCardState(
            opponentTappedIds.has(card.id) ? "untap" : "tap",
            card.id,
          )
        }
        onOpponentContextMenu={handleOpponentContextMenu}
        onOpponentPileContextMenu={
          canHover ? handleOpponentContextMenu : undefined
        }
        onOpponentCardHover={onOpponentCardHover}
      />

      <ZoneDivider
        orientation="horizontal"
        interactive={false}
        {...STATIC_DIVIDER_CALLBACKS}
      />

      <PlayerHalf
        shared={shared}
        topZoneHeight={playerTopZoneHeight}
        midZoneHeight={playerMidZoneHeight}
        tappedCardIds={tappedCardIds}
        flippedCardIds={flippedCardIds}
        faceDownCardIds={faceDownCardIds}
        counters={your_zones.counters}
        attachments={your_zones.attachments}
        upgradedCardIds={upgradedCardIds}
        upgradesByCardId={upgradesByCardId}
        hiddenUpgradesByCardId={hiddenUpgradesByCardId}
        onRevealHiddenUpgrades={openRevealModalForCard}
        onCardDoubleClick={(card) =>
          actions.battleUpdateCardState(
            tappedCardIds.has(card.id) ? "untap" : "tap",
            card.id,
          )
        }
        onContextMenu={handleContextMenu}
        onPileContextMenu={canHover ? handleContextMenu : undefined}
        onCardHover={onCardHover}
      />

      <BattleMenus
        contextMenu={contextMenu}
        zoneContextMenu={zoneContextMenu}
        yourZones={your_zones}
        opponentZones={opponent_zones}
        tappedCardIds={tappedCardIds}
        flippedCardIds={flippedCardIds}
        opponentTappedIds={opponentTappedIds}
        opponentFlippedIds={opponentFlippedIds}
        canManipulateOpponent={battle.can_manipulate_opponent}
        onAction={(action: CardStateAction, data?: Record<string, unknown>) => {
          if (!contextMenu) return;
          actions.battleUpdateCardState(action, contextMenu.card.id, data);
        }}
        onMove={(toZone, toOwner) => {
          if (!contextMenu) return;
          const fromOwner: ZoneOwner = contextMenu.isOpponent
            ? "opponent"
            : "player";
          actions.battleMove({
            cardId: contextMenu.card.id,
            fromZone: contextMenu.zone,
            toZone,
            fromOwner,
            toOwner: toOwner ?? fromOwner,
          });
        }}
        onCloseCardMenu={() => setContextMenu(null)}
        onLibraryAction={handleLibraryAction}
        onCloseZoneMenu={() => setZoneContextMenu(null)}
      />
    </div>
  );
}

export function BattlePhase({
  gameState,
  battleOverride,
  actions,
  onRevealHiddenUpgrades,
  isMobile = false,
  selectedCard,
  onSelectedCardChange,
  cardMenu: contextMenu,
  onCardMenuChange: setContextMenu,
  onCardHover,
  onOpponentCardHover,
  onCardHoverEnd,
  activeZoneModal,
  onZoneModalOpenChange,
  onLayoutMetricsChange,
}: BattlePhaseProps): ReactElement {
  const [zoneContextMenu, setZoneContextMenu] =
    useState<ZoneContextMenuState | null>(null);

  const battle = battleOverride ?? gameState.current_battle;
  const counts = deriveBattleCounts(battle);
  const {
    handPadding,
    battlefieldPadding,
    midDividerHeight,
    fixedHeight,
    zoneColumnWidth,
  } = battleBoardMetrics({ isMobile });

  const [containerRef, sizes] = useBattleCardSizes({
    ...counts,
    fixedHeight,
    zoneColumnWidth,
  });

  const { rowHeight } = sizes;
  const handHeight = rowHeight + handPadding;
  const bfHeight = 2 * rowHeight + battlefieldPadding;
  const opponentMidZoneHeight = Math.floor(bfHeight / 2);
  const opponentBottomZoneHeight = bfHeight - opponentMidZoneHeight;
  const playerTopZoneHeight = Math.floor(bfHeight / 2);

  useBattleLayoutMetricsSync(
    handHeight + opponentMidZoneHeight,
    opponentBottomZoneHeight + midDividerHeight + playerTopZoneHeight,
    onLayoutMetricsChange,
  );

  if (!battle) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-white mb-4">Waiting for the Fight</div>
          <p className="text-[var(--ivory-muted)]">
            Waiting for opponent to finish building...
          </p>
        </div>
      </div>
    );
  }

  return (
    <BattleBoard
      battle={battle}
      actions={actions}
      sizes={sizes}
      containerRef={containerRef}
      handHeight={handHeight}
      bfHeight={bfHeight}
      zoneColumnWidth={zoneColumnWidth}
      selectedCard={selectedCard}
      setSelectedCard={onSelectedCardChange}
      contextMenu={contextMenu}
      setContextMenu={setContextMenu}
      zoneContextMenu={zoneContextMenu}
      setZoneContextMenu={setZoneContextMenu}
      onRevealHiddenUpgrades={onRevealHiddenUpgrades}
      onCardHover={onCardHover}
      onOpponentCardHover={onOpponentCardHover}
      onCardHoverEnd={onCardHoverEnd}
      activeZoneModal={activeZoneModal}
      onZoneModalOpenChange={onZoneModalOpenChange}
    />
  );
}
