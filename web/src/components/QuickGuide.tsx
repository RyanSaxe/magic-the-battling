import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FaDiscord } from 'react-icons/fa6'
import { DOCS, getPhaseDoc, type DocEntry } from '../docs'
import { DocRenderer } from './DocRenderer'
import { CardsView } from './CardsView'
import { PHASES, type Phase } from '../constants/phases'
import { PHASE_HOTKEYS } from '../constants/hotkeys'
import { HotkeyRow } from './HotkeyRow'
import { DocNavContext } from '../contexts/DocNavContext'
import { CubeCobraPrimerLink } from './common/CubeCobraPrimerLink'

type HeaderTab = 'guide' | 'controls' | 'tips' | 'browse' | 'faq'
type CardType = 'cards' | 'upgrades' | 'vanguards'
type GuideSection = 'overview' | 'game-pieces' | Phase
type ControlsSection = 'global' | Phase
type TipsSection = 'global' | Phase

const ACCORDION_STEP_MS = 400
const DISCORD_INVITE_URL = 'https://discord.gg/2NAjcWXNKn'
const FACE_UP_FAQ_SLUG = 'why-are-my-opponents-cards-face-up'
const FINALS_FAQ_SLUG = 'how-do-finals-and-sudden-death-work'

interface AccordionItemProps {
  id: string
  label: string
  expanded: boolean
  onToggle: () => void
  labelClassName?: string
  children: React.ReactNode
}

interface QuickGuideProps {
  initialDocId?: string
  initialTab?: string
  gameId?: string
  useUpgrades?: boolean
  useVanguards?: boolean
  onLocationChange?: (label: string) => void
}

interface ResolvedTarget {
  tab: HeaderTab
  guideSection?: GuideSection
  controlsSection?: ControlsSection
  tipsSection?: TipsSection
  faqSlug?: string
}

interface FaqEntry {
  question: string
  answer: string
  slug: string
}

function guideSectionLabel(section: GuideSection | null): string | null {
  if (!section) {
    return null
  }
  if (section === 'overview') {
    return 'Overview'
  }
  if (section === 'game-pieces') {
    return 'Game Pieces'
  }
  return `${toTitleCase(section)} Phase`
}

function controlsSectionLabel(section: ControlsSection | null): string | null {
  if (!section) {
    return null
  }
  return section === 'global' ? 'Global Controls' : `${toTitleCase(section)} Phase Controls`
}

function tipsSectionLabel(section: TipsSection | null): string | null {
  if (!section) {
    return null
  }
  return section === 'global' ? 'Global Tips' : `${toTitleCase(section)} Phase Tips`
}

function buildLocationLabel({
  activeTab,
  guideOpenId,
  controlsOpenId,
  tipsOpenId,
  faqOpenId,
  faqEntries,
  cardType,
}: {
  activeTab: HeaderTab
  guideOpenId: GuideSection | null
  controlsOpenId: ControlsSection | null
  tipsOpenId: TipsSection | null
  faqOpenId: number | null
  faqEntries: FaqEntry[]
  cardType: CardType
}): string {
  let tabLabel = 'Rules'
  let detail: string | null = null

  switch (activeTab) {
    case 'guide':
      tabLabel = 'Rules'
      detail = guideSectionLabel(guideOpenId)
      break
    case 'controls':
      tabLabel = 'Controls'
      detail = controlsSectionLabel(controlsOpenId)
      break
    case 'tips':
      tabLabel = 'Tips'
      detail = tipsSectionLabel(tipsOpenId)
      break
    case 'browse':
      tabLabel = 'Cards'
      detail = cardType === 'cards'
        ? null
        : cardType === 'upgrades'
          ? 'Upgrades'
          : 'Vanguards'
      break
    case 'faq':
      tabLabel = 'FAQ'
      detail = faqOpenId !== null ? faqEntries[faqOpenId]?.question ?? null : null
      break
  }

  return detail ? `${tabLabel} -> ${detail}` : tabLabel
}

function toTitleCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function toSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function normalizeFaqSlug(raw?: string): string | undefined {
  if (!raw) {
    return undefined
  }
  const slug = toSlug(raw)
  if (slug === 'puppets' || slug === 'ghost' || slug === 'why-are-my-opponents-cards-face-up') {
    return FACE_UP_FAQ_SLUG
  }
  if (slug === 'finals' || slug === 'sudden-death' || slug === 'how-do-finals-and-sudden-death-work') {
    return FINALS_FAQ_SLUG
  }
  return slug
}

