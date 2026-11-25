import type { ReactElement } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { Card as CardType, ZoneName } from "../types";
import { Card } from "../components/card";
import { useFaceDown } from "../contexts/faceDownState";
import {
  makeDraggableId,
  makeZoneId,
  type DragData,
  type ZoneOwner,
} from "./types";

interface DraggableCardProps {
  card: CardType;
  zone: ZoneName;
  zoneOwner?: ZoneOwner;
  onClick?: () => void;
  onDoubleClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onCardHover?: (cardId: string, zone: ZoneName) => void;
  onCardHoverEnd?: () => void;
  selected?: boolean;
  size?: "xs" | "sm" | "md" | "lg";
  dimensions?: { width: number; height: number };
  tapped?: boolean;
  faceDown?: boolean;
  flipped?: boolean;
  counters?: Record<string, number>;
  glow?: "none" | "gold" | "green" | "red";
  disabled?: boolean;
  isOpponent?: boolean;
  isCompanion?: boolean;
  upgraded?: boolean;
  appliedUpgrades?: CardType[];
  hiddenUpgradeCount?: number;
  onRevealHiddenUpgrades?: () => void;
  canPeekFaceDown?: boolean;
  style?: React.CSSProperties;
  dragInstanceKey?: string;
}

function isInsideButton(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button") !== null;
}

function resolveDraggableDefaults(props: DraggableCardProps): {
  zoneOwner: ZoneOwner;
  size: "xs" | "sm" | "md" | "lg";
  disabled: boolean;
  isOpponent: boolean;
  isCompanion: boolean;
  upgraded: boolean;
  hiddenUpgradeCount: number;
} {
  return {
    zoneOwner: props.zoneOwner ?? "player",
    size: props.size ?? "md",
    disabled: props.disabled ?? false,
    isOpponent: props.isOpponent ?? false,
    isCompanion: props.isCompanion ?? false,
    upgraded: props.upgraded ?? false,
    hiddenUpgradeCount: props.hiddenUpgradeCount ?? 0,
  };
}

export function DraggableCard(props: DraggableCardProps): ReactElement {
  const {
    card,
    zone,
    onClick,
    onDoubleClick,
    onContextMenu,
    onCardHover,
    onCardHoverEnd,
    selected,
    dimensions,
    tapped,
    faceDown,
    flipped,
    counters,
    glow,
    appliedUpgrades,
    onRevealHiddenUpgrades,
    canPeekFaceDown,
    style: externalStyle,
    dragInstanceKey,
  } = props;
  const {
    zoneOwner,
    size,
    disabled,
    isOpponent,
    isCompanion,
    upgraded,
    hiddenUpgradeCount,
  } = resolveDraggableDefaults(props);

  const contextFaceDown = useFaceDown(card.id);
  const effectiveFaceDown = faceDown || contextFaceDown;

  const zoneId = makeZoneId(zone, zoneOwner);
  const dragData: DragData = {
    card,
    fromZone: zone,
    fromZoneId: zoneId,
    isOpponent,
    faceDown: effectiveFaceDown,
  };
  const draggableId = makeDraggableId({
    zone,
    owner: zoneOwner,
    cardId: card.id,
    instanceKey: dragInstanceKey,
  });

  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: draggableId,
      data: dragData,
      disabled,
    });

  const style = {
    ...externalStyle,
  };

  return (
    <div style={style}>
      <Card
        card={card}
        interactiveRef={setNodeRef}
        interactiveProps={{
          ...listeners,
          ...attributes,
          onClick: (e) => {
            if (!isInsideButton(e.target)) {
              onClick?.();
            }
          },
        }}
        interactiveStyle={
          transform && !isDragging
            ? { transform: CSS.Translate.toString(transform) }
            : undefined
        }
        selected={selected}
        size={size}
        dimensions={dimensions}
        tapped={tapped}
        faceDown={faceDown}
        flipped={flipped}
        counters={counters}
        glow={glow}
        dragging={isDragging}
        isCompanion={isCompanion}
        upgraded={upgraded}
        appliedUpgrades={appliedUpgrades}
        hiddenUpgradeCount={hiddenUpgradeCount}
        onRevealHiddenUpgrades={onRevealHiddenUpgrades}
        canPeekFaceDown={canPeekFaceDown}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu?.(e);
        }}
        onHoverStart={
          onCardHover ? (): void => onCardHover(card.id, zone) : undefined
        }
        onHoverEnd={onCardHoverEnd}
      />
    </div>
  );
}
