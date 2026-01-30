import type { Card as CardType, ZoneName } from "../../types";
import { DraggableCard, DroppableZone } from "../../dnd";
import { AttachedCardStack } from "../card";

const isLandOrTreasure = (card: CardType) =>
  card.type_line.toLowerCase().includes("land") ||
  card.type_line.toLowerCase().includes("treasure");

interface BattlefieldZoneProps {
  cards: CardType[];
  selectedCardId?: string;
  onCardClick?: (card: CardType) => void;
  onCardDoubleClick?: (card: CardType) => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
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
  cardSize?: "xs" | "sm" | "md" | "lg";
  upgradedCardIds?: Set<string>;
}

export function BattlefieldZone({
  cards,
  selectedCardId,
  onCardClick,
  onCardDoubleClick,
  onCardContextMenu,
  tappedCardIds = new Set(),
  faceDownCardIds = new Set(),
  counters = {},
  attachments = {},
  validFromZones = ["hand", "graveyard", "exile", "command_zone"],
  draggable = true,
  isOpponent = false,
  canManipulateOpponent = false,
  label,
  separateLands = false,
  cardSize = "sm",
  upgradedCardIds = new Set(),
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

  const renderCard = (card: CardType) => {
    const attachedCards = getAttachedCards(card.id);

    if (attachedCards.length > 0) {
      return (
        <AttachedCardStack
          key={card.id}
          parentCard={card}
          attachedCards={attachedCards}
          size={cardSize}
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
          size={cardSize}
          selected={card.id === selectedCardId}
          tapped={tappedCardIds.has(card.id)}
          faceDown={faceDownCardIds.has(card.id)}
          counters={counters[card.id]}
          onClick={() => onCardClick?.(card)}
          onDoubleClick={() => onCardDoubleClick?.(card)}
          disabled={!draggable || !allowInteraction}
          isOpponent={isOpponent}
          upgraded={upgradedCardIds.has(card.id)}
        />
      </div>
    );
  };

  const zoneOwner = isOpponent ? "opponent" : ("player" as const);

  return (
    <DroppableZone
      zone="battlefield"
      zoneOwner={zoneOwner}
      validFromZones={validFromZones}
      disabled={!allowInteraction}
      className="battlefield flex-1 p-4"
    >
      {label && (
        <div className="text-xs text-gray-400 mb-2 uppercase tracking-wide">
          {label}
        </div>
      )}
      <div
        className={`flex flex-col gap-2 min-h-[112px] ${isOpponent ? "flex-col-reverse" : ""}`}
      >
        {/* Permanents (non-lands) */}
        <div className="flex justify-center flex-wrap gap-3 min-h-[112px]">
          {permanents.length === 0 && lands.length === 0 ? (
            <div className="text-gray-500 text-sm opacity-50">
              {isOpponent ? "Opponent's battlefield" : "Empty battlefield"}
            </div>
          ) : (
            permanents.map(renderCard)
          )}
        </div>
        {/* Lands (separate row if enabled) */}
        {separateLands && lands.length > 0 && (
          <div className="flex justify-center flex-wrap gap-2">
            {lands.map(renderCard)}
          </div>
        )}
      </div>
    </DroppableZone>
  );
}