function resolveTarget(docId?: string, tab?: string): ResolvedTarget {
  const normalizedDocId = (docId ?? '').toLowerCase()
  const normalizedTab = (tab ?? '').toLowerCase()
  const phaseMatch = PHASES.find((phase) => phase === normalizedDocId)

  if (!normalizedDocId) {
    return { tab: 'guide', guideSection: 'overview' }
  }

  if (normalizedDocId === '__cards__') {
    return { tab: 'browse' }
  }

  if (phaseMatch) {
    if (normalizedTab === 'controls') {
      return { tab: 'controls', controlsSection: phaseMatch }
    }
    if (normalizedTab === 'tips') {
      return { tab: 'tips', tipsSection: phaseMatch }
    }
    return { tab: 'guide', guideSection: phaseMatch }
  }

  if (normalizedDocId === 'controls') {
    if (normalizedTab && PHASES.includes(normalizedTab as Phase)) {
      return { tab: 'controls', controlsSection: normalizedTab as Phase }
    }
    return { tab: 'controls', controlsSection: 'global' }
  }

  if (normalizedDocId === 'tips') {
    if (normalizedTab && PHASES.includes(normalizedTab as Phase)) {
      return { tab: 'tips', tipsSection: normalizedTab as Phase }
    }
    return { tab: 'tips', tipsSection: 'global' }
  }

  if (normalizedDocId === 'game-pieces') {
    return { tab: 'guide', guideSection: 'game-pieces' }
  }

  if (normalizedDocId === 'winning-the-game') {
    return { tab: 'faq', faqSlug: FINALS_FAQ_SLUG }
  }

  if (normalizedDocId === 'non-human-players') {
    return { tab: 'faq', faqSlug: FACE_UP_FAQ_SLUG }
  }

  if (normalizedDocId === 'faq') {
    return { tab: 'faq', faqSlug: normalizeFaqSlug(normalizedTab) }
  }

  if (normalizedDocId === 'overview' || normalizedDocId === 'quick-overview') {
    return { tab: 'guide', guideSection: 'overview' }
  }

  return { tab: 'guide', guideSection: 'overview' }
}

function useSequentialAccordion<T extends string | number>(
  initialOpen: T | null,
  stepMs: number,
) {
  const [openId, setOpenId] = useState<T | null>(initialOpen)
  const closeTimerRef = useRef<number | null>(null)
  const pendingOpenRef = useRef<T | null>(null)

  const clearPending = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    pendingOpenRef.current = null
  }, [])

  useEffect(() => {
    return () => clearPending()
  }, [clearPending])

  const openImmediate = useCallback((id: T | null) => {
    clearPending()
    setOpenId(id)
  }, [clearPending])

  const toggle = useCallback((id: T) => {
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
  }, [openId, stepMs])

  return { openId, toggle, openImmediate }
}

function AccordionItem({ id, label, expanded, onToggle, labelClassName, children }: AccordionItemProps) {
  const panelId = `guide-panel-${id}`
  const contentRef = useRef<HTMLDivElement>(null)
  const [contentHeight, setContentHeight] = useState(0)

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!content) {
      return
    }

    const measure = () => {
      const nextHeight = Math.ceil(content.scrollHeight)
      setContentHeight((prev) => (prev === nextHeight ? prev : nextHeight))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="quick-guide-accordion-item border-b border-amber-400/10 last:border-b-0">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={`w-full py-3.5 px-4 flex items-center gap-3 cursor-pointer shrink-0 border-l-3 transition-all duration-[400ms] ${
          expanded
            ? 'bg-amber-400/8 border-l-amber-400'
            : 'border-l-transparent hover:border-l-amber-400/40 hover:bg-black/20'
        }`}
      >
        <span className={`font-medium text-base flex-1 text-left ${labelClassName ?? 'text-white'}`}>{label}</span>
        <svg
          className={`w-5 h-5 transition-transform transition-colors duration-[400ms] ${expanded ? 'rotate-90 text-amber-400' : 'text-gray-400'}`}
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
        style={{ maxHeight: expanded ? `${contentHeight}px` : '0px' }}
      >
        <div className="quick-guide-accordion-panel-inner">
          <div ref={contentRef} className="px-5 py-4 sm:px-6 sm:py-5">
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

function getH2TitleMap(raw: string): Map<string, string> {
  const titleByKey = new Map<string, string>()
  const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^##(?!#)\s*(.+?)\s*$/)
    if (!match) {
      continue
    }
    const title = match[1].trim()
    const key = title.toLowerCase()
    if (!titleByKey.has(key)) {
      titleByKey.set(key, title)
    }
  }
  return titleByKey
}

