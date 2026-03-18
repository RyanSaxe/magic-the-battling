import { useState, useCallback, useRef, useEffect } from 'react'
import { bestFit, type ZoneDims } from '../../hooks/cardSizeUtils'
import { DroppableZone } from '../../dnd'
import type { ZoneName } from '../../types'
import type { ZoneOwner } from '../../dnd/types'
import { resolveBattlePanelLayout } from './DndPanelLayout'

interface DndPanelProps {
  title: string
  count: number
  onClose: () => void
  children: (dims: { width: number; height: number }) => React.ReactNode
  zone?: ZoneName
  zoneOwner?: ZoneOwner
  validFromZones?: ZoneName[]
  tone?: 'default' | 'battle'
  hideTitle?: boolean
  headerActions?: React.ReactNode
}

const DEFAULT_DIMS: ZoneDims = { width: 80, height: 112, rows: 1, columns: 1 }
const PANEL_GAP = 6
const PANEL_MAX_WIDTH = 200
const PANEL_MIN_WIDTH = 40

function contentBoxSize(node: HTMLElement) {
  const cs = getComputedStyle(node)
  return {
    width: node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    height: node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
  }
}

export function DndPanel({
  title,
  count,
  onClose,
  children,
  zone,
  zoneOwner,
  validFromZones,
  tone = 'default',
  hideTitle = false,
  headerActions,
}: DndPanelProps) {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_DIMS)
  const [mobileHeight, setMobileHeight] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const isBattleTone = tone === 'battle'

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const el = document.getElementById('opponent-hand')
    if (!el) return

    const update = () => {
      setMobileHeight(el.getBoundingClientRect().bottom)
    }
    update()

    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
          : bestFit(count, w, h, PANEL_GAP, PANEL_MAX_WIDTH, PANEL_MIN_WIDTH)
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
    <div
      className={`fixed top-0 left-0 right-0 sm:left-auto sm:!max-h-none sm:!h-full ${isBattleTone ? 'sm:w-[calc(16rem-1px)] battle-panel-chrome' : 'sm:w-64 modal-chrome border-b sm:border-b-0 sm:border-l-2 gold-border'} z-50 flex flex-col${mobileHeight == null ? ' max-h-[50vh]' : ''}`}
      style={mobileHeight != null ? { height: mobileHeight } : undefined}
    >
      <div className={`px-2 py-1.5 sm:px-3 sm:py-[10px] flex justify-between items-center shrink-0 ${isBattleTone ? 'dnd-panel-header-battle' : 'border-b sm:border-b-2 gold-border'}`}>
        {hideTitle ? <div /> : <h3 className="text-white font-medium text-sm">{title}</h3>}
        <div className="flex items-center gap-2">
          {headerActions}
          <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">
            &times;
          </button>
        </div>
      </div>
      <div ref={bodyRef} className="flex-1 min-h-0 p-2 flex items-center justify-center">
        {zone ? (
          <DroppableZone
            zone={zone}
            zoneOwner={zoneOwner}
            validFromZones={validFromZones}
            idPrefix="panel"
            className={isBattleTone ? 'w-full h-full overflow-auto' : 'flex flex-wrap gap-1.5 justify-center content-center w-full h-full'}
          >
            {isBattleTone ? (
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
    </div>
  )
}
