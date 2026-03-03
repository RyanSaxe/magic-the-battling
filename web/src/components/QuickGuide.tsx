import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FaDiscord } from 'react-icons/fa6'
import { DOCS, getPhaseDoc } from '../docs'
import { DocRenderer } from './DocRenderer'
import { CardsView } from './CardsView'
import { PHASES, type Phase } from '../constants/phases'

type HeaderTab = 'guide' | 'browse' | 'faq'
type CardType = 'cards' | 'upgrades' | 'vanguards'
type AccordionSection = 'overview' | Phase
const ACCORDION_STEP_MS = 400
const DISCORD_INVITE_URL = 'https://discord.gg/2NAjcWXNKn'

interface AccordionItemProps {
  id: string
  label: string
  expanded: boolean
  panelCapPx: number
  onToggle: () => void
  children: React.ReactNode
}

function useSequentialAccordion<T extends string | number>(
  initialOpen: T | null,
  stepMs: number,
) {
  const [openId, setOpenId] = useState<T | null>(initialOpen)
  const closeTimerRef = useRef<number | null>(null)
  const pendingOpenRef = useRef<T | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current)
      }
    }
  }, [])

  const toggle = (id: T) => {
    if (closeTimerRef.current !== null) {
      if (openId === null && pendingOpenRef.current === null) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
        setOpenId(id)
        return
      }
      if (pendingOpenRef.current === id) {
        pendingOpenRef.current = null
        return
      }
      pendingOpenRef.current = id
      return
    }

    if (openId === id) {
      setOpenId(null)
      return
    }
    if (openId === null) {
      setOpenId(id)
      return
    }

    pendingOpenRef.current = id
    setOpenId(null)
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      const next = pendingOpenRef.current
      pendingOpenRef.current = null
      if (next !== null) {
        setOpenId(next)
      }
    }, stepMs)
  }

  return { openId, toggle }
}