const EXCLUDED_GUIDE_SECTIONS = new Set(['overview', 'controls'])

function buildPhaseGuideContent(doc: DocEntry): string {
  const { sections, sectionTitles, sectionOrder } = doc.parsed
  const overview = sections['overview'] ?? ''
  const additional = sectionOrder
    .filter((key) => !EXCLUDED_GUIDE_SECTIONS.has(key))
    .map((key) => `## ${sectionTitles[key] ?? key}\n\n${sections[key]}`)
    .join('\n\n')
  return additional ? `${overview}\n\n${additional}` : overview
}

function PhaseControlsContent({ phase }: { phase: Phase }) {
  const phaseDoc = getPhaseDoc(phase)
  const controlsMarkdown = phaseDoc?.parsed.sections['controls']
  const hotkeys = PHASE_HOTKEYS[phase] ?? []
  const hoverHotkeys = PHASE_HOTKEYS[`${phase}-hover`] ?? []

  return (
    <div className="space-y-4 text-sm sm:text-base">
      {controlsMarkdown ? (
        <DocRenderer content={controlsMarkdown} />
      ) : (
        <p className="text-sm text-gray-400">Controls are not defined for this phase yet.</p>
      )}

      {hotkeys.length > 0 && (
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-gray-200 tracking-wide mt-5 mb-2 border-b border-amber-400/15 pb-1">
            Keyboard Shortcuts
          </h2>
          <div className="space-y-1.5">
            {hotkeys.map((entry) => (
              <HotkeyRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {hoverHotkeys.length > 0 && (
        <div>
          <h2 className="text-[0.9375rem] font-semibold text-gray-200 tracking-wide mt-5 mb-2 border-b border-amber-400/15 pb-1">
            When Hovering a Card
          </h2>
          <div className="space-y-1.5">
            {hoverHotkeys.map((entry) => (
              <HotkeyRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function QuickGuide({
  initialDocId,
  initialTab,
  gameId,
  useUpgrades,
  useVanguards,
  onLocationChange,
}: QuickGuideProps) {
  const quickOverviewDoc = DOCS.find((d) => d.id === 'quick-overview')
  const gamePiecesDoc = DOCS.find((d) => d.id === 'game-pieces')
  const controlsDoc = DOCS.find((d) => d.id === 'controls')
  const tipsDoc = DOCS.find((d) => d.id === 'tips')
  const faqDoc = DOCS.find((d) => d.id === 'faq')

  const faqEntries = useMemo<FaqEntry[]>(() => {
    if (!faqDoc) {
      return []
    }
    const titleBySection = getH2TitleMap(faqDoc.raw)
    const sectionEntries = faqDoc.parsed.sectionOrder
      .filter((sectionKey) => sectionKey !== 'overview')
      .map((sectionKey) => {
        const answer = faqDoc.parsed.sections[sectionKey]?.trim() ?? ''
        if (!answer) {
          return null
        }
        const question = titleBySection.get(sectionKey) ?? sectionKey
        return { question, answer }
      })
      .filter((entry): entry is { question: string; answer: string } => entry !== null)

    const fallbackEntries = sectionEntries.length > 0
      ? sectionEntries
      : parseFaqPairs(faqDoc.parsed.sections['overview'] ?? faqDoc.parsed.body)

    return fallbackEntries.map((pair) => ({
      ...pair,
      slug: toSlug(pair.question),
    }))
  }, [faqDoc])

  const faqIndexBySlug = useMemo(() => {
    const map = new Map<string, number>()
    faqEntries.forEach((entry, index) => {
      map.set(entry.slug, index)
    })
    return map
  }, [faqEntries])

  const initialResolved = resolveTarget(initialDocId, initialTab)
  const initialFaqIndex = (() => {
    if (faqEntries.length === 0) {
      return null
    }
    if (initialResolved.tab !== 'faq') {
      return 0
    }
    const normalizedSlug = normalizeFaqSlug(initialResolved.faqSlug)
    if (!normalizedSlug) {
      return 0
    }
    return faqIndexBySlug.get(normalizedSlug) ?? 0
  })()

  const [activeTab, setActiveTab] = useState<HeaderTab>(initialResolved.tab)
  const [cardType, setCardType] = useState<CardType>('cards')

  const {
    openId: guideOpenId,
    toggle: toggleGuideSection,
    openImmediate: openGuideSectionImmediate,
  } = useSequentialAccordion<GuideSection>(initialResolved.guideSection ?? 'overview', ACCORDION_STEP_MS)
  const {
    openId: controlsOpenId,
    toggle: toggleControlsSection,
    openImmediate: openControlsSectionImmediate,
  } = useSequentialAccordion<ControlsSection>(initialResolved.controlsSection ?? 'global', ACCORDION_STEP_MS)
  const {
    openId: tipsOpenId,
    toggle: toggleTipsSection,
    openImmediate: openTipsSectionImmediate,
  } = useSequentialAccordion<TipsSection>(initialResolved.tipsSection ?? 'global', ACCORDION_STEP_MS)
  const {
    openId: faqOpenId,
    toggle: toggleFaqSection,
    openImmediate: openFaqSectionImmediate,
  } = useSequentialAccordion<number>(initialFaqIndex, ACCORDION_STEP_MS)

  const getFaqIndex = useCallback((rawSlug?: string) => {
    if (faqEntries.length === 0) {
      return null
    }
    const normalizedSlug = normalizeFaqSlug(rawSlug)
    if (!normalizedSlug) {
      return 0
    }
    return faqIndexBySlug.get(normalizedSlug) ?? 0
  }, [faqEntries.length, faqIndexBySlug])

  const applyTarget = useCallback((docId?: string, tab?: string) => {
    const resolved = resolveTarget(docId, tab)
    setActiveTab(resolved.tab)

    if (resolved.guideSection) {
      openGuideSectionImmediate(resolved.guideSection)
    }
    if (resolved.controlsSection) {
      openControlsSectionImmediate(resolved.controlsSection)
    }
    if (resolved.tipsSection) {
      openTipsSectionImmediate(resolved.tipsSection)
    }
    if (resolved.tab === 'faq') {
      openFaqSectionImmediate(getFaqIndex(resolved.faqSlug))
    }
  }, [
    getFaqIndex,
    openControlsSectionImmediate,
    openFaqSectionImmediate,
    openGuideSectionImmediate,
    openTipsSectionImmediate,
  ])

  const docNav = useMemo(() => ({
    navigate: (docId: string, tab?: string) => {
      applyTarget(docId, tab)
    },
  }), [applyTarget])

  const headerTabs: { id: HeaderTab; label: string }[] = [
    { id: 'guide', label: 'Rules' },
    { id: 'controls', label: 'Controls' },
    { id: 'tips', label: 'Tips' },
    { id: 'browse', label: 'Cards' },
    { id: 'faq', label: 'FAQ' },
  ]

  const cardTypes: { id: CardType; label: string; visible: boolean }[] = [
    { id: 'cards', label: 'Cards', visible: true },
    { id: 'upgrades', label: 'Upgrades', visible: useUpgrades !== false },
    { id: 'vanguards', label: 'Vanguards', visible: !!useVanguards },
  ]

  useEffect(() => {
    if (!onLocationChange) {
      return
    }
    onLocationChange(buildLocationLabel({
      activeTab,
      guideOpenId,
      controlsOpenId,
      tipsOpenId,
      faqOpenId,
      faqEntries,
      cardType,
    }))
  }, [
    activeTab,
    cardType,
    controlsOpenId,
    faqEntries,
    faqOpenId,
    guideOpenId,
    onLocationChange,
    tipsOpenId,
  ])

  return (
    <DocNavContext.Provider value={docNav}>
      <div className="flex h-full flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 border-b border-[rgba(212,175,55,0.24)] bg-black/20">
          <div className="overflow-x-auto overscroll-contain px-3 py-2.5 sm:px-4">
            <div className="flex min-w-max gap-1.5">
              {headerTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-full px-3 py-1.5 text-[0.78rem] font-medium transition-colors ${
                    tab.id === activeTab
                      ? 'bg-amber-400/14 text-amber-200 ring-1 ring-amber-300/25'
                      : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === 'guide' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-b border-amber-400/10">
              <AccordionItem
                id="guide-overview"
                label="Overview"
                expanded={guideOpenId === 'overview'}

                onToggle={() => toggleGuideSection('overview')}
              >
                {quickOverviewDoc ? (
                  <div className="text-sm sm:text-base">
                    <DocRenderer content={buildPhaseGuideContent(quickOverviewDoc)} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Overview content not found.</p>
                )}
              </AccordionItem>

              <AccordionItem
                id="guide-game-pieces"
                label="Game Pieces"
                expanded={guideOpenId === 'game-pieces'}

                onToggle={() => toggleGuideSection('game-pieces')}
              >
                {gamePiecesDoc ? (
                  <div className="text-sm sm:text-base">
                    <DocRenderer content={gamePiecesDoc.parsed.body} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Game pieces content not found.</p>
                )}
              </AccordionItem>

              {PHASES.map((phase) => {
                const phaseDoc = getPhaseDoc(phase)
                return (
                  <AccordionItem
                    id={`guide-${phase}`}
                    key={phase}
                    label={`${toTitleCase(phase)} Phase`}
                    expanded={guideOpenId === phase}
    
                    onToggle={() => toggleGuideSection(phase)}
                  >
                    {phaseDoc ? (
                      <div className="text-sm sm:text-base">
                        <DocRenderer content={buildPhaseGuideContent(phaseDoc)} />
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400">Rules are not defined for this phase yet.</p>
                    )}
                  </AccordionItem>
                )
              })}
            </div>
          </div>
        )}

        {activeTab === 'controls' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-b border-amber-400/10">
              <AccordionItem
                id="controls-global"
                label="Global Controls"
                expanded={controlsOpenId === 'global'}

                onToggle={() => toggleControlsSection('global')}
              >
                {controlsDoc ? (
                  <div className="text-sm sm:text-base">
                    <DocRenderer content={controlsDoc.parsed.body} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Controls content not found.</p>
                )}
              </AccordionItem>

              {PHASES.map((phase) => (
                <AccordionItem
                  id={`controls-${phase}`}
                  key={phase}
                  label={`${toTitleCase(phase)} Phase Controls`}
                  expanded={controlsOpenId === phase}
  
                  onToggle={() => toggleControlsSection(phase)}
                >
                  <PhaseControlsContent phase={phase} />
                </AccordionItem>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'tips' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-b border-amber-400/10">
              <AccordionItem
                id="tips-global"
                label="Global Tips"
                expanded={tipsOpenId === 'global'}

                onToggle={() => toggleTipsSection('global')}
              >
                {tipsDoc?.parsed.sections['global'] ? (
                  <div className="text-sm sm:text-base">
                    <DocRenderer content={tipsDoc.parsed.sections['global']} />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Global tips are not defined yet.</p>
                )}
              </AccordionItem>

              {PHASES.map((phase) => (
                <AccordionItem
                  id={`tips-${phase}`}
                  key={phase}
                  label={`${toTitleCase(phase)} Phase Tips`}
                  expanded={tipsOpenId === phase}
  
                  onToggle={() => toggleTipsSection(phase)}
                >
                  {tipsDoc?.parsed.sections[phase] ? (
                    <div className="text-sm sm:text-base">
                      <DocRenderer content={tipsDoc.parsed.sections[phase]} />
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Tips are not defined for this phase yet.</p>
                  )}
                </AccordionItem>
              ))}
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
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain border-b border-amber-400/10">
              {faqEntries.length > 0 ? (
                faqEntries.map((entry, index) => (
                  <AccordionItem
                    id={`faq-${entry.slug}`}
                    key={entry.slug}
                    label={entry.question}
                    expanded={faqOpenId === index}

                    onToggle={() => toggleFaqSection(index)}
                    labelClassName="text-white font-semibold"
                  >
                    <div className="text-sm sm:text-base text-gray-300">
                      <DocRenderer content={entry.answer} />
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

        <div className="shrink-0 px-4 py-3.5 border-t border-[rgba(212,175,55,0.45)] bg-black/30">
          <div className="flex items-center justify-between gap-3">
            <a
              href={DISCORD_INVITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#6974F4] hover:text-[#7983F5] transition-colors"
            >
              <FaDiscord className="w-4 h-4" />
              Ask for help
            </a>
            <CubeCobraPrimerLink />
          </div>
        </div>
      </div>
    </DocNavContext.Provider>
  )
}
