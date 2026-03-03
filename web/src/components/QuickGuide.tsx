import { useState } from 'react'
import { DOCS, getPhaseDoc } from '../docs'
import { DocRenderer } from './DocRenderer'
import { ControlsTab } from './ControlsTab'
import { CardsView } from './CardsView'
import { PHASES, type Phase } from '../constants/phases'

type TopTab = 'overview' | 'how-to-play' | 'card-list'
type SubTab = 'rules' | 'controls' | 'faq'
type CardType = 'cards' | 'upgrades' | 'vanguards'

const PHASE_PILL_STYLE: Record<Phase, { active: string; color: string }> = {
  draft: {
    active: 'bg-purple-500/30 text-purple-300 ring-1 ring-purple-400/60',
    color: 'text-purple-400',
  },
  build: {
    active: 'bg-blue-500/30 text-blue-300 ring-1 ring-blue-400/60',
    color: 'text-blue-400',
  },
  battle: {
    active: 'bg-red-500/30 text-red-300 ring-1 ring-red-400/60',
    color: 'text-red-400',
  },
  reward: {
    active: 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-400/60',
    color: 'text-amber-400',
  },
}

interface QuickGuideProps {
  gameId?: string
  useUpgrades?: boolean
  useVanguards?: boolean
  onNavigateToComprehensive: (docId?: string, tab?: string) => void
}

export function QuickGuide({
  gameId,
  useUpgrades,
  useVanguards,
  onNavigateToComprehensive,
}: QuickGuideProps) {
  const [topTab, setTopTab] = useState<TopTab>('overview')
  const [subTab, setSubTab] = useState<SubTab>('rules')
  const [selectedPhase, setSelectedPhase] = useState<Phase>('draft')
  const [cardType, setCardType] = useState<CardType>('cards')

  const overviewDoc = DOCS.find((d) => d.id === 'quick-overview')
  const faqDoc = DOCS.find((d) => d.id === 'faq')
  const phaseDoc = getPhaseDoc(selectedPhase)

  const topTabs: { id: TopTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'how-to-play', label: 'How to Play' },
    { id: 'card-list', label: 'Card List' },
  ]

  const subTabs: { id: SubTab; label: string }[] = [
    { id: 'rules', label: 'Rules' },
    { id: 'controls', label: 'Controls' },
    { id: 'faq', label: 'FAQ' },
  ]

  const cardTypes: { id: CardType; label: string; visible: boolean }[] = [
    { id: 'cards', label: 'Cards', visible: true },
    { id: 'upgrades', label: 'Upgrades', visible: useUpgrades !== false },
    { id: 'vanguards', label: 'Vanguards', visible: !!useVanguards },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0 px-4 pt-3">
      <div className="flex gap-4 mb-3 border-b border-gray-700/50 -mx-4 px-4">
        {topTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setTopTab(tab.id)}
            className={`px-1 pb-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab.id === topTab
                ? 'text-amber-400 border-amber-400'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {topTab === 'overview' && (
        <div className="flex-1 overflow-y-auto">
          {overviewDoc ? (
            <DocRenderer content={overviewDoc.parsed.sections['overview'] ?? overviewDoc.parsed.body} />
          ) : (
            <p className="text-sm text-gray-400">Overview content not found.</p>
          )}
        </div>
      )}

      {topTab === 'how-to-play' && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex gap-3 mb-3 border-b border-gray-700/50 -mx-4 px-4">
            {subTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSubTab(tab.id)}
                className={`px-1 pb-2 text-sm transition-colors border-b-2 -mb-px ${
                  tab.id === subTab
                    ? 'text-amber-400 border-amber-400'
                    : 'text-gray-400 border-transparent hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {subTab !== 'faq' && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {PHASES.map((phase) => (
                <button
                  key={phase}
                  onClick={() => setSelectedPhase(phase)}
                  className={`rounded-full px-3 py-1 text-sm capitalize transition-all ${
                    phase === selectedPhase
                      ? PHASE_PILL_STYLE[phase].active
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {phase}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto min-h-0">
            {subTab === 'rules' && phaseDoc && (
              <>
                <DocRenderer content={phaseDoc.parsed.sections['quick rules'] ?? phaseDoc.parsed.sections['rules'] ?? ''} />
                <button
                  onClick={() => onNavigateToComprehensive(selectedPhase, 'rules')}
                  className="mt-4 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  See full details →
                </button>
              </>
            )}

            {subTab === 'controls' && (
              <>
                <ControlsTab phase={selectedPhase} />
                <button
                  onClick={() => onNavigateToComprehensive(selectedPhase, 'controls')}
                  className="mt-4 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  See full details →
                </button>
              </>
            )}

            {subTab === 'faq' && faqDoc && (
              <DocRenderer content={faqDoc.parsed.sections['overview'] ?? faqDoc.parsed.body} />
            )}
          </div>
        </div>
      )}

      {topTab === 'card-list' && gameId && (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex gap-2 mb-3">
            {cardTypes.filter((t) => t.visible).map((t) => (
              <button
                key={t.id}
                onClick={() => setCardType(t.id)}
                className={`rounded-full px-3 py-1 text-sm transition-all ${
                  t.id === cardType
                    ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/60'
                    : 'text-gray-400 hover:text-gray-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <CardsView
            gameId={gameId}
            which={cardType === 'vanguards' ? 'cards' : cardType}
          />
        </div>
      )}

      {topTab === 'card-list' && !gameId && (
        <div className="text-gray-500 text-center py-8 text-sm">
          Join a game to browse cards.
        </div>
      )}
    </div>
  )
}