function useAccordionPanelCap(
  containerRef: React.RefObject<HTMLDivElement | null>,
  refreshKey: string,
) {
  const [panelCapPx, setPanelCapPx] = useState(0)

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    const measure = () => {
      const headers = Array.from(
        container.querySelectorAll<HTMLElement>('[data-accordion-header="true"]'),
      )
      const headersTotal = headers.reduce((sum, header) => sum + header.getBoundingClientRect().height, 0)
      const available = Math.max(0, Math.floor(container.clientHeight - headersTotal))
      setPanelCapPx((prev) => (prev === available ? prev : available))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(container)
    const headers = container.querySelectorAll<HTMLElement>('[data-accordion-header="true"]')
    headers.forEach((header) => observer.observe(header))
    window.addEventListener('resize', measure)

    return () => {
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [containerRef, refreshKey])

  return panelCapPx
}

function AccordionItem({ id, label, expanded, panelCapPx, onToggle, children }: AccordionItemProps) {
  const panelId = `quick-guide-panel-${id}`
  const contentRef = useRef<HTMLDivElement>(null)
  const [measuredContentPx, setMeasuredContentPx] = useState(0)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) {
      return
    }

    const measure = () => {
      const nextHeight = Math.ceil(content.scrollHeight)
      setMeasuredContentPx((prev) => (prev === nextHeight ? prev : nextHeight))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  const cappedPanelPx = Math.max(0, Math.min(panelCapPx, measuredContentPx))
  const panelMaxHeight = `${cappedPanelPx}px`

  return (
    <div className="quick-guide-accordion-item border-b border-amber-400/10 last:border-b-0 flex flex-col min-h-0 overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        data-accordion-header="true"
        className={`w-full py-3 px-4 flex items-center gap-3 cursor-pointer shrink-0 border-b transition-colors duration-[400ms] ${
          expanded
            ? 'bg-gray-800/50 border-amber-400/25'
            : 'hover:bg-gray-800/50 border-amber-400/15'
        }`}
      >
        <span className="text-white font-medium text-sm sm:text-base flex-1 text-left">{label}</span>
        <svg
          className={`w-4 h-4 transition-transform transition-colors duration-[400ms] ${expanded ? 'rotate-90 text-amber-400' : 'text-gray-400'}`}
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
        style={{ maxHeight: expanded ? panelMaxHeight : '0px' }}
      >
        <div className="quick-guide-accordion-panel-inner">
          <div className="quick-guide-accordion-scroll" style={{ maxHeight: panelMaxHeight }}>
            <div ref={contentRef} className="px-5 py-4">
              {children}
            </div>
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
  const [cardType, setCardType] = useState<CardType>('cards')
  const guideAccordionRef = useRef<HTMLDivElement>(null)
  const faqAccordionRef = useRef<HTMLDivElement>(null)

  const overviewDoc = DOCS.find((d) => d.id === 'quick-overview')
  const faqDoc = DOCS.find((d) => d.id === 'faq')
  const faqPairs = faqDoc
    ? parseFaqPairs(faqDoc.parsed.sections['overview'] ?? faqDoc.parsed.body)
    : []
  const { openId: expandedSection, toggle: toggleSection } = useSequentialAccordion<AccordionSection>(
    (initialSection as AccordionSection) ?? 'overview',
    ACCORDION_STEP_MS,
  )
  const { openId: expandedFaqIndex, toggle: toggleFaq } = useSequentialAccordion<number>(
    faqPairs.length > 0 ? 0 : null,
    ACCORDION_STEP_MS,
  )
  const guidePanelCapPx = useAccordionPanelCap(
    guideAccordionRef,
    `${activeTab}:${expandedSection ?? 'none'}`,
  )
  const faqPanelCapPx = useAccordionPanelCap(
    faqAccordionRef,
    `${activeTab}:${expandedFaqIndex ?? 'none'}:${faqPairs.length}`,
  )

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
      <div className="flex gap-4 px-4 shrink-0 border-b border-amber-400/15">
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
          <div ref={guideAccordionRef} className="flex-1 min-h-0 overflow-hidden border-b border-amber-400/10">
            <AccordionItem
              id="overview"
              label="Overview"
              expanded={expandedSection === 'overview'}
              panelCapPx={guidePanelCapPx}
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
              const phaseLabel = `${phase.charAt(0).toUpperCase()}${phase.slice(1)} Phase`
              return (
                <AccordionItem
                  id={phase}
                  key={phase}
                  label={phaseLabel}
                  expanded={expandedSection === phase}
                  panelCapPx={guidePanelCapPx}
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
        <div className="flex-1 flex items-center justify-center text-gray-500 text-center py-8 text-sm">
          Join a game to browse cards.
        </div>
      )}

      {activeTab === 'faq' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div ref={faqAccordionRef} className="flex-1 min-h-0 overflow-hidden border-b border-amber-400/10">
            {faqPairs.length > 0 ? (
              faqPairs.map((pair, index) => (
                <AccordionItem
                  id={`faq-${index}`}
                  key={`${pair.question}-${index}`}
                  label={pair.question}
                  expanded={expandedFaqIndex === index}
                  panelCapPx={faqPanelCapPx}
                  onToggle={() => toggleFaq(index)}
                >
                  <div className="text-sm sm:text-base text-gray-300">
                    <DocRenderer content={pair.answer} />
                  </div>
                </AccordionItem>
              ))
            ) : (
              <div className="px-4 py-3">
                <p className="text-sm text-gray-400">FAQ content not found.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="shrink-0 px-4 py-3 border-t border-amber-400/10 bg-gray-900/95 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => onNavigateToComprehensive()}
            className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
          >
            Comprehensive Guide →
          </button>
          <a
            href={DISCORD_INVITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-violet-300 hover:text-violet-200 transition-colors"
          >
            <FaDiscord className="w-4 h-4" />
            Ask for help
          </a>
        </div>
      </div>
    </div>
  )
}
