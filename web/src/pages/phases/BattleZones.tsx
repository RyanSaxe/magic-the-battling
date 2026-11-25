/** Battle half-board subcomponents, hand fan styling, and DOM dataset zone parsers for BattlePhase. */
import type { CSSProperties, MouseEvent, ReactElement } from "react";
import type {
  BattleView,
  Card as CardType,
  CardStateAction,
  ZoneName,
  Zones,
} from "../../types";
import { DraggableCard, DroppableZone, type ZoneOwner } from "../../dnd";
import { HandZone, BattlefieldZone } from "../../components/zones";
import { CompactZoneDisplay } from "../../components/zones/CompactZoneDisplay";
import { Card, CardBack, CardActionMenu } from "../../components/card";
import type { useBattleCardSizes } from "../../hooks/useBattleCardSizes";
import { ZoneActionMenu } from "./BattleZoneActionMenu";
import type { BattleCardMenu, BattleZoneModalState } from "./Battle";

const ALL_BATTLE_ZONES: ZoneName[] = [
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "sideboard",
  "command_zone",
  "library",
];

const ZONE_NAME_MAP: Readonly<Record<string, ZoneName>> = {
  battlefield: "battlefield",
  graveyard: "graveyard",
  exile: "exile",
  hand: "hand",
  sideboard: "sideboard",
  upgrades: "upgrades",
  command_zone: "command_zone",
  library: "library",
};

export function parseZoneName(value: string | undefined): ZoneName | null {
  if (!value) return null;
  return ZONE_NAME_MAP[value] ?? null;
}

export function parseZoneOwner(value: string | undefined): ZoneOwner {
  return value === "opponent" ? "opponent" : "player";
}

function fanCardStyle(options: {
  gap: number;
  index: number;
  count: number;
  isSelected: boolean;
}): CSSProperties {
  const { gap, index, count, isSelected } = options;
  if (gap >= 0) return {};
  return {
    ...(index > 0 ? { marginLeft: gap } : undefined),
    zIndex: isSelected ? count + 1 : count - index,
  };
}

function OpponentCardBacks({
  count,
  dimensions,
  gap,
}: {
  count: number;
  dimensions: { width: number; height: number };
  gap: number;
}): ReactElement {
  const slots = Array.from({ length: count }, (_, index) => ({
    id: `opponent-hand-back-${index}`,
    index,
  }));
  return (
    <>
      {slots.map(({ id, index }) => (
        <CardBack
          key={id}
          dimensions={dimensions}
          style={fanCardStyle({ gap, index, count, isSelected: false })}
        />
      ))}
    </>
  );
}

