import type { ReactElement } from "react";
import type { Card as CardType, ZoneName } from "../../types";
import type { ZoneOwner } from "../../dnd/types";
import type { CardDimensions } from "../../hooks/useViewportCardSizes";
import { DraggableCard, DroppableZone } from "../../dnd";
import { AttachedCardStack } from "../card";
import { PoisonCard } from "../common/PoisonCard";
import {
  canInteractWithBattleCard,
  canInteractWithBattleZone,
} from "../../utils/battleInteraction";

const EMPTY_STRING_SET: Set<string> = new Set();
const EMPTY_COUNTERS: Record<string, Record<string, number>> = {};
const EMPTY_ATTACHMENTS: Record<string, string[]> = {};
const DEFAULT_VALID_FROM_ZONES: ZoneName[] = [
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "sideboard",
  "command_zone",
  "library",
];

const isLandOrTreasure = (card: CardType): boolean =>
  card.type_line.toLowerCase().includes("land") ||
  card.type_line.toLowerCase().includes("treasure");

const isTreasureToken = (card: CardType): boolean =>
  card.type_line.toLowerCase().includes("treasure") &&
  !card.type_line.toLowerCase().includes("land");

interface BattlefieldZoneProps {
  cards: CardType[];
  selectedCardId?: string;
  onCardClick?: (card: CardType) => void;
  onCardDoubleClick?: (card: CardType) => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  tappedCardIds?: Set<string>;
  flippedCardIds?: Set<string>;
  faceDownCardIds?: Set<string>;
  counters?: Record<string, Record<string, number>>;
  attachments?: Record<string, string[]>;
  validFromZones?: ZoneName[];
  draggable?: boolean;
  isOpponent?: boolean;
  canManipulateOpponent?: boolean;
  label?: string;
  separateLands?: boolean;
  cardDimensions?: CardDimensions;
  upgradedCardIds?: Set<string>;
  upgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
  poisonCount?: number;
  rowHeight?: number;
  landCardDimensions?: CardDimensions;
  nonlandCardDimensions?: CardDimensions;
  canPeekFaceDown?: boolean;
}

interface BattlefieldCardRenderContext {
  allCards: CardType[];
  zoneOwner: ZoneOwner;
  isOpponent: boolean;
  draggable: boolean;
  selectedCardId?: string;
  tappedCardIds: Set<string>;
  flippedCardIds: Set<string>;
  counters: Record<string, Record<string, number>>;
  attachments: Record<string, string[]>;
  upgradedCardIds: Set<string>;
  upgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  canPeekFaceDown?: boolean;
  canInteractWithCard: (card: CardType) => boolean;
  onCardClick?: (card: CardType) => void;
  onCardDoubleClick?: (card: CardType) => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}

interface BattlefieldCardItemProps {
  card: CardType;
  dimensions?: CardDimensions;
  ctx: BattlefieldCardRenderContext;
}

function getAttachedCardsFor(
  parentId: string,
  allCards: CardType[],
  attachments: Record<string, string[]>,
): CardType[] {
  const childIds = attachments[parentId] ?? [];
  return childIds
    .map((id) => allCards.find((c) => c.id === id))
    .filter((c): c is CardType => Boolean(c));
}

function buildSingleCardHandlers(
  card: CardType,
  ctx: BattlefieldCardRenderContext,
  allowCardInteraction: boolean,
): {
  onClick?: () => void;
  onDoubleClick?: () => void;
  onRevealHiddenUpgrades?: () => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
} {
  return {
    onClick: allowCardInteraction
      ? (): void => ctx.onCardClick?.(card)
      : undefined,
    onDoubleClick: allowCardInteraction
      ? (): void => ctx.onCardDoubleClick?.(card)
      : undefined,
    onRevealHiddenUpgrades: ctx.onRevealHiddenUpgrades
      ? (): void => ctx.onRevealHiddenUpgrades?.(card.id)
      : undefined,
    onCardHover: allowCardInteraction ? ctx.onCardHover : undefined,
    onCardHoverEnd: allowCardInteraction ? ctx.onCardHoverEnd : undefined,
  };
}

