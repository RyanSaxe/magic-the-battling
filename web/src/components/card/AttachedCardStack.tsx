import type { ReactElement } from "react";
import type { Card as CardType } from "../../types";
import { Card } from "./Card";

interface AttachedCardStackProps {
  parentCard: CardType;
  attachedCards: CardType[];
  size?: "xs" | "sm" | "md" | "lg";
  dimensions?: { width: number; height: number };
  parentTapped?: boolean;
  parentCounters?: Record<string, number>;
  attachedTappedIds?: Set<string>;
  attachedCounters?: Record<string, Record<string, number>>;
  selectedCardId?: string;
  onCardClick?: (card: CardType) => void;
  onCardDoubleClick?: (card: CardType) => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  allowCardInteraction?: (card: CardType) => boolean;
  upgradedCardIds?: Set<string>;
  upgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}

const PEEK_FRACTION = 0.15;
const ASPECT_RATIO = 7 / 5;
const EMPTY_STRING_SET: Set<string> = new Set();
const EMPTY_ATTACHED_COUNTERS: Record<string, Record<string, number>> = {};

const SIZE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  xs: { width: 50, height: 70 },
  sm: { width: 80, height: 112 },
  md: { width: 130, height: 182 },
  lg: { width: 200, height: 280 },
};

interface StackedCardItemProps {
  card: CardType;
  top: number;
  left: number;
  zIndex: number;
  dimensions: { width: number; height: number };
  tapped: boolean;
  counters?: Record<string, number>;
  selected: boolean;
  interactive: boolean;
  onCardClick?: (card: CardType) => void;
  onCardDoubleClick?: (card: CardType) => void;
  onCardContextMenu?: (e: React.MouseEvent, card: CardType) => void;
  upgraded: boolean;
  appliedUpgrades?: CardType[];
  hiddenUpgradeCount: number;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}

function StackedCardItem({
  card,
  top,
  left,
  zIndex,
  dimensions,
  tapped,
  counters,
  selected,
  interactive,
  onCardClick,
  onCardDoubleClick,
  onCardContextMenu,
  upgraded,
  appliedUpgrades,
  hiddenUpgradeCount,
  onRevealHiddenUpgrades,
}: StackedCardItemProps): ReactElement {
  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (!interactive) return;
    onCardContextMenu?.(e, card);
  };

  const handleClick = interactive
    ? (): void => {
        onCardClick?.(card);
      }
    : undefined;

  const handleDoubleClick = interactive
    ? (): void => {
        onCardDoubleClick?.(card);
      }
    : undefined;

  const handleReveal = onRevealHiddenUpgrades
    ? (): void => {
        onRevealHiddenUpgrades(card.id);
      }
    : undefined;

  return (
    <div
      className="absolute"
      style={{ top, left, zIndex }}
      onContextMenu={handleContextMenu}
    >
      <Card
        card={card}
        dimensions={dimensions}
        tapped={tapped}
        counters={counters}
        selected={selected}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        upgraded={upgraded}
        appliedUpgrades={appliedUpgrades}
        hiddenUpgradeCount={hiddenUpgradeCount}
        onRevealHiddenUpgrades={handleReveal}
      />
    </div>
  );
}

export function AttachedCardStack({
  parentCard,
  attachedCards,
  size = "md",
  dimensions,
  parentTapped = false,
  parentCounters,
  attachedTappedIds = EMPTY_STRING_SET,
  attachedCounters = EMPTY_ATTACHED_COUNTERS,
  selectedCardId,
  onCardClick,
  onCardDoubleClick,
  onCardContextMenu,
  allowCardInteraction,
  upgradedCardIds = EMPTY_STRING_SET,
  upgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
}: AttachedCardStackProps): ReactElement {
  const baseDims = dimensions ?? SIZE_DIMENSIONS[size];
  const n = attachedCards.length;

  const scaledHeight = Math.round(baseDims.height / (1 + n * PEEK_FRACTION));
  const scaledWidth = Math.round(scaledHeight / ASPECT_RATIO);
  const offset = Math.round(scaledHeight * PEEK_FRACTION);
  const leftOffset = Math.round((baseDims.width - scaledWidth) / 2);
  const scaledDims = { width: scaledWidth, height: scaledHeight };
  const isInteractive = (card: CardType): boolean =>
    allowCardInteraction ? allowCardInteraction(card) : true;
  const hiddenCount = (cardId: string): number =>
    hiddenUpgradesByCardId?.get(cardId)?.length ?? 0;

  return (
    <div
      className="relative"
      style={{ width: baseDims.width, height: baseDims.height }}
    >
      {attachedCards.map((card, index) => (
        <StackedCardItem
          key={card.id}
          card={card}
          top={index * offset}
          left={leftOffset}
          zIndex={index}
          dimensions={scaledDims}
          tapped={attachedTappedIds.has(card.id)}
          counters={attachedCounters[card.id]}
          selected={card.id === selectedCardId}
          interactive={isInteractive(card)}
          onCardClick={onCardClick}
          onCardDoubleClick={onCardDoubleClick}
          onCardContextMenu={onCardContextMenu}
          upgraded={upgradedCardIds.has(card.id)}
          appliedUpgrades={upgradesByCardId?.get(card.id)}
          hiddenUpgradeCount={hiddenCount(card.id)}
          onRevealHiddenUpgrades={onRevealHiddenUpgrades}
        />
      ))}
      <StackedCardItem
        card={parentCard}
        top={n * offset}
        left={leftOffset}
        zIndex={n}
        dimensions={scaledDims}
        tapped={parentTapped}
        counters={parentCounters}
        selected={parentCard.id === selectedCardId}
        interactive={isInteractive(parentCard)}
        onCardClick={onCardClick}
        onCardDoubleClick={onCardDoubleClick}
        onCardContextMenu={onCardContextMenu}
        upgraded={upgradedCardIds.has(parentCard.id)}
        appliedUpgrades={upgradesByCardId?.get(parentCard.id)}
        hiddenUpgradeCount={hiddenCount(parentCard.id)}
        onRevealHiddenUpgrades={onRevealHiddenUpgrades}
      />
    </div>
  );
}
