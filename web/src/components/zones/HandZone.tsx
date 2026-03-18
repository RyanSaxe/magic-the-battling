import type { Card as CardType, ZoneName } from "../../types";
import type { CardDimensions } from "../../hooks/useViewportCardSizes";
import { DraggableCard, DroppableZone } from "../../dnd";

interface HandZoneProps {
  cards: CardType[];
  selectedCardId?: string;
  onCardClick?: (card: CardType) => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  validFromZones?: ZoneName[];
  draggable?: boolean;
  zone?: ZoneName;
  upgradedCardIds?: Set<string>;
  upgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
  cardDimensions?: CardDimensions;
  gap?: number;
}

export function HandZone({
  cards,
  selectedCardId,
  onCardClick,
  onCardHover,
  onCardHoverEnd,
  onCardContextMenu,
  validFromZones = [
    "hand",
    "battlefield",
    "graveyard",
    "exile",
    "library",
    "sideboard",
    "command_zone",
  ],
  draggable = true,
  zone = "hand",
  upgradedCardIds = new Set(),
  upgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
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
      {cards.map((card, i) => {
        const isOverlapping = gap !== undefined && gap < 0
        const zIndex = isOverlapping
          ? card.id === selectedCardId ? cards.length + 1 : cards.length - i
          : undefined
        return (
          <DraggableCard
            key={card.id}
            card={card}
            zone={zone}
            dimensions={cardDimensions}
            selected={card.id === selectedCardId}
            onClick={() => onCardClick?.(card)}
            onContextMenu={onCardContextMenu ? (e) => onCardContextMenu(e, card) : undefined}
            disabled={!draggable}
            upgraded={upgradedCardIds.has(card.id)}
            appliedUpgrades={upgradesByCardId?.get(card.id)}
            hiddenUpgradeCount={(hiddenUpgradesByCardId?.get(card.id) ?? []).length}
            onRevealHiddenUpgrades={onRevealHiddenUpgrades ? () => onRevealHiddenUpgrades(card.id) : undefined}
            onCardHover={onCardHover}
            onCardHoverEnd={onCardHoverEnd}
            style={{ ...(isOverlapping && i > 0 ? { marginLeft: gap } : undefined), ...(zIndex !== undefined ? { zIndex } : undefined) }}
          />
        )
      })}
    </DroppableZone>
  );
}
