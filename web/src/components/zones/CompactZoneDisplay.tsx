import { useState, type ReactElement } from "react";
import type { Card as CardType, ZoneName } from "../../types";
import type { ZoneOwner } from "../../dnd/types";
import { DraggableCard, DroppableZone, useGameDnd } from "../../dnd";
import { Card } from "../card";
import { ZoneModal } from "../sidebar/DroppableZoneDisplay";
import { makeDraggableId } from "../../dnd/types";
import {
  canInteractWithBattleCard,
  canInteractWithBattleZone,
} from "../../utils/battleInteraction";

const CARD_ASPECT = 5 / 7;
const LABEL_HEIGHT = 18;

interface CompactZoneDisplayProps {
  title: string;
  /** The open panel's title, when the pile's label doesn't say whose it is. */
  panelTitle?: string;
  zone: ZoneName;
  cards: CardType[];
  height: number;
  width: number;
  isOpponent?: boolean;
  canManipulateOpponent?: boolean;
  validFromZones: ZoneName[];
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  canPeekFaceDown?: boolean;
  selectedCardId?: string;
  onZoneClick?: () => void;
  onCardClick?: (card: CardType, zone: ZoneName, owner: ZoneOwner) => void;
  onCardContextMenu?: (
    e: React.MouseEvent,
    card: CardType,
    zone: ZoneName,
  ) => void;
  containerClassName?: string;
  forceFaceDown?: boolean;
  isModalOpen?: boolean;
  onModalOpenChange?: (open: boolean) => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  modalHeaderActions?: React.ReactNode;
  upgradedCardIds?: Set<string>;
  upgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}

function getCompactCardDimensions(
  width: number,
  height: number,
): { width: number; height: number } {
  const availW = width - 4;
  const availH = height - LABEL_HEIGHT;
  const cardW = Math.floor(Math.min(availW, availH * CARD_ASPECT));
  return { width: cardW, height: Math.floor(cardW / CARD_ASPECT) };
}

function resolvePileCards(options: {
  cards: CardType[];
  zone: ZoneName;
  zoneOwner: ZoneOwner;
  activeDraggableId: string | null;
}): { topCard?: CardType; nextCard?: CardType } {
  const topCard = options.cards[options.cards.length - 1];
  if (!topCard) return {};
  const topId = makeDraggableId({
    zone: options.zone,
    owner: options.zoneOwner,
    cardId: topCard.id,
    instanceKey: "compact",
  });
  const isDraggingTop = options.activeDraggableId === topId;
  return {
    topCard,
    nextCard: isDraggingTop
      ? options.cards[options.cards.length - 2]
      : undefined,
  };
}

function CompactNextCard({
  card,
  dimensions,
  forceFaceDown,
  upgradedCardIds,
  upgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
}: {
  card: CardType;
  dimensions: { width: number; height: number };
  forceFaceDown: boolean;
  upgradedCardIds?: Set<string>;
  upgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}): ReactElement {
  return (
    <div className="absolute">
      <Card
        card={card}
        dimensions={dimensions}
        faceDown={forceFaceDown}
        upgraded={upgradedCardIds?.has(card.id)}
        appliedUpgrades={upgradesByCardId?.get(card.id)}
        hiddenUpgradeCount={hiddenUpgradesByCardId?.get(card.id)?.length ?? 0}
        onRevealHiddenUpgrades={
          onRevealHiddenUpgrades
            ? (): void => onRevealHiddenUpgrades(card.id)
            : undefined
        }
      />
    </div>
  );
}

function buildTopCardCallbacks(options: {
  card: CardType;
  zone: ZoneName;
  allowCardInteraction: boolean;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onCardContextMenu?: (
    e: React.MouseEvent,
    card: CardType,
    zone: ZoneName,
  ) => void;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}): {
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onRevealHiddenUpgrades?: () => void;
} {
  return {
    onCardHover: options.allowCardInteraction ? options.onCardHover : undefined,
    onCardHoverEnd: options.allowCardInteraction
      ? options.onCardHoverEnd
      : undefined,
    onContextMenu:
      options.allowCardInteraction && options.onCardContextMenu
        ? (e: React.MouseEvent): void =>
            options.onCardContextMenu?.(e, options.card, options.zone)
        : undefined,
    onRevealHiddenUpgrades: options.onRevealHiddenUpgrades
      ? (): void => options.onRevealHiddenUpgrades?.(options.card.id)
      : undefined,
  };
}

function CompactTopCard({
  card,
  zone,
  zoneOwner,
  dimensions,
  allowCardInteraction,
  isOpponent,
  forceFaceDown,
  canPeekFaceDown,
  onCardHover,
  onCardHoverEnd,
  onCardContextMenu,
  upgradedCardIds,
  upgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
}: {
  card: CardType;
  zone: ZoneName;
  zoneOwner: ZoneOwner;
  dimensions: { width: number; height: number };
  allowCardInteraction: boolean;
  isOpponent: boolean;
  forceFaceDown: boolean;
  canPeekFaceDown?: boolean;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onCardContextMenu?: (
    e: React.MouseEvent,
    card: CardType,
    zone: ZoneName,
  ) => void;
  upgradedCardIds?: Set<string>;
  upgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}): ReactElement {
  const callbacks = buildTopCardCallbacks({
    card,
    zone,
    allowCardInteraction,
    onCardHover,
    onCardHoverEnd,
    onCardContextMenu,
    onRevealHiddenUpgrades,
  });

  return (
    <DraggableCard
      card={card}
      zone={zone}
      zoneOwner={zoneOwner}
      dragInstanceKey="compact"
      dimensions={dimensions}
      disabled={!allowCardInteraction}
      isOpponent={isOpponent}
      onCardHover={callbacks.onCardHover}
      onCardHoverEnd={callbacks.onCardHoverEnd}
      onContextMenu={callbacks.onContextMenu}
      faceDown={forceFaceDown}
      canPeekFaceDown={forceFaceDown ? false : canPeekFaceDown}
      upgraded={upgradedCardIds?.has(card.id)}
      appliedUpgrades={upgradesByCardId?.get(card.id)}
      hiddenUpgradeCount={hiddenUpgradesByCardId?.get(card.id)?.length ?? 0}
      onRevealHiddenUpgrades={callbacks.onRevealHiddenUpgrades}
    />
  );
}