function SingleBattlefieldCard({
  card,
  dimensions,
  ctx,
}: BattlefieldCardItemProps): ReactElement {
  const allowCardInteraction = ctx.canInteractWithCard(card);
  const handlers = buildSingleCardHandlers(card, ctx, allowCardInteraction);

  return (
    <div
      onContextMenu={(e) => {
        if (allowCardInteraction) {
          e.preventDefault();
          ctx.onCardContextMenu?.(e, card);
        }
      }}
    >
      <DraggableCard
        card={card}
        zone="battlefield"
        zoneOwner={ctx.zoneOwner}
        dimensions={dimensions}
        selected={card.id === ctx.selectedCardId}
        tapped={ctx.tappedCardIds.has(card.id)}
        flipped={ctx.flippedCardIds.has(card.id)}
        counters={ctx.counters[card.id]}
        onClick={handlers.onClick}
        onDoubleClick={handlers.onDoubleClick}
        disabled={!ctx.draggable || !allowCardInteraction || !card.name}
        isOpponent={ctx.isOpponent}
        upgraded={ctx.upgradedCardIds.has(card.id)}
        appliedUpgrades={ctx.upgradesByCardId?.get(card.id)}
        hiddenUpgradeCount={
          ctx.hiddenUpgradesByCardId?.get(card.id)?.length ?? 0
        }
        onRevealHiddenUpgrades={handlers.onRevealHiddenUpgrades}
        canPeekFaceDown={ctx.canPeekFaceDown}
        onCardHover={handlers.onCardHover}
        onCardHoverEnd={handlers.onCardHoverEnd}
      />
    </div>
  );
}

function BattlefieldCardItem({
  card,
  dimensions,
  ctx,
}: BattlefieldCardItemProps): ReactElement {
  const attachedCards = getAttachedCardsFor(
    card.id,
    ctx.allCards,
    ctx.attachments,
  );

  if (attachedCards.length > 0) {
    return (
      <AttachedCardStack
        parentCard={card}
        attachedCards={attachedCards}
        dimensions={dimensions}
        parentTapped={ctx.tappedCardIds.has(card.id)}
        parentCounters={ctx.counters[card.id]}
        attachedTappedIds={ctx.tappedCardIds}
        attachedCounters={ctx.counters}
        selectedCardId={ctx.selectedCardId}
        onCardClick={ctx.onCardClick}
        onCardDoubleClick={ctx.onCardDoubleClick}
        onCardContextMenu={ctx.onCardContextMenu}
        allowCardInteraction={ctx.canInteractWithCard}
        upgradedCardIds={ctx.upgradedCardIds}
        upgradesByCardId={ctx.upgradesByCardId}
        hiddenUpgradesByCardId={ctx.hiddenUpgradesByCardId}
        onRevealHiddenUpgrades={ctx.onRevealHiddenUpgrades}
      />
    );
  }

  return (
    <SingleBattlefieldCard card={card} dimensions={dimensions} ctx={ctx} />
  );
}

interface FixedRowsBattlefieldProps {
  permanents: CardType[];
  lands: CardType[];
  separateLands: boolean;
  rowHeight: number;
  isOpponent: boolean;
  poisonCount: number;
  landCardDimensions?: CardDimensions;
  nonlandCardDimensions?: CardDimensions;
  cardDimensions?: CardDimensions;
  ctx: BattlefieldCardRenderContext;
}

