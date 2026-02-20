import type { Card as CardType, ZoneName } from "../../types";
import type { CardDimensions } from "../../hooks/useViewportCardSizes";
import { DraggableCard, DroppableZone } from "../../dnd";
import { AttachedCardStack } from "../card";
import { PoisonCard } from "../common/PoisonCard";

const isLandOrTreasure = (card: CardType) =>
  card.type_line.toLowerCase().includes("land") ||
  card.type_line.toLowerCase().includes("treasure");

const isTreasureToken = (card: CardType) =>
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
  poisonCount?: number;
  rowHeight?: number;
  landCardDimensions?: CardDimensions;
  nonlandCardDimensions?: CardDimensions;
}

export function BattlefieldZone({
  cards,
  selectedCardId,
  onCardClick,
  onCardDoubleClick,
  onCardContextMenu,
  onCardHover,
  onCardHoverEnd,
  tappedCardIds = new Set(),
  faceDownCardIds = new Set(),
  counters = {},
  attachments = {},
  validFromZones = ["hand", "battlefield", "graveyard", "exile", "sideboard", "command_zone"],
  draggable = true,
  isOpponent = false,
  canManipulateOpponent = false,
  label,
  separateLands = false,
  cardDimensions,
  upgradedCardIds = new Set(),
  upgradesByCardId,
  poisonCount = 0,
  rowHeight,
  landCardDimensions,
  nonlandCardDimensions,
}: BattlefieldZoneProps) {
  const allowInteraction = !isOpponent || canManipulateOpponent;
  const attachedCardIds = new Set(Object.values(attachments).flat());
  const topLevelCards = cards.filter((c) => !attachedCardIds.has(c.id));

  const lands = separateLands ? topLevelCards.filter(isLandOrTreasure) : [];
  const permanents = separateLands
    ? topLevelCards.filter((c) => !isLandOrTreasure(c))
    : topLevelCards;

  const getAttachedCards = (parentId: string): CardType[] => {
    const childIds = attachments[parentId] || [];
    return childIds
      .map((id) => cards.find((c) => c.id === id))
      .filter((c): c is CardType => !!c);
  };

  const renderCard = (card: CardType, dims?: CardDimensions) => {
    const resolvedDims = dims ?? cardDimensions;
    const attachedCards = getAttachedCards(card.id);

    if (attachedCards.length > 0) {
      return (
        <AttachedCardStack
          key={card.id}
          parentCard={card}
          attachedCards={attachedCards}
          dimensions={resolvedDims}
          parentTapped={tappedCardIds.has(card.id)}
          parentFaceDown={faceDownCardIds.has(card.id)}
          parentCounters={counters[card.id]}
          attachedTappedIds={tappedCardIds}
          attachedFaceDownIds={faceDownCardIds}
          attachedCounters={counters}
          selectedCardId={selectedCardId}
          onCardClick={onCardClick}
          onCardDoubleClick={onCardDoubleClick}
          onCardContextMenu={onCardContextMenu}
          upgradedCardIds={upgradedCardIds}
          upgradesByCardId={upgradesByCardId}
        />
      );
    }

    const zoneOwner = isOpponent ? "opponent" : ("player" as const);

    return (
      <div
        key={card.id}
        onContextMenu={(e) => {
          if (allowInteraction) {
            e.preventDefault();
            onCardContextMenu?.(e, card);
          }
        }}
      >
        <DraggableCard
          card={card}
          zone="battlefield"
          zoneOwner={zoneOwner}
          dimensions={resolvedDims}
          selected={card.id === selectedCardId}
          tapped={tappedCardIds.has(card.id)}
          faceDown={faceDownCardIds.has(card.id)}
          counters={counters[card.id]}
          onClick={() => onCardClick?.(card)}
          onDoubleClick={() => onCardDoubleClick?.(card)}
          disabled={!draggable || !allowInteraction}
          isOpponent={isOpponent}
          upgraded={upgradedCardIds.has(card.id)}
          appliedUpgrades={upgradesByCardId?.get(card.id)}
          onCardHover={allowInteraction ? onCardHover : undefined}
          onCardHoverEnd={allowInteraction ? onCardHoverEnd : undefined}
        />
      </div>
    );
  };

  const zoneOwner = isOpponent ? "opponent" : ("player" as const);

  const minH = cardDimensions ? cardDimensions.height : 112;
  const compact = cardDimensions ? cardDimensions.height <= 70 : false;
  const fixedRows = rowHeight != null && rowHeight > 0;

  if (fixedRows) {
    const actualLands = lands.filter((c) => !isTreasureToken(c));
    const treasures = lands.filter(isTreasureToken);
    const treasureOverlap = landCardDimensions
      ? Math.round(landCardDimensions.width * 0.6)
      : 0;

    return (
      <DroppableZone
        zone="battlefield"
        zoneOwner={zoneOwner}
        validFromZones={validFromZones}
        disabled={!allowInteraction}
        className="battlefield p-2"
      >
        <div
          className={`flex flex-col gap-1.5 ${isOpponent ? "flex-col-reverse" : ""}`}
        >
          <div
            className="flex items-center justify-center flex-nowrap gap-1.5 overflow-hidden"
            style={{ height: rowHeight }}
          >
            {permanents.map((c) => renderCard(c, nonlandCardDimensions))}
          </div>
          {separateLands && (
            <div
              className="flex items-center justify-center flex-nowrap gap-1.5 overflow-hidden"
              style={{ height: rowHeight }}
            >
              {actualLands.map((c) => renderCard(c, landCardDimensions))}
              {treasures.length > 0 && (
                <div className="flex items-center flex-nowrap shrink-0">
                  {treasures.map((c, i) => (
                    <div key={c.id} style={i > 0 ? { marginLeft: -treasureOverlap } : undefined}>
                      {renderCard(c, landCardDimensions)}
                    </div>
                  ))}
                </div>
              )}
              {landCardDimensions && (
                <PoisonCard count={poisonCount} dimensions={landCardDimensions} />
              )}
            </div>
          )}
        </div>
      </DroppableZone>
    );
  }

  return (
    <DroppableZone
      zone="battlefield"
      zoneOwner={zoneOwner}
      validFromZones={validFromZones}
      disabled={!allowInteraction}
      className={`battlefield flex-1 ${compact ? 'p-1' : 'p-4'}`}
    >
      {label && (
        <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">
          {label}
        </div>
      )}
      <div
        className={`flex flex-col gap-1.5 ${isOpponent ? "flex-col-reverse" : ""}`}
        style={{ minHeight: minH }}
      >
        <div
          className="flex justify-center flex-wrap gap-1.5"
          style={{ minHeight: minH }}
        >
          {permanents.length === 0 && lands.length === 0 ? (
            <div className="text-gray-500 text-sm opacity-50">
              {isOpponent ? "Opponent's battlefield" : "Empty battlefield"}
            </div>
          ) : (
            permanents.map((c) => renderCard(c))
          )}
        </div>
        {separateLands && lands.length > 0 && (
          <div className="flex justify-center flex-wrap gap-1.5">
            {lands.map((c) => renderCard(c))}
          </div>
        )}
      </div>
    </DroppableZone>
  );
}
