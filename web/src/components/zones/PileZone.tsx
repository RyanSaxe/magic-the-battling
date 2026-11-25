import { useState, type ReactElement } from "react";
import type { Card as CardType, ZoneName } from "../../types";
import type { ZoneOwner } from "../../dnd/types";
import { DraggableCard, DroppableZone } from "../../dnd";
import { Card } from "../card";
import { DndPanel } from "../common/DndPanel";
import { Tag } from "../common/Tag";

const DEFAULT_VALID_ZONES: ZoneName[] = [
  "hand",
  "battlefield",
  "graveyard",
  "exile",
  "sideboard",
  "command_zone",
  "library",
];

interface PileZoneProps {
  zone: "graveyard" | "exile";
  cards: CardType[];
  selectedCardId?: string;
  onCardClick?: (card: CardType) => void;
  validFromZones?: ZoneName[];
  draggable?: boolean;
  isOpponent?: boolean;
  canManipulateOpponent?: boolean;
}

interface ExpandedPileModalProps {
  zone: "graveyard" | "exile";
  zoneName: string;
  zoneOwner: ZoneOwner;
  cards: CardType[];
  selectedCardId?: string;
  interactive: boolean;
  onCardClick?: (card: CardType) => void;
  onClose: () => void;
}

function ExpandedPileModal({
  zone,
  zoneName,
  zoneOwner,
  cards,
  selectedCardId,
  interactive,
  onCardClick,
  onClose,
}: ExpandedPileModalProps): ReactElement {
  if (interactive) {
    return (
      <DndPanel open title={zoneName} count={cards.length} onClose={onClose}>
        {(dims) =>
          cards.map((card) => (
            <DraggableCard
              key={card.id}
              card={card}
              zone={zone}
              zoneOwner={zoneOwner}
              dimensions={dims}
              selected={card.id === selectedCardId}
              onClick={() => onCardClick?.(card)}
            />
          ))
        }
      </DndPanel>
    );
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-8"
      onClick={onClose}
    >
      <div
        role="presentation"
        className="modal-chrome border gold-border rounded-lg p-4 max-w-4xl max-h-[80vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-white font-medium">
            {zoneName} ({cards.length})
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--ivory-muted)] hover:text-white"
          >
            Close
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              size="sm"
              selected={card.id === selectedCardId}
              onClick={() => onCardClick?.(card)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function resolvePileMeta(options: {
  zone: "graveyard" | "exile";
  isOpponent: boolean;
  canManipulateOpponent: boolean;
}): {
  allowInteraction: boolean;
  zoneOwner: ZoneOwner;
  label: string;
  zoneName: string;
  bgColor: string;
} {
  const isGraveyard = options.zone === "graveyard";
  return {
    allowInteraction: !options.isOpponent || options.canManipulateOpponent,
    zoneOwner: options.isOpponent ? "opponent" : "player",
    label: isGraveyard ? "GY" : "Exile",
    zoneName: isGraveyard ? "Graveyard" : "Exile",
    bgColor: isGraveyard ? "bg-red-950/40" : "bg-purple-950/40",
  };
}

export function PileZone(props: PileZoneProps): ReactElement {
  const [isExpanded, setIsExpanded] = useState(false);
  const validFromZones = props.validFromZones ?? DEFAULT_VALID_ZONES;
  const draggable = props.draggable ?? true;
  const { allowInteraction, zoneOwner, label, zoneName, bgColor } =
    resolvePileMeta({
      zone: props.zone,
      isOpponent: Boolean(props.isOpponent),
      canManipulateOpponent: Boolean(props.canManipulateOpponent),
    });

  if (props.cards.length === 0) {
    return (
      <DroppableZone
        zone={props.zone}
        zoneOwner={zoneOwner}
        validFromZones={validFromZones}
        disabled={!allowInteraction}
        className={`zone-pile ${bgColor} w-16 h-24 flex items-center justify-center`}
      >
        <span className="text-[var(--ivory-muted)] text-xs">{label}</span>
      </DroppableZone>
    );
  }

  if (isExpanded) {
    return (
      <ExpandedPileModal
        zone={props.zone}
        zoneName={zoneName}
        zoneOwner={zoneOwner}
        cards={props.cards}
        selectedCardId={props.selectedCardId}
        interactive={draggable && allowInteraction}
        onCardClick={props.onCardClick}
        onClose={() => setIsExpanded(false)}
      />
    );
  }

  return (
    <DroppableZone
      zone={props.zone}
      zoneOwner={zoneOwner}
      validFromZones={validFromZones}
      disabled={!allowInteraction}
      className={`zone-pile ${bgColor}`}
    >
      <button
        type="button"
        aria-label={`Open ${zoneName} (${props.cards.length})`}
        className="relative w-16 h-24 cursor-pointer border-0 bg-transparent p-0 text-left block"
        onClick={() => setIsExpanded(true)}
      >
        <Card
          card={props.cards[props.cards.length - 1]}
          size="sm"
          className="w-full h-full"
        />
        <Tag
          tone="stone"
          small
          className="absolute -top-1 -right-1 tabular-nums"
        >
          {props.cards.length}
        </Tag>
      </button>
    </DroppableZone>
  );
}