function FixedRowsBattlefield({
  permanents,
  lands,
  separateLands,
  rowHeight,
  isOpponent,
  poisonCount,
  landCardDimensions,
  nonlandCardDimensions,
  cardDimensions,
  ctx,
}: FixedRowsBattlefieldProps): ReactElement {
  const actualLands = lands.filter((c) => !isTreasureToken(c));
  const treasures = lands.filter(isTreasureToken);
  const treasureOverlap = landCardDimensions
    ? Math.round(landCardDimensions.width * 0.6)
    : 0;
  const nonlandDims = nonlandCardDimensions ?? cardDimensions;
  const landDims = landCardDimensions ?? cardDimensions;

  return (
    <div
      className={`flex flex-col gap-1.5 ${isOpponent ? "flex-col-reverse" : ""}`}
    >
      <div
        className="flex items-center justify-center flex-nowrap gap-1.5 overflow-hidden"
        style={{ height: rowHeight }}
      >
        {permanents.map((c) => (
          <BattlefieldCardItem
            key={c.id}
            card={c}
            dimensions={nonlandDims}
            ctx={ctx}
          />
        ))}
      </div>
      {separateLands && (
        <div
          className="flex items-center justify-center flex-nowrap gap-1.5 overflow-hidden"
          style={{ height: rowHeight }}
        >
          {actualLands.map((c) => (
            <BattlefieldCardItem
              key={c.id}
              card={c}
              dimensions={landDims}
              ctx={ctx}
            />
          ))}
          {treasures.length > 0 && (
            <div className="flex items-center flex-nowrap shrink-0">
              {treasures.map((c, i) => (
                <div
                  key={c.id}
                  style={i > 0 ? { marginLeft: -treasureOverlap } : undefined}
                >
                  <BattlefieldCardItem
                    card={c}
                    dimensions={landDims}
                    ctx={ctx}
                  />
                </div>
              ))}
            </div>
          )}
          {landCardDimensions && (
            <PoisonCard
              count={poisonCount}
              dimensions={landCardDimensions}
              owner={isOpponent ? "opponent" : "player"}
            />
          )}
        </div>
      )}
    </div>
  );
}

interface FlowBattlefieldProps {
  permanents: CardType[];
  lands: CardType[];
  separateLands: boolean;
  isOpponent: boolean;
  label?: string;
  minHeight: number;
  cardDimensions?: CardDimensions;
  ctx: BattlefieldCardRenderContext;
}