function OpponentHandArea({
  battle,
  sizes,
  allowOpponentHandInteraction,
  selectedCardId,
  opponentUpgradedCardIds,
  opponentUpgradesByCardId,
  onCardClick,
  onOpponentContextMenu,
  onOpponentCardHover,
  onCardHoverEnd,
}: {
  battle: BattleView;
  sizes: ReturnType<typeof useBattleCardSizes>[1];
  allowOpponentHandInteraction: boolean;
  selectedCardId: string | undefined;
  opponentUpgradedCardIds: ReadonlySet<string>;
  opponentUpgradesByCardId: ReadonlyMap<string, CardType[]>;
  onCardClick: (card: CardType, zone: ZoneName, owner?: ZoneOwner) => void;
  onOpponentContextMenu: (
    e: MouseEvent,
    card: CardType,
    zone: ZoneName,
  ) => void;
  onOpponentCardHover: ((cardId: string, zone: ZoneName) => void) | undefined;
  onCardHoverEnd: (() => void) | undefined;
}): ReactElement {
  const { opponent_zones, opponent_hand_count, opponent_hand_revealed } =
    battle;
  const gap = sizes.opponentHandGap;

  if (allowOpponentHandInteraction) {
    return (
      <DroppableZone
        zone="hand"
        zoneOwner="opponent"
        validFromZones={ALL_BATTLE_ZONES}
        className="hand-zone flex items-center justify-center flex-nowrap w-full h-full"
        style={{ gap: Math.max(0, gap) }}
      >
        {opponent_hand_revealed ? (
          opponent_zones.hand.map((card, index) => (
            <DraggableCard
              key={card.id}
              card={card}
              zone="hand"
              zoneOwner="opponent"
              dimensions={sizes.opponentHand}
              isOpponent
              upgraded={opponentUpgradedCardIds.has(card.id)}
              appliedUpgrades={opponentUpgradesByCardId.get(card.id)}
              canPeekFaceDown={opponent_hand_revealed}
              selected={selectedCardId === card.id}
              onClick={() => onCardClick(card, "hand", "opponent")}
              onContextMenu={(e) => onOpponentContextMenu(e, card, "hand")}
              onCardHover={onOpponentCardHover}
              onCardHoverEnd={onCardHoverEnd}
              style={fanCardStyle({
                gap,
                index,
                count: opponent_zones.hand.length,
                isSelected: selectedCardId === card.id,
              })}
            />
          ))
        ) : (
          <OpponentCardBacks
            count={opponent_hand_count}
            dimensions={sizes.opponentHand}
            gap={gap}
          />
        )}
      </DroppableZone>
    );
  }

  return (
    <div
      className="hand-zone flex items-center justify-center flex-nowrap h-full"
      style={{ gap: Math.max(0, gap) }}
    >
      {opponent_hand_revealed ? (
        opponent_zones.hand.map((card, index) => (
          <Card
            key={card.id}
            card={card}
            dimensions={sizes.opponentHand}
            upgraded={opponentUpgradedCardIds.has(card.id)}
            appliedUpgrades={opponentUpgradesByCardId.get(card.id)}
            style={fanCardStyle({
              gap,
              index,
              count: opponent_zones.hand.length,
              isSelected: false,
            })}
          />
        ))
      ) : (
        <OpponentCardBacks
          count={opponent_hand_count}
          dimensions={sizes.opponentHand}
          gap={gap}
        />
      )}
    </div>
  );
}

function LibraryHeaderButtons({
  onDraw,
  onShuffle,
}: {
  onDraw: () => void;
  onShuffle: () => void;
}): ReactElement {
  return (
    <>
      <button
        type="button"
        onClick={onDraw}
        className="btn btn-secondary text-xs py-1 px-2"
      >
        Draw
      </button>
      <button
        type="button"
        onClick={onShuffle}
        className="btn btn-secondary text-xs py-1 px-2"
      >
        Shuffle
      </button>
    </>
  );
}

export interface LibraryContextOptions {
  event: MouseEvent<HTMLDivElement>;
  owner: ZoneOwner;
  count: number;
  canOpen: boolean;
}

export interface BattleBoardSharedProps {
  battle: BattleView;
  sizes: ReturnType<typeof useBattleCardSizes>[1];
  handHeight: number;
  bfHeight: number;
  zoneColumnWidth: number;
  selectedCardId: string | undefined;
  isZoneModalOpen: (
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
  ) => boolean;
  onZoneModalOpenChange: (
    zone: BattleZoneModalState["zone"],
    owner: ZoneOwner,
    open: boolean,
  ) => void;
  onCardClick: (card: CardType, zone: ZoneName, owner?: ZoneOwner) => void;
  onZoneClick: (toZone: ZoneName, toOwner: ZoneOwner) => void;
  onLibraryAction: (
    action: "draw_library" | "shuffle_library",
    owner: ZoneOwner,
  ) => void;
  onLibraryContextMenu: (options: LibraryContextOptions) => void;
  onCardHoverEnd: (() => void) | undefined;
}

