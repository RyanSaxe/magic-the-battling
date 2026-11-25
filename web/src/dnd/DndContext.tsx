import { useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  DndContext as DndKitContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  KeyboardCode,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
  pointerWithin,
} from "@dnd-kit/core";
import type { Card, ZoneName } from "../types";
import { Card as CardComponent } from "../components/card";
import { parseZoneId, type DragData, type ZoneOwner } from "./types";
import { GameDndContext } from "./useGameDnd";

// Prefer panel droppables over underlying zones when they overlap (e.g. mobile)
const panelFirstPointerWithin: CollisionDetection = (args) => {
  const collisions = pointerWithin(args);
  if (collisions.length <= 1) return collisions;
  const panelHit = collisions.find((c) => String(c.id).startsWith("panel:"));
  return panelHit
    ? [panelHit, ...collisions.filter((c) => c !== panelHit)]
    : collisions;
};

export interface CardMoveEvent {
  card: Card;
  fromZone: ZoneName;
  toZone: ZoneName;
  fromOwner: ZoneOwner;
  toOwner: ZoneOwner;
}

export type CardMoveCallback = (move: CardMoveEvent) => void;

interface GameDndProviderProps {
  children: ReactNode;
  onCardMove?: CardMoveCallback;
  validDropZones?: (fromZone: ZoneName) => ZoneName[];
}

function isDragData(value: unknown): value is DragData {
  return (
    typeof value === "object" &&
    value !== null &&
    "card" in value &&
    "fromZone" in value &&
    "fromZoneId" in value
  );
}

export function GameDndProvider({
  children,
  onCardMove,
  validDropZones,
}: GameDndProviderProps): ReactElement {
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [activeFromZone, setActiveFromZone] = useState<ZoneName | null>(null);
  const [activeFromZoneId, setActiveFromZoneId] = useState<string | null>(null);
  const [activeDraggableId, setActiveDraggableId] = useState<string | null>(
    null,
  );
  const [activeFaceDown, setActiveFaceDown] = useState(false);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 8,
    },
  });

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 100,
      tolerance: 8,
    },
  });

  const keyboardSensor = useSensor(KeyboardSensor, {
    keyboardCodes: {
      start: [KeyboardCode.Space],
      cancel: [KeyboardCode.Esc],
      end: [KeyboardCode.Space, KeyboardCode.Tab],
    },
  });

  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  function resetActiveDrag(): void {
    setActiveCard(null);
    setActiveFromZone(null);
    setActiveFromZoneId(null);
    setActiveDraggableId(null);
    setActiveFaceDown(false);
  }

  function handleDragStart(event: DragStartEvent): void {
    const rawData: unknown = event.active.data.current;
    if (isDragData(rawData)) {
      setActiveCard(rawData.card);
      setActiveFromZone(rawData.fromZone);
      setActiveFromZoneId(rawData.fromZoneId);
      setActiveDraggableId(String(event.active.id));
      setActiveFaceDown(rawData.faceDown ?? false);
    }
  }

  function dispatchDrop(overId: string, rawData: unknown): void {
    if (!activeCard || !activeFromZone || !onCardMove) return;
    const { zone: toZone, owner: toOwner } = parseZoneId(overId);
    const fromZoneId = isDragData(rawData) ? rawData.fromZoneId : "";
    const { zone: fromZone, owner: fromOwner } = parseZoneId(fromZoneId);
    if (fromZone === toZone && fromOwner === toOwner) return;
    if (validDropZones && !validDropZones(activeFromZone).includes(toZone)) {
      return;
    }
    onCardMove({
      card: activeCard,
      fromZone: activeFromZone,
      toZone,
      fromOwner,
      toOwner,
    });
  }

  function handleDragEnd(event: DragEndEvent): void {
    if (event.over) {
      dispatchDrop(String(event.over.id), event.active.data.current);
    }
    resetActiveDrag();
  }

  const contextValue = useMemo(
    () => ({
      activeCard,
      activeFromZone,
      activeFromZoneId,
      activeDraggableId,
    }),
    [activeCard, activeFromZone, activeFromZoneId, activeDraggableId],
  );

  return (
    <GameDndContext.Provider value={contextValue}>
      <DndKitContext
        sensors={sensors}
        collisionDetection={panelFirstPointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={resetActiveDrag}
      >
        {children}
        <DragOverlay dropAnimation={null} style={{ zIndex: 9999 }}>
          {activeCard && (
            <CardComponent
              card={activeCard}
              size="md"
              className="drag-overlay"
              faceDown={activeFaceDown}
            />
          )}
        </DragOverlay>
      </DndKitContext>
    </GameDndContext.Provider>
  );
}
