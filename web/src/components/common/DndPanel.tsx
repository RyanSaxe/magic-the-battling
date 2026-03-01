import { useState, useCallback, useRef, useEffect } from 'react'
import { bestFit, type ZoneDims } from '../../hooks/cardSizeUtils'
import { DroppableZone } from '../../dnd'
import type { ZoneName } from '../../types'
import type { ZoneOwner } from '../../dnd/types'

interface DndPanelProps {
  title: string
  count: number
  onClose: () => void
  children: (dims: { width: number; height: number }) => React.ReactNode
  zone?: ZoneName
  zoneOwner?: ZoneOwner
  validFromZones?: ZoneName[]
}

const DEFAULT_DIMS: ZoneDims = { width: 80, height: 112, rows: 1, columns: 1 }

export function DndPanel({ title, count, onClose, children, zone, zoneOwner, validFromZones }: DndPanelProps) {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_DIMS)
  const [mobileHeight, setMobileHeight] = useState<number | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)

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
        const next = bestFit(count, w, h, 6, 200, 40)
        setDims((prev) =>
          prev.width === next.width && prev.height === next.height ? prev : next
        )
      }

      const cs = getComputedStyle(node)
      const w = node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const h = node.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
      measure(w, h)

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (!entry) return
        measure(entry.contentRect.width, entry.contentRect.height)
      })

      observer.observe(node)
      observerRef.current = observer
    },
    [count],
  )

  return (
    <div
      className={`fixed top-0 left-0 right-0 sm:left-auto sm:!max-h-none sm:!h-full sm:w-64 bg-gray-900 border-b sm:border-b-0 sm:border-l border-gray-700 z-50 flex flex-col${mobileHeight == null ? ' max-h-[50vh]' : ''}`}
      style={mobileHeight != null ? { height: mobileHeight } : undefined}
    >
      <div className="px-1.5 py-1.5 sm:py-2 border-b border-gray-700/50 flex justify-between items-center shrink-0">
        <h3 className="text-white font-medium text-sm">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">
          &times;
        </button>
      </div>
      <div ref={bodyRef} className="flex-1 min-h-0 p-2 flex items-center justify-center">
        {zone ? (
          <DroppableZone zone={zone} zoneOwner={zoneOwner} validFromZones={validFromZones} idPrefix="panel" className="flex flex-wrap gap-1.5 justify-center content-center w-full h-full">
            {children({ width: dims.width, height: dims.height })}
          </DroppableZone>
        ) : (
          <div className="flex flex-wrap gap-1.5 justify-center content-center">
            {children({ width: dims.width, height: dims.height })}
          </div>
        )}
      </div>
    </div>
  )
}
