import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { PHASE_HOTKEYS, type HotkeyEntry } from '../constants/hotkeys'
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
  onOpenGuide: () => void
}

function CompactHotkey({ entry }: { entry: HotkeyEntry }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="bg-gray-700 text-gray-200 font-mono text-[10px] px-1.5 py-0.5 rounded border border-gray-600">
        {entry.key}
      </kbd>
      <span className="text-xs text-gray-400">{entry.description}</span>
    </span>
  )
}

export function PhasePopover({ phase, anchorRect, onClose, onOpenGuide }: PhasePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const arrowRef = useRef<HTMLDivElement>(null)
  const [showHotkeys, setShowHotkeys] = useState(false)

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
  useLayoutEffect(positionPopover, [showHotkeys])

  const hotkeys = PHASE_HOTKEYS[phase] ?? []

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

        {hotkeys.length > 0 && (
          <div className="pt-2 border-t border-gray-700/50">
            <button
              onClick={() => setShowHotkeys((v) => !v)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform duration-200 ${showHotkeys ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Keyboard Shortcuts
            </button>
            <div className={`accordion-body ${showHotkeys ? 'open' : ''}`}>
              <div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-2">
                  {hotkeys.map((entry) => (
                    <CompactHotkey key={entry.key} entry={entry} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-2 pt-2 border-t border-gray-700/50 flex justify-center">
          <button
            onClick={onOpenGuide}
            className="text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            View in Guide →
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
