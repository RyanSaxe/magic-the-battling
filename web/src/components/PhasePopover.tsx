import { useEffect, useRef } from 'react'
import { PHASE_RULES, PHASE_CONTROLS, type Phase } from '../constants/rules'

interface PhasePopoverProps {
  phase: Phase
  onClose: () => void
}

export function PhasePopover({ phase, onClose }: PhasePopoverProps) {
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

  const rules = PHASE_RULES[phase]
  const controls = PHASE_CONTROLS[phase]

  return (
    <div className="absolute left-0 right-0 top-full z-40 flex justify-center px-2 sm:px-4">
      <div
        ref={ref}
        className="bg-gray-900/95 backdrop-blur border border-gray-700 rounded-lg shadow-2xl w-full max-w-md p-3 sm:p-4"
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm sm:text-base text-white font-semibold capitalize">{rules.title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg leading-none px-1"
          >
            ×
          </button>
        </div>

        <div className="space-y-2.5">
          <div>
            <h4 className="text-[10px] sm:text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Rules</h4>
            <ul className="space-y-0.5">
              {rules.rules.map((rule, i) => (
                <li key={i} className="flex gap-2 text-xs sm:text-sm text-gray-300">
                  <span className="text-amber-400 shrink-0">•</span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </div>

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
        </div>
      </div>
    </div>
  )
}
