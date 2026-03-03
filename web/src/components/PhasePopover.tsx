import { useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_SUMMARIES } from '../constants/phases'
import type { Phase } from '../constants/phases'

const PHASE_TITLE_COLOR: Record<Phase, string> = {
  draft: 'text-purple-300',
  build: 'text-blue-300',
  battle: 'text-red-300',
  reward: 'text-amber-300',
}

interface PhasePopoverProps {
  phase: Phase
  anchorRect: DOMRect
  onClose: () => void
  onOpenDetails: () => void
  onOpenControls: () => void
}

export function PhasePopover({
  phase,
  anchorRect,
  onClose,
  onOpenDetails,
  onOpenControls,
}: PhasePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    window.addEventListener('mousedown', handleClickOutside)
    return () => {
      window.removeEventListener('keydown', handleEscape)
      window.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  const positionPopover = useCallback(() => {
    const el = popoverRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const pad = 8

    let top = anchorRect.bottom + 8
    let left = anchorRect.left + anchorRect.width / 2 - rect.width / 2

    if (left + rect.width > vw - pad) left = vw - pad - rect.width
    if (left < pad) left = pad
    if (top + rect.height > vh - pad) top = anchorRect.top - rect.height - 8

    el.style.top = `${top}px`
    el.style.left = `${left}px`
    el.style.transform = 'none'
    el.style.visibility = 'visible'

    if (arrowRef.current) {
      const arrowLeft = anchorRect.left + anchorRect.width / 2 - left
      arrowRef.current.style.left = `${Math.max(12, Math.min(arrowLeft - 6, 260))}px`
    }
  }, [anchorRect])

  useLayoutEffect(positionPopover, [positionPopover])

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        top: anchorRect.bottom + 8,
        left: anchorRect.left + anchorRect.width / 2,
        transform: 'translateX(-50%)',
        position: 'fixed',
        visibility: 'hidden',
      }}
      className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-[60] w-72"
    >
      <div
        ref={arrowRef}
        className="absolute -top-1.5 w-3 h-3 bg-gray-900 border-l border-t border-gray-700 rotate-45"
      />

      <div className="p-3">
        <h3 className={`text-sm font-semibold capitalize mb-1.5 ${PHASE_TITLE_COLOR[phase]}`}>
          {phase} Phase
        </h3>

        <p className="text-xs text-gray-300 mb-2">
          {PHASE_SUMMARIES[phase]}
        </p>

        <div className="mt-2 pt-2 border-t border-gray-700/50 flex items-center justify-between gap-3">
          <button
            onClick={onOpenDetails}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            Details
          </button>
          <button
            onClick={onOpenControls}
            className="text-xs text-blue-300 hover:text-blue-200 transition-colors"
          >
            Controls
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
