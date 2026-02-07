import type { Card as CardType, ZoneName } from "../../types";
import type { CardDimensions } from "../../hooks/useViewportCardSizes";
import { DraggableCard, DroppableZone } from "../../dnd";

interface HandZoneProps {
  cards: CardType[];
  selectedCardId?: string;
  onCardClick?: (card: CardType) => void;
  validFromZones?: ZoneName[];
  draggable?: boolean;
  zone?: ZoneName;
  upgradedCardIds?: Set<string>;
  cardDimensions?: CardDimensions;
}

export function HandZone({
  cards,
  selectedCardId,
  onCardClick,
  validFromZones = [
    "hand",
    "battlefield",
    "graveyard",
    "exile",
    "sideboard",
    "command_zone",
  ],
  draggable = true,
  zone = "hand",
  upgradedCardIds = new Set(),
  cardDimensions,
}: HandZoneProps) {
  const overlap = cardDimensions ? Math.round(cardDimensions.width * 0.3) : 0;

  return (
    <DroppableZone
      zone={zone}
      validFromZones={validFromZones}
      className="hand-zone w-full"
    >
      {cards.map((card, index) => (
        <div
          key={card.id}
          style={cardDimensions ? { marginLeft: index === 0 ? 0 : -overlap } : undefined}
        >
          <DraggableCard
            card={card}
            zone={zone}
            dimensions={cardDimensions}
            selected={card.id === selectedCardId}
            onClick={() => onCardClick?.(card)}
            disabled={!draggable}
            upgraded={upgradedCardIds.has(card.id)}
          />
        </div>
      ))}
    </DroppableZone>
  );
}