export function OpponentHalf({
  shared,
  midZoneHeight,
  bottomZoneHeight,
  allowOpponentHandInteraction,
  opponentTappedIds,
  opponentFlippedIds,
  opponentFaceDownIds,
  opponentCounters,
  opponentUpgradedCardIds,
  opponentUpgradesByCardId,
  onOpponentCardDoubleClick,
  onOpponentContextMenu,
  onOpponentPileContextMenu,
  onOpponentCardHover,
}: {
  shared: BattleBoardSharedProps;
  midZoneHeight: number;
  bottomZoneHeight: number;
  allowOpponentHandInteraction: boolean;
  opponentTappedIds: Set<string>;
  opponentFlippedIds: Set<string>;
  opponentFaceDownIds: Set<string>;
  opponentCounters: Record<string, Record<string, number>>;
  opponentUpgradedCardIds: Set<string>;
  opponentUpgradesByCardId: Map<string, CardType[]>;
  onOpponentCardDoubleClick: (card: CardType) => void;
  onOpponentContextMenu: (
    e: MouseEvent,
    card: CardType,
    zone: ZoneName,
  ) => void;
  onOpponentPileContextMenu:
    | ((e: MouseEvent, card: CardType, zone: ZoneName) => void)
    | undefined;
  onOpponentCardHover: ((cardId: string, zone: ZoneName) => void) | undefined;
}): ReactElement {
  const { battle, sizes, handHeight, bfHeight, zoneColumnWidth } = shared;
  const { opponent_zones, opponent_name, opponent_hand_revealed } = battle;
  const canManipulateOpponent = battle.can_manipulate_opponent;

  return (
    <div
      className="flex shrink-0 overflow-hidden"
      style={{ height: handHeight + bfHeight }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <div
          id="opponent-hand"
          className="shrink-0 zone-hand overflow-hidden"
          style={{ height: handHeight }}
          data-guide-target="battle-opponent-hand"
        >
          <OpponentHandArea
            battle={battle}
            sizes={sizes}
            allowOpponentHandInteraction={allowOpponentHandInteraction}
            selectedCardId={shared.selectedCardId}
            opponentUpgradedCardIds={opponentUpgradedCardIds}
            opponentUpgradesByCardId={opponentUpgradesByCardId}
            onCardClick={shared.onCardClick}
            onOpponentContextMenu={onOpponentContextMenu}
            onOpponentCardHover={onOpponentCardHover}
            onCardHoverEnd={shared.onCardHoverEnd}
          />
        </div>
        <div className="relative flex-1 min-w-0 battlefield overflow-hidden battle-hand-separator-top">
          <BattlefieldZone
            cards={opponent_zones.battlefield}
            selectedCardId={shared.selectedCardId}
            onCardClick={(card) =>
              shared.onCardClick(card, "battlefield", "opponent")
            }
            onCardDoubleClick={onOpponentCardDoubleClick}
            onCardContextMenu={(e, card) =>
              onOpponentContextMenu(e, card, "battlefield")
            }
            onCardHover={onOpponentCardHover}
            onCardHoverEnd={shared.onCardHoverEnd}
            tappedCardIds={opponentTappedIds}
            flippedCardIds={opponentFlippedIds}
            faceDownCardIds={opponentFaceDownIds}
            counters={opponentCounters}
            attachments={opponent_zones.attachments || {}}
            separateLands
            isOpponent
            canManipulateOpponent={canManipulateOpponent}
            upgradedCardIds={opponentUpgradedCardIds}
            upgradesByCardId={opponentUpgradesByCardId}
            poisonCount={battle.opponent_poison}
            cardDimensions={sizes.opponentNonlands}
            rowHeight={sizes.rowHeight}
            landCardDimensions={sizes.opponentLands}
            nonlandCardDimensions={sizes.opponentNonlands}
            canPeekFaceDown={opponent_hand_revealed}
          />
        </div>
      </div>

      <div
        className="flex flex-col shrink-0 battle-side-column battle-side-column-opponent"
        style={{ width: zoneColumnWidth }}
      >
        <CompactZoneDisplay
          title="Library"
          panelTitle={`${opponent_name}'s Library`}
          zone="library"
          cards={opponent_zones.library}
          height={handHeight}
          width={zoneColumnWidth}
          isOpponent
          canManipulateOpponent={canManipulateOpponent}
          validFromZones={ALL_BATTLE_ZONES}
          onCardHover={onOpponentCardHover}
          onCardHoverEnd={shared.onCardHoverEnd}
          forceFaceDown
          selectedCardId={shared.selectedCardId}
          onZoneClick={() => shared.onZoneClick("library", "opponent")}
          onCardClick={shared.onCardClick}
          upgradedCardIds={opponentUpgradedCardIds}
          upgradesByCardId={opponentUpgradesByCardId}
          containerClassName="battle-side-cell"
          onContextMenu={(event) =>
            shared.onLibraryContextMenu({
              event,
              owner: "opponent",
              count: opponent_zones.library.length,
              canOpen: canManipulateOpponent,
            })
          }
          modalHeaderActions={
            canManipulateOpponent && opponent_zones.library.length > 0 ? (
              <LibraryHeaderButtons
                onDraw={() =>
                  shared.onLibraryAction("draw_library", "opponent")
                }
                onShuffle={() =>
                  shared.onLibraryAction("shuffle_library", "opponent")
                }
              />
            ) : undefined
          }
          isModalOpen={shared.isZoneModalOpen("library", "opponent")}
          onModalOpenChange={(open) =>
            shared.onZoneModalOpenChange("library", "opponent", open)
          }
        />
        <CompactZoneDisplay
          title="Graveyard"
          panelTitle={`${opponent_name}'s Graveyard`}
          zone="graveyard"
          cards={opponent_zones.graveyard}
          height={midZoneHeight}
          width={zoneColumnWidth}
          isOpponent
          canManipulateOpponent={canManipulateOpponent}
          validFromZones={ALL_BATTLE_ZONES}
          onCardHover={onOpponentCardHover}
          onCardHoverEnd={shared.onCardHoverEnd}
          canPeekFaceDown={opponent_hand_revealed}
          selectedCardId={shared.selectedCardId}
          onZoneClick={() => shared.onZoneClick("graveyard", "opponent")}
          onCardClick={shared.onCardClick}
          onCardContextMenu={onOpponentPileContextMenu}
          upgradedCardIds={opponentUpgradedCardIds}
          upgradesByCardId={opponentUpgradesByCardId}
          containerClassName="battle-side-cell"
          isModalOpen={shared.isZoneModalOpen("graveyard", "opponent")}
          onModalOpenChange={(open) =>
            shared.onZoneModalOpenChange("graveyard", "opponent", open)
          }
        />
        <CompactZoneDisplay
          title="Exile"
          panelTitle={`${opponent_name}'s Exile`}
          zone="exile"
          cards={opponent_zones.exile}
          height={bottomZoneHeight}
          width={zoneColumnWidth}
          isOpponent
          canManipulateOpponent={canManipulateOpponent}
          validFromZones={ALL_BATTLE_ZONES}
          onCardHover={onOpponentCardHover}
          onCardHoverEnd={shared.onCardHoverEnd}
          canPeekFaceDown={opponent_hand_revealed}
          selectedCardId={shared.selectedCardId}
          onZoneClick={() => shared.onZoneClick("exile", "opponent")}
          onCardClick={shared.onCardClick}
          onCardContextMenu={onOpponentPileContextMenu}
          upgradedCardIds={opponentUpgradedCardIds}
          upgradesByCardId={opponentUpgradesByCardId}
          containerClassName="battle-side-cell"
          isModalOpen={shared.isZoneModalOpen("exile", "opponent")}
          onModalOpenChange={(open) =>
            shared.onZoneModalOpenChange("exile", "opponent", open)
          }
        />
      </div>
    </div>
  );
}

export function PlayerHalf({
  shared,
  topZoneHeight,
  midZoneHeight,
  tappedCardIds,
  flippedCardIds,
  faceDownCardIds,
  counters,
  attachments,
  upgradedCardIds,
  upgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
  onCardDoubleClick,
  onContextMenu,
  onPileContextMenu,
  onCardHover,
}: {
  shared: BattleBoardSharedProps;
  topZoneHeight: number;
  midZoneHeight: number;
  tappedCardIds: Set<string>;
  flippedCardIds: Set<string>;
  faceDownCardIds: Set<string>;
  counters: Record<string, Record<string, number>>;
  attachments: Record<string, string[]>;
  upgradedCardIds: Set<string>;
  upgradesByCardId: Map<string, CardType[]>;
  hiddenUpgradesByCardId: Map<string, CardType[]>;
  onRevealHiddenUpgrades: (cardId: string) => void;
  onCardDoubleClick: (card: CardType) => void;
  onContextMenu: (e: MouseEvent, card: CardType, zone: ZoneName) => void;
  onPileContextMenu:
    | ((e: MouseEvent, card: CardType, zone: ZoneName) => void)
    | undefined;
  onCardHover: ((cardId: string, zone: ZoneName) => void) | undefined;
}): ReactElement {
  const { battle, sizes, handHeight, bfHeight, zoneColumnWidth } = shared;
  const { your_zones } = battle;

  return (
    <div
      className="flex shrink-0 overflow-hidden"
      style={{ height: handHeight + bfHeight }}
    >
      <div className="flex flex-col flex-1 min-w-0">
        <div
          className="relative flex-1 min-w-0 battlefield overflow-hidden"
          data-guide-target="battle-battlefield"
        >
          <BattlefieldZone
            cards={your_zones.battlefield}
            selectedCardId={shared.selectedCardId}
            onCardClick={(card) => shared.onCardClick(card, "battlefield")}
            onCardDoubleClick={onCardDoubleClick}
            onCardContextMenu={(e, card) =>
              onContextMenu(e, card, "battlefield")
            }
            onCardHover={onCardHover}
            onCardHoverEnd={shared.onCardHoverEnd}
            tappedCardIds={tappedCardIds}
            flippedCardIds={flippedCardIds}
            faceDownCardIds={faceDownCardIds}
            counters={counters}
            attachments={attachments}
            separateLands
            upgradedCardIds={upgradedCardIds}
            upgradesByCardId={upgradesByCardId}
            hiddenUpgradesByCardId={hiddenUpgradesByCardId}
            onRevealHiddenUpgrades={onRevealHiddenUpgrades}
            poisonCount={battle.your_poison}
            cardDimensions={sizes.playerNonlands}
            rowHeight={sizes.rowHeight}
            landCardDimensions={sizes.playerLands}
            nonlandCardDimensions={sizes.playerNonlands}
          />
        </div>
        <div
          className="shrink-0 zone-hand overflow-hidden battle-hand-separator-top"
          style={{ height: handHeight }}
          data-guide-target="battle-hand"
        >
          <HandZone
            cards={your_zones.hand}
            selectedCardId={shared.selectedCardId}
            onCardClick={(card) => shared.onCardClick(card, "hand")}
            onCardContextMenu={(e, card) => onContextMenu(e, card, "hand")}
            onCardHover={onCardHover}
            onCardHoverEnd={shared.onCardHoverEnd}
            upgradedCardIds={upgradedCardIds}
            upgradesByCardId={upgradesByCardId}
            hiddenUpgradesByCardId={hiddenUpgradesByCardId}
            onRevealHiddenUpgrades={onRevealHiddenUpgrades}
            cardDimensions={sizes.playerHand}
            gap={sizes.playerHandGap}
          />
        </div>
      </div>

      <div
        className="flex flex-col shrink-0 battle-side-column battle-side-column-player"
        style={{ width: zoneColumnWidth }}
      >
        <CompactZoneDisplay
          title="Exile"
          zone="exile"
          cards={your_zones.exile}
          height={topZoneHeight}
          width={zoneColumnWidth}
          validFromZones={ALL_BATTLE_ZONES}
          onCardHover={onCardHover}
          onCardHoverEnd={shared.onCardHoverEnd}
          selectedCardId={shared.selectedCardId}
          onZoneClick={() => shared.onZoneClick("exile", "player")}
          onCardClick={shared.onCardClick}
          onCardContextMenu={onPileContextMenu}
          upgradedCardIds={upgradedCardIds}
          upgradesByCardId={upgradesByCardId}
          hiddenUpgradesByCardId={hiddenUpgradesByCardId}
          onRevealHiddenUpgrades={onRevealHiddenUpgrades}
          containerClassName="battle-side-cell"
          isModalOpen={shared.isZoneModalOpen("exile", "player")}
          onModalOpenChange={(open) =>
            shared.onZoneModalOpenChange("exile", "player", open)
          }
        />
        <CompactZoneDisplay
          title="Graveyard"
          zone="graveyard"
          cards={your_zones.graveyard}
          height={midZoneHeight}
          width={zoneColumnWidth}
          validFromZones={ALL_BATTLE_ZONES}
          onCardHover={onCardHover}
          onCardHoverEnd={shared.onCardHoverEnd}
          selectedCardId={shared.selectedCardId}
          onZoneClick={() => shared.onZoneClick("graveyard", "player")}
          onCardClick={shared.onCardClick}
          onCardContextMenu={onPileContextMenu}
          upgradedCardIds={upgradedCardIds}
          upgradesByCardId={upgradesByCardId}
          hiddenUpgradesByCardId={hiddenUpgradesByCardId}
          onRevealHiddenUpgrades={onRevealHiddenUpgrades}
          containerClassName="battle-side-cell"
          isModalOpen={shared.isZoneModalOpen("graveyard", "player")}
          onModalOpenChange={(open) =>
            shared.onZoneModalOpenChange("graveyard", "player", open)
          }
        />
        <CompactZoneDisplay
          title="Library"
          zone="library"
          cards={your_zones.library}
          height={handHeight}
          width={zoneColumnWidth}
          validFromZones={ALL_BATTLE_ZONES}
          onCardHover={onCardHover}
          onCardHoverEnd={shared.onCardHoverEnd}
          forceFaceDown
          selectedCardId={shared.selectedCardId}
          onZoneClick={() => shared.onZoneClick("library", "player")}
          onCardClick={shared.onCardClick}
          upgradedCardIds={upgradedCardIds}
          upgradesByCardId={upgradesByCardId}
          hiddenUpgradesByCardId={hiddenUpgradesByCardId}
          onRevealHiddenUpgrades={onRevealHiddenUpgrades}
          containerClassName="battle-side-cell"
          onContextMenu={(event) =>
            shared.onLibraryContextMenu({
              event,
              owner: "player",
              count: your_zones.library.length,
              canOpen: true,
            })
          }
          modalHeaderActions={
            your_zones.library.length > 0 ? (
              <LibraryHeaderButtons
                onDraw={() => shared.onLibraryAction("draw_library", "player")}
                onShuffle={() =>
                  shared.onLibraryAction("shuffle_library", "player")
                }
              />
            ) : undefined
          }
          isModalOpen={shared.isZoneModalOpen("library", "player")}
          onModalOpenChange={(open) =>
            shared.onZoneModalOpenChange("library", "player", open)
          }
        />
      </div>
    </div>
  );
}

function isCardAttachedIn(
  attachments: Record<string, string[]>,
  cardId: string,
): boolean {
  return Object.values(attachments).some((children) =>
    children.includes(cardId),
  );
}

export function BattleMenus({
  contextMenu,
  zoneContextMenu,
  yourZones,
  opponentZones,
  tappedCardIds,
  flippedCardIds,
  opponentTappedIds,
  opponentFlippedIds,
  canManipulateOpponent,
  onAction,
  onMove,
  onCloseCardMenu,
  onLibraryAction,
  onCloseZoneMenu,
}: {
  contextMenu: BattleCardMenu | null;
  zoneContextMenu: {
    owner: ZoneOwner;
    position: { x: number; y: number };
  } | null;
  yourZones: Zones;
  opponentZones: Zones;
  tappedCardIds: Set<string>;
  flippedCardIds: Set<string>;
  opponentTappedIds: Set<string>;
  opponentFlippedIds: Set<string>;
  canManipulateOpponent: boolean;
  onAction: (action: CardStateAction, data?: Record<string, unknown>) => void;
  onMove: (toZone: ZoneName, toOwner?: ZoneOwner) => void;
  onCloseCardMenu: () => void;
  onLibraryAction: (
    action: "draw_library" | "shuffle_library",
    owner: ZoneOwner,
  ) => void;
  onCloseZoneMenu: () => void;
}): ReactElement {
  const activeZones = contextMenu?.isOpponent ? opponentZones : yourZones;
  const activeTapped = contextMenu?.isOpponent
    ? opponentTappedIds
    : tappedCardIds;
  const activeFlipped = contextMenu?.isOpponent
    ? opponentFlippedIds
    : flippedCardIds;

  return (
    <>
      {contextMenu && (
        <CardActionMenu
          card={contextMenu.card}
          position={contextMenu.position}
          zone={contextMenu.zone}
          isTapped={activeTapped.has(contextMenu.card.id)}
          isFlipped={activeFlipped.has(contextMenu.card.id)}
          counters={activeZones.counters[contextMenu.card.id] ?? {}}
          isAttached={isCardAttachedIn(
            activeZones.attachments,
            contextMenu.card.id,
          )}
          battlefieldCards={activeZones.battlefield}
          isOpponent={contextMenu.isOpponent}
          canManipulateOpponent={canManipulateOpponent}
          onAction={onAction}
          onMove={onMove}
          onClose={onCloseCardMenu}
        />
      )}
      {zoneContextMenu && (
        <ZoneActionMenu
          position={zoneContextMenu.position}
          onDraw={() => onLibraryAction("draw_library", zoneContextMenu.owner)}
          onShuffle={() =>
            onLibraryAction("shuffle_library", zoneContextMenu.owner)
          }
          onClose={onCloseZoneMenu}
        />
      )}
    </>
  );
}
