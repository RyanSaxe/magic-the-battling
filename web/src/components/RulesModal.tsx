import { useState, useEffect } from 'react'
import { PHASE_RULES, type Phase } from '../constants/rules'

const PHASES: Phase[] = ['draft', 'build', 'battle', 'reward']

interface RulesModalProps {
  currentPhase: Phase
  onClose: () => void
}

export function RulesModal({ currentPhase, onClose }: RulesModalProps) {
  const [activeTab, setActiveTab] = useState<Phase>(currentPhase)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg shadow-2xl max-w-lg w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex border-b border-gray-700">
          {PHASES.map((phase) => (
            <button
              key={phase}
              onClick={() => setActiveTab(phase)}
              className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === phase
                  ? 'text-amber-400 border-b-2 border-amber-400 -mb-px'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {phase}
            </button>
          ))}
        </div>

        <div className="p-6 grid">
          {PHASES.map((phase) => {
            const rules = PHASE_RULES[phase]
            const isActive = phase === activeTab
            return (
              <div
                key={phase}
                className={`col-start-1 row-start-1 ${isActive ? '' : 'invisible'}`}
              >
                <h2 className="text-xl font-bold text-white mb-4">{rules.title}</h2>
                <ul className="space-y-3">
                  {rules.rules.map((rule, index) => (
                    <li key={index} className="flex gap-3 text-gray-300">
                      <span className="text-amber-400 flex-shrink-0">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full btn btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
