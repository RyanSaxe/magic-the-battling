import { useState, useCallback, useRef, useEffect } from 'react'
import { bestFit, type ZoneDims } from '../../hooks/cardSizeUtils'

interface DndPanelProps {
  title: string
  count: number
  onClose: () => void
  children: (dims: { width: number; height: number }) => React.ReactNode
}

const DEFAULT_DIMS: ZoneDims = { width: 80, height: 112, rows: 1, columns: 1 }

export function DndPanel({ title, count, onClose, children }: DndPanelProps) {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_DIMS)
  const observerRef = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

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
    <div className="fixed top-0 left-0 right-0 max-h-[50vh] sm:left-auto sm:max-h-none sm:h-full sm:w-64 bg-gray-900 border-b sm:border-b-0 sm:border-l border-gray-700 z-50 flex flex-col">
      <div className="px-3 py-2 border-b border-gray-700/50 flex justify-between items-center shrink-0">
        <h3 className="text-white font-medium text-sm">{title}</h3>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg leading-none">
          &times;
        </button>
      </div>
      <div ref={bodyRef} className="flex-1 min-h-0 p-2 flex items-center justify-center">
        <div className="flex flex-wrap gap-1.5 justify-center content-center">
          {children({ width: dims.width, height: dims.height })}
        </div>
      </div>
    </div>
  )
}
