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
  gap?: number;
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
  gap,
}: HandZoneProps) {
  const zoneStyle = gap !== undefined ? { gap: Math.max(0, gap) } : undefined

  return (
    <DroppableZone
      zone={zone}
      validFromZones={validFromZones}
      className="hand-zone w-full h-full flex-nowrap"
      style={zoneStyle}
    >
      {cards.map((card, i) => (
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
          style={gap !== undefined && gap < 0 && i > 0 ? { marginLeft: gap } : undefined}
        />
      ))}
    </DroppableZone>
  );
}
