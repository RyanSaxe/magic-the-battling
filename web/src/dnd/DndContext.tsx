import { useState, type ReactNode } from 'react'
import {
  DndContext as DndKitContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  pointerWithin,
} from '@dnd-kit/core'
import type { Card, ZoneName } from '../types'
import { Card as CardComponent } from '../components/card'
import type { DragData } from './types'
import { GameDndContext } from './useGameDnd'

interface GameDndProviderProps {
  children: ReactNode
  onCardMove?: (card: Card, fromZone: ZoneName, toZone: ZoneName) => void
  validDropZones?: (fromZone: ZoneName) => ZoneName[]
}

export function GameDndProvider({
  children,
  onCardMove,
  validDropZones,
}: GameDndProviderProps) {
  const [activeCard, setActiveCard] = useState<Card | null>(null)
  const [activeFromZone, setActiveFromZone] = useState<ZoneName | null>(null)

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: {
      distance: 8,
    },
  })

  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 200,
      tolerance: 8,
    },
  })

  const keyboardSensor = useSensor(KeyboardSensor)

  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor)

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as DragData | undefined
    if (data) {
      setActiveCard(data.card)
      setActiveFromZone(data.fromZone)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { over } = event

    if (over && activeCard && activeFromZone) {
      const toZone = over.id as ZoneName

      if (activeFromZone !== toZone) {
        const isValidDrop = !validDropZones || validDropZones(activeFromZone).includes(toZone)
        if (isValidDrop && onCardMove) {
          onCardMove(activeCard, activeFromZone, toZone)
        }
      }
    }

    setActiveCard(null)
    setActiveFromZone(null)
  }

  function handleDragCancel() {
    setActiveCard(null)
    setActiveFromZone(null)
  }

  return (
    <GameDndContext.Provider value={{ activeCard, activeFromZone }}>
      <DndKitContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}
        <DragOverlay dropAnimation={null}>
          {activeCard && (
            <CardComponent
              card={activeCard}
              size="md"
              className="drag-overlay"
            />
          )}
        </DragOverlay>
      </DndKitContext>
    </GameDndContext.Provider>
  )
}
