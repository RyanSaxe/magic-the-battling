import { useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getPhaseReferenceLabel, getPhaseSummaryRows, getPhaseTip } from '../constants/phases'
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
  useUpgrades: boolean
  isClosing?: boolean
  onClose: () => void
  onOpenDetails: () => void
  onOpenControls: () => void
}

export function PhasePopover({
  phase,
  anchorRect,
  useUpgrades,
  isClosing = false,
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
      const minArrowLeft = 12
      const maxArrowLeft = Math.max(minArrowLeft, rect.width - 18)
      arrowRef.current.style.left = `${Math.max(minArrowLeft, Math.min(arrowLeft - 6, maxArrowLeft))}px`
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
      className={`modal-chrome border gold-border rounded-lg shadow-xl z-[84] felt-raised-panel min-w-[16rem] w-max max-w-[calc(100vw-1rem)] transition-opacity duration-200 ease-out ${isClosing ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
    >
      <div
        ref={arrowRef}
        className="absolute -top-1.5 w-3 h-3 modal-chrome border-l border-t gold-border rotate-45"
      />

      <div className="modal-chrome border-b gold-border rounded-t-lg px-3 py-2 flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold ${PHASE_TITLE_COLOR[phase]}`}>
          {getPhaseReferenceLabel(phase)}
        </span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onOpenDetails}
            className="btn btn-secondary text-xs py-1 px-2.5"
          >
            Details
          </button>
          <button
            onClick={onOpenControls}
            className="btn btn-secondary text-xs py-1 px-2.5"
          >
            Controls
          </button>
        </div>
      </div>

      <div className="p-3">
        <div className="bg-black/35 rounded-lg border border-black/40 px-3 py-2">
          {getPhaseSummaryRows(phase, useUpgrades).map((row, index) => (
            <p key={`${phase}-${index}`} className="text-xs text-gray-300 mb-1.5 last:mb-0 leading-5">
              <span className="text-amber-400/90 mr-1.5">{index + 1}.</span>
              {row}
            </p>
          ))}
        </div>

        <div className="mt-2 bg-black/35 rounded-lg border border-black/40 px-3 py-2">
          <p className="text-[11px] text-gray-400 leading-[1.4]">
            <span className="text-amber-400/90 font-semibold text-[10px] uppercase tracking-wide mr-1.5">Tip</span>
            {getPhaseTip(phase)}
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