function FlowBattlefield({
  permanents,
  lands,
  separateLands,
  isOpponent,
  label,
  minHeight,
  cardDimensions,
  ctx,
}: FlowBattlefieldProps): ReactElement {
  const isEmpty = permanents.length === 0 && lands.length === 0;

  return (
    <>
      {label && (
        <div className="text-xs text-[var(--ivory-felt)] mb-2 uppercase tracking-wide">
          {label}
        </div>
      )}
      <div
        className={`flex flex-col gap-1.5 ${isOpponent ? "flex-col-reverse" : ""}`}
        style={{ minHeight }}
      >
        <div
          className="flex justify-center flex-wrap gap-1.5"
          style={{ minHeight }}
        >
          {isEmpty ? (
            <div className="text-[var(--ivory-felt)] text-sm">
              {isOpponent ? "Opponent's battlefield" : "Empty battlefield"}
            </div>
          ) : (
            permanents.map((c) => (
              <BattlefieldCardItem
                key={c.id}
                card={c}
                dimensions={cardDimensions}
                ctx={ctx}
              />
            ))
          )}
        </div>
        {separateLands && lands.length > 0 && (
          <div className="flex justify-center flex-wrap gap-1.5">
            {lands.map((c) => (
              <BattlefieldCardItem
                key={c.id}
                card={c}
                dimensions={cardDimensions}
                ctx={ctx}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function buildBattlefieldContext(
  props: BattlefieldZoneProps,
  zoneOwner: ZoneOwner,
): BattlefieldCardRenderContext {
  const faceDownCardIds = props.faceDownCardIds ?? EMPTY_STRING_SET;
  const canManipulateOpponent = Boolean(props.canManipulateOpponent);
  const canInteractWithCard = (card: CardType): boolean =>
    canInteractWithBattleCard({
      owner: zoneOwner,
      zone: "battlefield",
      canManipulateOpponent,
      isFaceDown: faceDownCardIds.has(card.id),
    });

  return {
    allCards: props.cards,
    zoneOwner,
    isOpponent: Boolean(props.isOpponent),
    draggable: props.draggable ?? true,
    selectedCardId: props.selectedCardId,
    tappedCardIds: props.tappedCardIds ?? EMPTY_STRING_SET,
    flippedCardIds: props.flippedCardIds ?? EMPTY_STRING_SET,
    counters: props.counters ?? EMPTY_COUNTERS,
    attachments: props.attachments ?? EMPTY_ATTACHMENTS,
    upgradedCardIds: props.upgradedCardIds ?? EMPTY_STRING_SET,
    upgradesByCardId: props.upgradesByCardId,
    hiddenUpgradesByCardId: props.hiddenUpgradesByCardId,
    canPeekFaceDown: props.canPeekFaceDown,
    canInteractWithCard,
    onCardClick: props.onCardClick,
    onCardDoubleClick: props.onCardDoubleClick,
    onCardContextMenu: props.onCardContextMenu,
    onCardHover: props.onCardHover,
    onCardHoverEnd: props.onCardHoverEnd,
    onRevealHiddenUpgrades: props.onRevealHiddenUpgrades,
  };
}

function partitionBattlefieldCards(
  cards: CardType[],
  attachments: Record<string, string[]>,
  separateLands: boolean,
): { permanents: CardType[]; lands: CardType[] } {
  const attachedCardIds = new Set(Object.values(attachments).flat());
  const topLevelCards = cards.filter((c) => !attachedCardIds.has(c.id));
  if (!separateLands) return { permanents: topLevelCards, lands: [] };
  return {
    permanents: topLevelCards.filter((c) => !isLandOrTreasure(c)),
    lands: topLevelCards.filter(isLandOrTreasure),
  };
}

export function BattlefieldZone(props: BattlefieldZoneProps): ReactElement {
  const isOpponent = Boolean(props.isOpponent);
  const separateLands = Boolean(props.separateLands);
  const zoneOwner: ZoneOwner = isOpponent ? "opponent" : "player";
  const allowZoneInteraction = canInteractWithBattleZone({
    owner: zoneOwner,
    zone: "battlefield",
    canManipulateOpponent: Boolean(props.canManipulateOpponent),
  });
  const ctx = buildBattlefieldContext(props, zoneOwner);
  const { permanents, lands } = partitionBattlefieldCards(
    props.cards,
    ctx.attachments,
    separateLands,
  );
  const validFromZones = props.validFromZones ?? DEFAULT_VALID_FROM_ZONES;

  if (props.rowHeight !== undefined && props.rowHeight > 0) {
    return (
      <DroppableZone
        zone="battlefield"
        zoneOwner={zoneOwner}
        validFromZones={validFromZones}
        disabled={!allowZoneInteraction}
        className="h-full p-2"
      >
        <FixedRowsBattlefield
          permanents={permanents}
          lands={lands}
          separateLands={separateLands}
          rowHeight={props.rowHeight}
          isOpponent={isOpponent}
          poisonCount={props.poisonCount ?? 0}
          landCardDimensions={props.landCardDimensions}
          nonlandCardDimensions={props.nonlandCardDimensions}
          cardDimensions={props.cardDimensions}
          ctx={ctx}
        />
      </DroppableZone>
    );
  }

  const minHeight = props.cardDimensions?.height ?? 112;
  const compact = minHeight <= 70;

  return (
    <DroppableZone
      zone="battlefield"
      zoneOwner={zoneOwner}
      validFromZones={validFromZones}
      disabled={!allowZoneInteraction}
      className={`h-full flex-1 ${compact ? "p-1" : "p-4"}`}
    >
      <FlowBattlefield
        permanents={permanents}
        lands={lands}
        separateLands={separateLands}
        isOpponent={isOpponent}
        label={props.label}
        minHeight={minHeight}
        cardDimensions={props.cardDimensions}
        ctx={ctx}
      />
    </DroppableZone>
  );
}
