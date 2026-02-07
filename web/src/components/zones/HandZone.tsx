import type { Card as CardType, ZoneName } from "../../types";
import { DraggableCard, DroppableZone } from "../../dnd";

interface HandZoneProps {
  cards: CardType[];
  selectedCardId?: string;
  onCardClick?: (card: CardType) => void;
  validFromZones?: ZoneName[];
  draggable?: boolean;
  zone?: ZoneName;
  upgradedCardIds?: Set<string>;
  cardSize?: "xs" | "sm" | "md" | "lg";
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
  cardSize = "md",
}: HandZoneProps) {
  const sizeClass = cardSize === 'xs' ? ' hand-xs' : cardSize !== 'md' ? ' hand-compact' : '';
  return (
    <DroppableZone
      zone={zone}
      validFromZones={validFromZones}
      className={`hand-zone w-full${sizeClass}`}
    >
      {cards.map((card) => (
        <DraggableCard
          key={card.id}
          card={card}
          zone={zone}
          size={cardSize}
          selected={card.id === selectedCardId}
          onClick={() => onCardClick?.(card)}
          disabled={!draggable}
          upgraded={upgradedCardIds.has(card.id)}
        />
      ))}
    </DroppableZone>
  );
}
