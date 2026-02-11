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
  upgradesByCardId?: Map<string, CardType[]>;
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
  upgradesByCardId,
  cardDimensions,
}: HandZoneProps) {
  return (
    <DroppableZone
      zone={zone}
      validFromZones={validFromZones}
      className="hand-zone w-full h-full flex-nowrap"
    >
      {cards.map((card) => (
        <DraggableCard
          key={card.id}
          card={card}
          zone={zone}
          dimensions={cardDimensions}
          selected={card.id === selectedCardId}
          onClick={() => onCardClick?.(card)}
          disabled={!draggable}
          upgraded={upgradedCardIds.has(card.id)}
          appliedUpgrades={upgradesByCardId?.get(card.id)}
        />
      ))}
    </DroppableZone>
  );
}
