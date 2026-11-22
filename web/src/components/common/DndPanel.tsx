import { useState, useCallback, useRef } from 'react'
import { bestFit, MIN_CARD_WIDTH, type ZoneDims } from '../../hooks/cardSizeUtils'
import { DroppableZone } from '../../dnd'
import { useGameDnd } from '../../dnd/useGameDnd'
import { useGameShellMode } from '../../hooks/useGameShellMode'
import type { ZoneName } from '../../types'
import { makeZoneId, type ZoneOwner } from '../../dnd/types'
import { PANEL_GAP, PANEL_MAX_WIDTH, resolveBattlePanelLayout } from './DndPanelLayout'
import { SidePanel } from './SidePanel'

interface DndPanelProps {
  open: boolean
  title: string
  count: number
  onClose: () => void
  children: (dims: { width: number; height: number }) => React.ReactNode
  zone?: ZoneName
  zoneOwner?: ZoneOwner
  validFromZones?: ZoneName[]
  /** A Fight's panels lay their cards out in a scrolling grid. */
  tone?: 'default' | 'battle'
  headerActions?: React.ReactNode
  /** A click on the panel that misses its cards and buttons, which moves a selected card into this zone. */
  onEmptyClick?: () => void
}

const DEFAULT_DIMS: ZoneDims = { width: 80, height: 112, rows: 1, columns: 1 }

function contentBoxSize(node: HTMLElement) {
  const cs = getComputedStyle(node)
  return {
    width: node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    height: node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
  }
}

/** A zone's cards in a side panel, sized to fit it, and a drop target for that zone. */
export function DndPanel({
  open,
  title,
  count,
  onClose,
  children,
  zone,
  zoneOwner,
  validFromZones,
  tone = 'default',
  headerActions,
  onEmptyClick,
}: DndPanelProps) {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_DIMS)
  const observerRef = useRef<ResizeObserver | null>(null)
  const isBattleTone = tone === 'battle'
  const { activeFromZoneId } = useGameDnd()
  // On a phone the panel covers the whole board, so it steps aside while a card is dragged out of it.
  const steppedAside = useGameShellMode() === 'mobile' && !!zone && activeFromZoneId === makeZoneId(zone, zoneOwner)

  const bodyRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect()
        observerRef.current = null
      }

      if (!node) return

      const measure = (w: number, h: number) => {
        const next = isBattleTone
          ? resolveBattlePanelLayout(count, w, h)
          : bestFit(count, w, h, PANEL_GAP, PANEL_MAX_WIDTH, MIN_CARD_WIDTH)
        setDims((prev) =>
          prev.width === next.width
          && prev.height === next.height
          && prev.rows === next.rows
          && prev.columns === next.columns
            ? prev
            : next
        )
      }

      const initial = contentBoxSize(node)
      measure(initial.width, initial.height)

      const observer = new ResizeObserver(() => {
        const next = contentBoxSize(node)
        measure(next.width, next.height)
      })

      observer.observe(node)
      observerRef.current = observer
    },
    [count, isBattleTone],
  )

  const panelChildren = children({ width: dims.width, height: dims.height })
  const battleGridStyle = {
    gridTemplateColumns: `repeat(${Math.max(1, dims.columns)}, ${dims.width}px)`,
    gridAutoRows: `${dims.height}px`,
  }

  return (
    <SidePanel
      open={open}
      title={title}
      count={count}
      onClose={onClose}
      headerActions={headerActions}
      steppedAside={steppedAside}
    >
      <div
        ref={bodyRef}
        className="flex-1 min-h-0 p-2 flex items-center justify-center"
        onClick={onEmptyClick && ((event) => {
          const target = event.target as HTMLElement
          if (!target.closest('.card, button')) onEmptyClick()
        })}
      >
        {zone ? (
          <DroppableZone
            zone={zone}
            zoneOwner={zoneOwner}
            validFromZones={validFromZones}
            idPrefix="panel"
            disabled={steppedAside}
            className={isBattleTone ? 'w-full h-full overflow-auto' : 'flex flex-wrap gap-1.5 justify-center content-center w-full h-full'}
          >
            {count === 0 ? (
              <p className="h-full flex items-center justify-center text-sm text-[var(--ivory-muted)]">{title} is empty</p>
            ) : isBattleTone ? (
              <div className="grid gap-1.5 justify-center content-start min-h-full" style={battleGridStyle}>
                {panelChildren}
              </div>
            ) : (
              panelChildren
            )}
          </DroppableZone>
        ) : (
          isBattleTone ? (
            <div className="grid gap-1.5 justify-center content-start w-full h-full overflow-auto" style={battleGridStyle}>
              {panelChildren}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 justify-center content-center">
              {panelChildren}
            </div>
          )
        )}
      </div>
    </SidePanel>
  )
}
