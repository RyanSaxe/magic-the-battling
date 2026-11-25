import type { ReactElement } from "react";
import type { Card as CardType, ZoneName } from "../../types";
import type { CardDimensions } from "../../hooks/useViewportCardSizes";
import { DraggableCard, DroppableZone } from "../../dnd";

const DEFAULT_VALID_FROM_ZONES: ZoneName[] = [
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "library",
  "sideboard",
  "command_zone",
];
const EMPTY_STRING_SET: Set<string> = new Set();

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

function getHandCardStyle(options: {
  gap?: number;
  index: number;
  total: number;
  selected: boolean;
}): React.CSSProperties {
  if (options.gap === undefined || options.gap >= 0) return {};
  const zIndex = options.selected
    ? options.total + 1
    : options.total - options.index;
  return {
    ...(options.index > 0 ? { marginLeft: options.gap } : undefined),
    zIndex,
  };
}

export function HandZone({
  cards,
  selectedCardId,
  onCardClick,
  onCardHover,
  onCardHoverEnd,
  onCardContextMenu,
  validFromZones = DEFAULT_VALID_FROM_ZONES,
  draggable = true,
  zone = "hand",
  upgradedCardIds = EMPTY_STRING_SET,
  upgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
  cardDimensions,
  gap,
}: HandZoneProps): ReactElement {
  const zoneStyle = gap === undefined ? undefined : { gap: Math.max(0, gap) };

  return (
    <DroppableZone
      zone={zone}
      validFromZones={validFromZones}
      className="hand-zone w-full h-full flex-nowrap"
      style={zoneStyle}
    >
      {cards.map((card, i) => {
        const selected = card.id === selectedCardId;
        const hiddenUpgradeCount =
          hiddenUpgradesByCardId?.get(card.id)?.length ?? 0;
        return (
          <DraggableCard
            key={card.id}
            card={card}
            zone={zone}
            dimensions={cardDimensions}
            selected={selected}
            onClick={() => onCardClick?.(card)}
            onContextMenu={
              onCardContextMenu
                ? (e): void => onCardContextMenu(e, card)
                : undefined
            }
            disabled={!draggable}
            upgraded={upgradedCardIds.has(card.id)}
            appliedUpgrades={upgradesByCardId?.get(card.id)}
            hiddenUpgradeCount={hiddenUpgradeCount}
            onRevealHiddenUpgrades={
              onRevealHiddenUpgrades
                ? (): void => onRevealHiddenUpgrades(card.id)
                : undefined
            }
            onCardHover={onCardHover}
            onCardHoverEnd={onCardHoverEnd}
            style={getHandCardStyle({
              gap,
              index: i,
              total: cards.length,
              selected,
            })}
          />
        );
      })}
    </DroppableZone>
  );
}
