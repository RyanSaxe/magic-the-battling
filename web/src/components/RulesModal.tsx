import { useState, useEffect } from 'react'
import { PHASE_RULES, type Phase } from '../constants/rules'
import type { Card as CardType } from '../types'

const PHASES: Phase[] = ['draft', 'build', 'battle', 'reward']

type Tab = Phase | 'cards'

interface RulesModalProps {
  currentPhase: Phase
  onClose: () => void
  availableUpgrades?: CardType[]
  useUpgrades?: boolean
  cubeId?: string
}

export function RulesModal({ currentPhase, onClose, availableUpgrades = [], useUpgrades = true, cubeId }: RulesModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>(currentPhase)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const tabs: Tab[] = [...PHASES, 'cards']
  const unappliedUpgrades = availableUpgrades.filter((u) => !u.upgrade_target)

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg shadow-2xl max-w-lg w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex border-b border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-amber-400 border-b-2 border-amber-400 -mb-px'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-6 grid overflow-y-auto flex-1">
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
          <div className={`col-start-1 row-start-1 ${activeTab === 'cards' ? '' : 'invisible'}`}>
            <h2 className="text-xl font-bold text-white mb-4">Cards</h2>
            {cubeId && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">Card Pool</h3>
                <a
                  href={`https://cubecobra.com/cube/list/${cubeId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-400 hover:text-amber-300 underline"
                >
                  View on CubeCobra
                </a>
              </div>
            )}
            {useUpgrades && unappliedUpgrades.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-2">Available Upgrades</h3>
                <div className="flex flex-wrap gap-2 justify-center">
                  {unappliedUpgrades.map((card) => (
                    <img
                      key={card.id}
                      src={card.png_url ?? card.image_url}
                      alt={card.name}
                      className="w-24 rounded-lg shadow-lg"
                      title={card.name}
                    />
                  ))}
                </div>
              </div>
            )}
            {!cubeId && !(useUpgrades && unappliedUpgrades.length > 0) && (
              <p className="text-gray-400">No card information available.</p>
            )}
          </div>
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
