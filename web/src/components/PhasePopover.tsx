import { useEffect, useRef } from 'react'
import type { Phase } from '../constants/phases'
import { getPhaseDoc } from '../docs'
import { extractBullets } from '../docs/parse'
import { PHASE_HOTKEYS } from '../constants/hotkeys'

interface PhasePopoverProps {
  phase: Phase
  anchorX: number
  onClose: () => void
}

export function PhasePopover({ phase, anchorX, onClose }: PhasePopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el || !el.parentElement) return
    const parentRect = el.parentElement.getBoundingClientRect()
    const vw = window.innerWidth
    const elWidth = el.offsetWidth
    let left = anchorX - parentRect.left - elWidth / 2
    if (left < 8) left = 8
    if (left + elWidth > vw - parentRect.left - 8) left = vw - parentRect.left - 8 - elWidth
    el.style.left = `${left}px`
  }, [anchorX])

  const doc = getPhaseDoc(phase)
  const rules = doc ? extractBullets(doc.parsed.sections['rules'] ?? '') : []
  const controls = doc ? extractBullets(doc.parsed.sections['controls'] ?? '') : []
  const title = doc?.parsed.meta.title ?? phase
  const hotkeys = PHASE_HOTKEYS[phase] ?? []

  return (
    <div
      ref={ref}
      className="absolute top-full mt-1 z-50 bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg shadow-2xl w-full max-w-md p-3 sm:p-4"
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm sm:text-base text-white font-semibold capitalize">{title}</h3>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none px-1"
        >
          ×
        </button>
      </div>

      <div className="space-y-2.5">
        {rules.length > 0 && (
          <div>
            <h4 className="text-[10px] sm:text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Rules</h4>
            <ul className="space-y-0.5">
              {rules.map((rule, i) => (
                <li key={i} className="flex gap-2 text-xs sm:text-sm text-gray-300">
                  <span className="text-amber-400 shrink-0">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {controls.length > 0 && (
          <div>
            <h4 className="text-[10px] sm:text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Controls</h4>
            <ul className="space-y-0.5">
              {controls.map((ctrl, i) => (
                <li key={i} className="flex gap-2 text-xs sm:text-sm text-gray-300">
                  <span className="text-blue-400 shrink-0">•</span>
                  <span>{ctrl}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {hotkeys.length > 0 && (
          <div>
            <h4 className="text-[10px] sm:text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Keyboard Shortcuts</h4>
            <div className="space-y-0.5">
              {hotkeys.map((hk) => (
                <div key={hk.key} className="flex items-center gap-2 text-xs sm:text-sm text-gray-300">
                  <kbd className="bg-gray-700 text-gray-200 font-mono text-[10px] px-1.5 py-0.5 rounded border border-gray-600 min-w-[1.5rem] text-center shrink-0">
                    {hk.key}
                  </kbd>
                  <span>{hk.description}</span>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5">Press <kbd className="bg-gray-700 px-1 rounded font-mono">?</kbd> for all shortcuts</p>
          </div>
        )}
      </div>
    </div>
  )
}
