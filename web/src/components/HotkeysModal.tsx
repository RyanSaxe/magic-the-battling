import { useEffect } from 'react'
import { PHASE_HOTKEYS, type HotkeyEntry } from '../constants/hotkeys'

interface HotkeysModalProps {
  onClose: () => void
}

const DISPLAY_SECTIONS = [
  { key: 'global', label: 'Global' },
  { key: 'lobby', label: 'Lobby' },
  { key: 'draft', label: 'Draft' },
  { key: 'build', label: 'Build' },
  { key: 'battle', label: 'Battle' },
  { key: 'reward', label: 'Reward' },
]

const HOVER_SECTIONS = [
  { key: 'build-hover', label: 'Build — Hovering a Card' },
  { key: 'battle-hover', label: 'Battle — Hovering a Card' },
]

function HotkeyRow({ entry, indent }: { entry: HotkeyEntry; indent?: boolean }) {
  return (
    <>
      <div className={`flex items-center gap-3 ${indent ? 'pl-6' : ''}`}>
        <kbd className="bg-gray-700 text-gray-200 font-mono text-xs px-2 py-0.5 rounded border border-gray-600 min-w-[2rem] text-center shrink-0">
          {indent ? `→ ${entry.key}` : entry.key}
        </kbd>
        <span className="text-sm text-gray-300">{entry.description}</span>
      </div>
      {entry.subActions?.map((sub) => (
        <div key={sub.key} className="flex items-center gap-3 pl-6">
          <kbd className="bg-gray-700 text-gray-200 font-mono text-xs px-2 py-0.5 rounded border border-gray-600 min-w-[2rem] text-center shrink-0">
            → {sub.key}
          </kbd>
          <span className="text-sm text-gray-400">{sub.description}</span>
        </div>
      ))}
    </>
  )
}

export function HotkeysModal({ onClose }: HotkeysModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-gray-700/50 flex justify-between items-center shrink-0">
          <h2 className="text-white font-semibold text-lg">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none p-1">
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {DISPLAY_SECTIONS.map(({ key, label }) => {
            const entries = PHASE_HOTKEYS[key]
            if (!entries?.length) return null
            return (
              <div key={key}>
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{label}</h3>
                <div className="space-y-1.5">
                  {entries.map((entry) => (
                    <HotkeyRow key={entry.key} entry={entry} />
                  ))}
                </div>
              </div>
            )
          })}

          {HOVER_SECTIONS.map(({ key, label }) => {
            const entries = PHASE_HOTKEYS[key]
            if (!entries?.length) return null
            return (
              <div key={key}>
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">{label}</h3>
                <div className="space-y-1.5">
                  {entries.map((entry) => (
                    <HotkeyRow key={entry.key} entry={entry} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-2 border-t border-gray-700/50 shrink-0">
          <p className="text-xs text-gray-500 text-center">
            Press <kbd className="bg-gray-700 px-1 rounded text-gray-400 font-mono">Esc</kbd> to close
          </p>
        </div>
      </div>
    </div>
  )
}
