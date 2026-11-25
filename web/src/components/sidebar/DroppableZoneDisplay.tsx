import { useState, type ReactNode } from "react";
import type { Card as CardType, ZoneName } from "../../types";
import type { ZoneOwner } from "../../dnd/types";
import { Card } from "../card";
import { DraggableCard, DroppableZone } from "../../dnd";
import { DndPanel } from "../common/DndPanel";

type CardSize = "xs" | "sm";

const sizeStyles = {
  xs: { width: 50, height: 70 },
  sm: { width: 80, height: 112 },
};

interface DroppableZoneDisplayProps {
  title: string;
  zone: ZoneName;
  cards: CardType[];
  maxThumbnails?: number;
  validFromZones: ZoneName[];
  isOpponent?: boolean;
  canManipulateOpponent?: boolean;
  titleClassName?: string;
  hideCount?: boolean;
  size?: CardSize;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
}

const VALID_FROM_ZONES: ZoneName[] = [
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "sideboard",
  "command_zone",
  "library",
];

interface ModalDraggableCardProps {
  card: CardType;
  zone: ZoneName;
  zoneOwner: ZoneOwner;
  dims: { width: number; height: number };
  isOpponent: boolean;
  allowCardInteraction: boolean;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onCardClick?: (card: CardType, zone: ZoneName, owner: ZoneOwner) => void;
  onCardContextMenu?: (
    e: React.MouseEvent,
    card: CardType,
    zone: ZoneName,
  ) => void;
  selectedCardId?: string;
  forceFaceDown: boolean;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}

function resolveModalCardHandlers(props: ModalDraggableCardProps): {
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
} {
  if (!props.allowCardInteraction) return {};
  return {
    onCardHover: props.onCardHover,
    onCardHoverEnd: props.onCardHoverEnd,
    onClick: props.onCardClick
      ? (): void => props.onCardClick?.(props.card, props.zone, props.zoneOwner)
      : undefined,
    onContextMenu: props.onCardContextMenu
      ? (e: React.MouseEvent): void =>
          props.onCardContextMenu?.(e, props.card, props.zone)
      : undefined,
  };
}

function ModalDraggableCard(props: ModalDraggableCardProps): ReactNode {
  const {
    card,
    zone,
    zoneOwner,
    dims,
    isOpponent,
    allowCardInteraction,
    selectedCardId,
    forceFaceDown,
    upgradedCardIds,
    appliedUpgradesByCardId,
    hiddenUpgradesByCardId,
    onRevealHiddenUpgrades,
  } = props;
  const handlers = resolveModalCardHandlers(props);
  const hiddenUpgradeCount = hiddenUpgradesByCardId?.get(card.id)?.length ?? 0;

  return (
    <DraggableCard
      card={card}
      zone={zone}
      zoneOwner={zoneOwner}
      dragInstanceKey="modal"
      dimensions={dims}
      isOpponent={isOpponent}
      disabled={!allowCardInteraction}
      onCardHover={handlers.onCardHover}
      onCardHoverEnd={handlers.onCardHoverEnd}
      selected={selectedCardId === card.id}
      onClick={handlers.onClick}
      onContextMenu={handlers.onContextMenu}
      faceDown={forceFaceDown}
      canPeekFaceDown={!forceFaceDown}
      upgraded={upgradedCardIds?.has(card.id)}
      appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
      hiddenUpgradeCount={hiddenUpgradeCount}
      onRevealHiddenUpgrades={
        onRevealHiddenUpgrades
          ? (): void => onRevealHiddenUpgrades(card.id)
          : undefined
      }
    />
  );
}

