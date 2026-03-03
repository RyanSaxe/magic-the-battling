import { useState } from 'react'
import { DOCS, getPhaseDoc } from '../docs'
import { DocRenderer } from './DocRenderer'
import { CardsView } from './CardsView'
import { PHASES, type Phase } from '../constants/phases'

type HeaderTab = 'guide' | 'browse' | 'faq'
type CardType = 'cards' | 'upgrades' | 'vanguards'
type AccordionSection = 'overview' | Phase

interface AccordionItemProps {
  id: string
  label: string
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}

function AccordionItem({ id, label, expanded, onToggle, children }: AccordionItemProps) {
  const panelId = `quick-guide-panel-${id}`
  return (
    <div
      className="quick-guide-accordion-item border-b border-amber-400/10 last:border-b-0 flex flex-col min-h-0 overflow-hidden"
      style={expanded ? { flex: '1 1 0', minHeight: 0 } : { flex: '0 0 auto' }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`w-full py-3 px-4 flex items-center gap-3 cursor-pointer shrink-0 border-b transition-colors duration-200 ${
          expanded
            ? 'bg-gray-800/50 border-amber-400/25'
            : 'hover:bg-gray-800/50 border-transparent'
        }`}
      >
        <span className="text-white font-medium text-sm sm:text-base flex-1 text-left capitalize">{label}</span>
        <svg
          className={`w-4 h-4 transition-transform transition-colors duration-200 ${expanded ? 'rotate-90 text-amber-400' : 'text-gray-400'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <div
        id={panelId}
        className={`quick-guide-accordion-panel ${expanded ? 'open' : ''}`}
        aria-hidden={!expanded}
      >
        <div className="quick-guide-accordion-panel-inner">
          <div className="quick-guide-accordion-scroll px-5 py-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

function parseFaqPairs(content: string): { question: string; answer: string }[] {
  const pairs: { question: string; answer: string }[] = []
  const blocks = content.split(/\n\n+/)
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim()
    const match = block.match(/^\*\*(.+?)\*\*\s*\n?([\s\S]*)$/)
    if (match) {
      pairs.push({ question: match[1], answer: match[2].trim() })
    }
  }
  return pairs
}

interface QuickGuideProps {
  initialSection?: string
  gameId?: string
  useUpgrades?: boolean
  useVanguards?: boolean
  onNavigateToComprehensive: (docId?: string, tab?: string) => void
}

export function QuickGuide({
  initialSection,
  gameId,
  useUpgrades,
  useVanguards,
  onNavigateToComprehensive,
}: QuickGuideProps) {
  const [activeTab, setActiveTab] = useState<HeaderTab>('guide')
  const [expandedSection, setExpandedSection] = useState<AccordionSection | null>(
    (initialSection as AccordionSection) ?? 'overview',
  )
  const [cardType, setCardType] = useState<CardType>('cards')

  const overviewDoc = DOCS.find((d) => d.id === 'quick-overview')
  const faqDoc = DOCS.find((d) => d.id === 'faq')

  const toggleSection = (id: AccordionSection) => {
    setExpandedSection((prev) => (prev === id ? null : id))
  }

  const headerTabs: { id: HeaderTab; label: string }[] = [
    { id: 'guide', label: 'How to Play' },
    { id: 'browse', label: 'Browse Cards' },
    { id: 'faq', label: 'FAQ' },
  ]

  const cardTypes: { id: CardType; label: string; visible: boolean }[] = [
    { id: 'cards', label: 'Cards', visible: true },
    { id: 'upgrades', label: 'Upgrades', visible: useUpgrades !== false },
    { id: 'vanguards', label: 'Vanguards', visible: !!useVanguards },
  ]

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex gap-4 border-b border-amber-400/15 px-4 shrink-0">
        {headerTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-1 pb-2 pt-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab.id === activeTab
                ? 'text-amber-400 border-amber-400'
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'guide' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <AccordionItem
            id="overview"
            label="Overview"
            expanded={expandedSection === 'overview'}
            onToggle={() => toggleSection('overview')}
          >
            {overviewDoc ? (
              <div className="text-sm sm:text-base">
                <DocRenderer content={overviewDoc.parsed.sections['overview'] ?? overviewDoc.parsed.body} />
              </div>
            ) : (
              <p className="text-sm text-gray-400">Overview content not found.</p>
            )}
          </AccordionItem>

          {PHASES.map((phase) => {
            const phaseDoc = getPhaseDoc(phase)
            return (
              <AccordionItem
                id={phase}
                key={phase}
                label={`${phase} Phase`}
                expanded={expandedSection === phase}
                onToggle={() => toggleSection(phase)}
              >
                {phaseDoc?.parsed.sections['quick rules'] && (
                  <div className="text-sm sm:text-base">
                    <DocRenderer content={phaseDoc.parsed.sections['quick rules']} />
                  </div>
                )}
                <button
                  onClick={() => onNavigateToComprehensive(phase, 'rules')}
                  className="mt-3 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                >
                  View in Comprehensive Guide →
                </button>
              </AccordionItem>
            )
          })}

          <div className="shrink-0 px-4 py-3 border-t border-amber-400/10">
            <button
              onClick={() => onNavigateToComprehensive()}
              className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
            >
              Comprehensive Guide →
            </button>
          </div>
        </div>
      )}

      {activeTab === 'browse' && gameId && (
        <div className="flex flex-col flex-1 min-h-0 px-4 pt-3">
          <div className="flex gap-2 mb-3 shrink-0">
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

      {activeTab === 'browse' && !gameId && (
        <div className="text-gray-500 text-center py-8 text-sm">
          Join a game to browse cards.
        </div>
      )}

      {activeTab === 'faq' && (
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {faqDoc ? (
            parseFaqPairs(faqDoc.parsed.sections['overview'] ?? faqDoc.parsed.body).map((pair, i) => (
              <div key={i} className="rounded-lg p-3 border border-amber-400/15">
                <p className="text-sm sm:text-base text-white font-medium pb-2 mb-2 border-b border-amber-400/15">{pair.question}</p>
                <div className="text-sm sm:text-base text-gray-300">
                  <DocRenderer content={pair.answer} />
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400">FAQ content not found.</p>
          )}
        </div>
      )}
    </div>
  )
}