export function CompactZoneDisplay(
  props: CompactZoneDisplayProps,
): ReactElement {
  const [uncontrolledModalOpen, setUncontrolledModalOpen] = useState(false);
  const isOpponent = Boolean(props.isOpponent);
  const canManipulateOpponent = Boolean(props.canManipulateOpponent);
  const forceFaceDown = Boolean(props.forceFaceDown);
  const zoneOwner: ZoneOwner = isOpponent ? "opponent" : "player";
  const allowZoneInteraction = canInteractWithBattleZone({
    owner: zoneOwner,
    zone: props.zone,
    canManipulateOpponent,
  });
  const allowCardInteraction = canInteractWithBattleCard({
    owner: zoneOwner,
    zone: props.zone,
    canManipulateOpponent,
    isFaceDown: forceFaceDown,
  });
  const showModal = props.isModalOpen ?? uncontrolledModalOpen;
  const setShowModal = props.onModalOpenChange ?? setUncontrolledModalOpen;

  const { activeDraggableId } = useGameDnd();
  const { topCard, nextCard } = resolvePileCards({
    cards: props.cards,
    zone: props.zone,
    zoneOwner,
    activeDraggableId,
  });
  const dimensions = getCompactCardDimensions(props.width, props.height);

  const handleZoneClick = (e: React.MouseEvent): void => {
    if (props.selectedCardId && props.onZoneClick) {
      e.stopPropagation();
      props.onZoneClick();
      return;
    }
    setShowModal(true);
  };

  return (
    <>
      <DroppableZone
        zone={props.zone}
        zoneOwner={zoneOwner}
        validFromZones={props.validFromZones}
        disabled={!allowZoneInteraction}
        className="box-border shrink-0 battle-side-dropzone"
        style={{ width: props.width, height: props.height }}
      >
        <div
          onContextMenu={props.onContextMenu}
          className={`relative flex flex-col items-center overflow-hidden ${props.containerClassName ?? ""} w-full h-full`}
        >
          <button
            type="button"
            aria-label={props.title}
            onClick={handleZoneClick}
            className="absolute inset-0 border-0 bg-transparent p-0 cursor-pointer"
          />
          <div
            className="relative pointer-events-none flex items-center justify-center gap-0 px-0.5 shrink-0"
            style={{ height: LABEL_HEIGHT }}
          >
            <span className="battle-side-label truncate">{props.title}</span>
          </div>
          <div
            role="presentation"
            onClick={handleZoneClick}
            className="relative flex-1 flex items-center justify-center min-h-0 cursor-pointer"
          >
            {nextCard && (
              <CompactNextCard
                card={nextCard}
                dimensions={dimensions}
                forceFaceDown={forceFaceDown}
                upgradedCardIds={props.upgradedCardIds}
                upgradesByCardId={props.upgradesByCardId}
                hiddenUpgradesByCardId={props.hiddenUpgradesByCardId}
                onRevealHiddenUpgrades={props.onRevealHiddenUpgrades}
              />
            )}
            {topCard && (
              <CompactTopCard
                card={topCard}
                zone={props.zone}
                zoneOwner={zoneOwner}
                dimensions={dimensions}
                allowCardInteraction={allowCardInteraction}
                isOpponent={isOpponent}
                forceFaceDown={forceFaceDown}
                canPeekFaceDown={props.canPeekFaceDown}
                onCardHover={props.onCardHover}
                onCardHoverEnd={props.onCardHoverEnd}
                onCardContextMenu={props.onCardContextMenu}
                upgradedCardIds={props.upgradedCardIds}
                upgradesByCardId={props.upgradesByCardId}
                hiddenUpgradesByCardId={props.hiddenUpgradesByCardId}
                onRevealHiddenUpgrades={props.onRevealHiddenUpgrades}
              />
            )}
          </div>
        </div>
      </DroppableZone>

      <ZoneModal
        open={showModal}
        title={props.panelTitle ?? props.title}
        zone={props.zone}
        cards={props.cards}
        allowZoneInteraction={allowZoneInteraction}
        allowCardInteraction={allowCardInteraction}
        isOpponent={isOpponent}
        tone="battle"
        headerActions={props.modalHeaderActions}
        onClose={() => setShowModal(false)}
        onCardHover={props.onCardHover}
        onCardHoverEnd={props.onCardHoverEnd}
        onCardClick={props.onCardClick}
        onCardContextMenu={props.onCardContextMenu}
        selectedCardId={props.selectedCardId}
        forceFaceDown={forceFaceDown}
        upgradedCardIds={props.upgradedCardIds}
        appliedUpgradesByCardId={props.upgradesByCardId}
        hiddenUpgradesByCardId={props.hiddenUpgradesByCardId}
        onRevealHiddenUpgrades={props.onRevealHiddenUpgrades}
      />
    </>
  );
}