export function ZoneModal({
  open,
  title,
  zone,
  cards,
  allowZoneInteraction,
  allowCardInteraction,
  isOpponent,
  onClose,
  onCardHover,
  onCardHoverEnd,
  onCardClick,
  onCardContextMenu,
  selectedCardId,
  forceFaceDown = false,
  tone = "default",
  headerActions,
  upgradedCardIds,
  appliedUpgradesByCardId,
  hiddenUpgradesByCardId,
  onRevealHiddenUpgrades,
}: {
  open: boolean;
  title: string;
  zone: ZoneName;
  cards: CardType[];
  allowZoneInteraction: boolean;
  allowCardInteraction: boolean;
  isOpponent: boolean;
  onClose: () => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  onCardClick?: (card: CardType, zone: ZoneName, owner: ZoneOwner) => void;
  onCardContextMenu?: (
    e: React.MouseEvent,
    card: CardType,
    zone: ZoneName,
  ) => void;
  selectedCardId?: string;
  forceFaceDown?: boolean;
  tone?: "default" | "battle";
  headerActions?: React.ReactNode;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
  hiddenUpgradesByCardId?: Map<string, CardType[]>;
  onRevealHiddenUpgrades?: (cardId: string) => void;
}): ReactNode {
  const zoneOwner = isOpponent ? "opponent" : ("player" as const);

  const handleClose = (): void => {
    onCardHoverEnd?.();
    onClose();
  };

  if (allowZoneInteraction) {
    return (
      <DndPanel
        open={open}
        title={title}
        count={cards.length}
        onClose={handleClose}
        tone={tone}
        headerActions={headerActions}
        zone={zone}
        zoneOwner={zoneOwner}
        validFromZones={VALID_FROM_ZONES}
      >
        {(dims) =>
          cards.map((card) => (
            <ModalDraggableCard
              key={card.id}
              card={card}
              zone={zone}
              zoneOwner={zoneOwner}
              dims={dims}
              isOpponent={isOpponent}
              allowCardInteraction={allowCardInteraction}
              onCardHover={onCardHover}
              onCardHoverEnd={onCardHoverEnd}
              onCardClick={onCardClick}
              onCardContextMenu={onCardContextMenu}
              selectedCardId={selectedCardId}
              forceFaceDown={forceFaceDown}
              upgradedCardIds={upgradedCardIds}
              appliedUpgradesByCardId={appliedUpgradesByCardId}
              hiddenUpgradesByCardId={hiddenUpgradesByCardId}
              onRevealHiddenUpgrades={onRevealHiddenUpgrades}
            />
          ))
        }
      </DndPanel>
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50">
      <button
        type="button"
        aria-label={`Close ${title}`}
        className="absolute inset-0 bg-black/60 cursor-default"
        onClick={handleClose}
      />
      <div className="relative z-10 modal-chrome border gold-border rounded-lg p-4 max-w-2xl max-h-[80vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-medium">{title}</h3>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              onClick={handleClose}
              className="text-[var(--ivory-muted)] hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
        {cards.length === 0 ? (
          <div className="text-[var(--ivory-muted)] text-center py-4">
            No cards
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cards.map((card) => (
              <Card
                key={card.id}
                card={card}
                size="sm"
                faceDown={forceFaceDown}
                upgraded={upgradedCardIds?.has(card.id)}
                appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
                hiddenUpgradeCount={
                  (hiddenUpgradesByCardId?.get(card.id) ?? []).length
                }
                onRevealHiddenUpgrades={
                  onRevealHiddenUpgrades
                    ? (): void => onRevealHiddenUpgrades(card.id)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ZoneDisplayThumbnails({
  cards,
  remainingCount,
  zone,
  zoneOwner,
  size,
  isOpponent,
  allowZoneInteraction,
  upgradedCardIds,
  appliedUpgradesByCardId,
}: {
  cards: CardType[];
  remainingCount: number;
  zone: ZoneName;
  zoneOwner: ZoneOwner;
  size: CardSize;
  isOpponent: boolean;
  allowZoneInteraction: boolean;
  upgradedCardIds?: Set<string>;
  appliedUpgradesByCardId?: Map<string, CardType[]>;
}): ReactNode {
  if (cards.length === 0) {
    return (
      <div
        className="border border-dashed border-[var(--stone-light)] rounded flex items-center justify-center"
        style={{
          width: sizeStyles[size].width,
          height: sizeStyles[size].height,
        }}
      >
        <span className="text-[var(--ivory-muted)] text-[10px]">Empty</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex gap-0.5">
        {cards.map((card) =>
          allowZoneInteraction ? (
            <DraggableCard
              key={card.id}
              card={card}
              zone={zone}
              zoneOwner={zoneOwner}
              size={size}
              isOpponent={isOpponent}
              upgraded={upgradedCardIds?.has(card.id)}
              appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
            />
          ) : (
            <Card
              key={card.id}
              card={card}
              size={size}
              upgraded={upgradedCardIds?.has(card.id)}
              appliedUpgrades={appliedUpgradesByCardId?.get(card.id)}
            />
          ),
        )}
      </div>
      {remainingCount > 0 && (
        <div className="text-[10px] text-[var(--ivory-muted)]">
          +{remainingCount} more
        </div>
      )}
    </div>
  );
}

function resolveZoneDisplayConfig(props: DroppableZoneDisplayProps): {
  maxThumbnails: number;
  isOpponent: boolean;
  allowZoneInteraction: boolean;
  zoneOwner: ZoneOwner;
  titleClassName: string;
  hideCount: boolean;
  size: CardSize;
} {
  const isOpponent = props.isOpponent ?? false;
  const canManipulateOpponent = props.canManipulateOpponent ?? false;
  return {
    maxThumbnails: props.maxThumbnails ?? 3,
    isOpponent,
    allowZoneInteraction: !isOpponent || canManipulateOpponent,
    zoneOwner: isOpponent ? "opponent" : "player",
    titleClassName: props.titleClassName ?? "text-[var(--ivory-muted)]",
    hideCount: props.hideCount ?? false,
    size: props.size ?? "xs",
  };
}

export function DroppableZoneDisplay(
  props: DroppableZoneDisplayProps,
): ReactNode {
  const {
    title,
    zone,
    cards,
    validFromZones,
    upgradedCardIds,
    appliedUpgradesByCardId,
  } = props;
  const config = resolveZoneDisplayConfig(props);
  const [showModal, setShowModal] = useState(false);

  const displayedCards = cards.slice(0, config.maxThumbnails);
  const remainingCount = cards.length - displayedCards.length;

  return (
    <>
      <DroppableZone
        zone={zone}
        zoneOwner={config.zoneOwner}
        validFromZones={validFromZones}
        disabled={!config.allowZoneInteraction}
        className="flex-1"
      >
        <button
          onClick={() => cards.length > 0 && setShowModal(true)}
          className={`w-full flex flex-col items-center p-2 rounded ${
            cards.length > 0
              ? "hover:bg-[var(--stone)]/50 cursor-pointer"
              : "cursor-default"
          }`}
        >
          <div
            className={`text-[10px] uppercase mb-1 ${config.titleClassName}`}
          >
            {title}
            {!config.hideCount && ` (${cards.length})`}
          </div>
          <ZoneDisplayThumbnails
            cards={displayedCards}
            remainingCount={remainingCount}
            zone={zone}
            zoneOwner={config.zoneOwner}
            size={config.size}
            isOpponent={config.isOpponent}
            allowZoneInteraction={config.allowZoneInteraction}
            upgradedCardIds={upgradedCardIds}
            appliedUpgradesByCardId={appliedUpgradesByCardId}
          />
        </button>
      </DroppableZone>

      <ZoneModal
        open={showModal}
        title={title}
        zone={zone}
        cards={cards}
        allowZoneInteraction={config.allowZoneInteraction}
        allowCardInteraction={config.allowZoneInteraction}
        isOpponent={config.isOpponent}
        onClose={() => setShowModal(false)}
        upgradedCardIds={upgradedCardIds}
        appliedUpgradesByCardId={appliedUpgradesByCardId}
      />
    </>
  );
}
