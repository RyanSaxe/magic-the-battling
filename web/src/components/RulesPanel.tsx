import { useEffect } from 'react'
import { QuickGuide } from './QuickGuide'

export interface RulesPanelTarget {
  docId?: string
  tab?: string
}

interface RulesPanelProps {
  onClose: () => void
  initialDocId?: string
  initialTab?: string
  gameId?: string
  useUpgrades?: boolean
  useVanguards?: boolean
}

export function RulesPanel({
  onClose,
  initialDocId,
  initialTab,
  gameId,
  useUpgrades,
  useVanguards,
}: RulesPanelProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-0 sm:p-8"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-none sm:rounded-xl shadow-2xl border border-amber-400/10 w-full h-full sm:h-[calc(100dvh-4rem)] sm:max-w-4xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-1.5 flex justify-end items-center shrink-0">
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none p-1"
          >
            &times;
          </button>
        </div>

        <QuickGuide
          key={`${initialDocId ?? ''}:${initialTab ?? ''}`}
          initialDocId={initialDocId}
          initialTab={initialTab}
          gameId={gameId}
          useUpgrades={useUpgrades}
          useVanguards={useVanguards}
        />
      </div>
    </div>
  )
}
