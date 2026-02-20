import { useState, useEffect, useRef } from 'react'
import { DOCS, type DocEntry } from '../docs'
import { DocRenderer } from './DocRenderer'
import { PHASE_HOTKEYS, type HotkeyEntry } from '../constants/hotkeys'
import { getGameCards, type GameCardsResponse } from '../api/client'
import { CardPreviewModal } from './card/CardPreviewModal'
import type { Card } from '../types'

export interface RulesPanelTarget {
  docId: string
  tab?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  phases: 'Game Phases',
  concepts: 'Concepts',
}

const CATEGORY_ORDER = ['getting-started', 'phases', 'concepts']

function groupedDocs() {
  return CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    docs: DOCS.filter((d) => d.category === cat).sort(
      (a, b) => (a.parsed.meta.order ?? 99) - (b.parsed.meta.order ?? 99),
    ),
  }))
}

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

function ControlsTab({ phase }: { phase: string }) {
  const doc = DOCS.find((d) => d.parsed.meta.phase === phase)
  const controlsMarkdown = doc?.parsed.sections['controls']
  const hotkeys = PHASE_HOTKEYS[phase] ?? []
  const hoverHotkeys = PHASE_HOTKEYS[`${phase}-hover`] ?? []

  return (
    <div className="space-y-4">
      {controlsMarkdown && <DocRenderer content={controlsMarkdown} />}

      {hotkeys.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Keyboard Shortcuts
          </h3>
          <div className="space-y-1.5">
            {hotkeys.map((entry) => (
              <HotkeyRow key={entry.key} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {hoverHotkeys.length > 0 && (
        <div>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            When Hovering a Card
          </h3>
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

function TabContent({ doc, tab }: { doc: DocEntry; tab: string }) {
  const phase = doc.parsed.meta.phase
  if (tab === 'controls' && phase) {
    return <ControlsTab phase={phase} />
  }
  const sectionContent = doc.parsed.sections[tab]
  if (!sectionContent) return null
  return <DocRenderer content={sectionContent} />
}

const COLOR_CHIPS: { code: string; label: string; bg: string; text: string; ring: string }[] = [
  { code: 'W', label: 'W', bg: 'bg-amber-100', text: 'text-amber-900', ring: 'ring-amber-300' },
  { code: 'U', label: 'U', bg: 'bg-blue-500', text: 'text-white', ring: 'ring-blue-400' },
  { code: 'B', label: 'B', bg: 'bg-purple-900', text: 'text-gray-200', ring: 'ring-purple-500' },
  { code: 'R', label: 'R', bg: 'bg-red-600', text: 'text-white', ring: 'ring-red-400' },
  { code: 'G', label: 'G', bg: 'bg-green-600', text: 'text-white', ring: 'ring-green-400' },
  { code: 'C', label: 'C', bg: 'bg-gray-500', text: 'text-white', ring: 'ring-gray-400' },
]

function CardsView({ gameId, which }: { gameId: string; which: 'cards' | 'upgrades' }) {
  const [data, setData] = useState<GameCardsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set())
  const [previewCard, setPreviewCard] = useState<Card | null>(null)
  const cacheRef = useRef<GameCardsResponse | null>(null)

  useEffect(() => {
    if (cacheRef.current) {
      setData(cacheRef.current)
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    getGameCards(gameId)
      .then((result) => {
        if (cancelled) return
        cacheRef.current = result
        setData(result)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load cards')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [gameId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    return <div className="text-red-400 text-center py-8">{error}</div>
  }

  const allCards = which === 'cards' ? data?.cards ?? [] : data?.upgrades ?? []
  const query = search.toLowerCase()

  const filtered = allCards.filter((card) => {
    if (query) {
      const matchesSearch =
        card.name.toLowerCase().includes(query) ||
        card.type_line.toLowerCase().includes(query) ||
        (card.oracle_text?.toLowerCase().includes(query) ?? false)
      if (!matchesSearch) return false
    }
    if (selectedColors.size > 0) {
      if (selectedColors.has('C')) {
        if (card.colors.length === 0) return true
      }
      if (card.colors.some((c) => selectedColors.has(c))) return true
      return false
    }
    return true
  })

  const toggleColor = (code: string) => {
    setSelectedColors((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search cards..."
        className="w-full bg-gray-800 text-white rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-gray-500"
      />

      <div className="flex items-center gap-1.5 flex-wrap">
        {COLOR_CHIPS.map(({ code, label, bg, text, ring }) => (
          <button
            key={code}
            onClick={() => toggleColor(code)}
            className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center transition-all ${bg} ${text} ${
              selectedColors.has(code) ? `ring-2 ${ring} scale-110` : 'opacity-50 hover:opacity-75'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="text-xs text-gray-500">
        {filtered.length === allCards.length
          ? `${allCards.length} cards`
          : `${filtered.length} of ${allCards.length} cards`}
      </div>

      {filtered.length === 0 ? (
        <div className="text-gray-500 text-center py-8">No cards match</div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {filtered.map((card) => (
            <img
              key={card.id}
              src={card.image_url}
              alt={card.name}
              title={card.name}
              className="cursor-pointer hover:brightness-125 transition-all"
              style={{ borderRadius: 'var(--card-border-radius)' }}
              onClick={() => setPreviewCard(card)}
            />
          ))}
        </div>
      )}

      {previewCard && (
        <CardPreviewModal
          card={previewCard}
          appliedUpgrades={[]}
          onClose={() => setPreviewCard(null)}
        />
      )}
    </div>
  )
}

const BROWSE_IDS = ['__cards__', '__upgrades__'] as const

interface RulesPanelContentProps {
  initialDocId?: string
  initialTab?: string
  cubeId?: string
  gameId?: string
}

export function RulesPanelContent({
  initialDocId = 'overview',
  initialTab,
  cubeId,
  gameId,
}: RulesPanelContentProps) {
  const [selectedDocId, setSelectedDocId] = useState(initialDocId)
  const [activeTab, setActiveTab] = useState(initialTab ?? '')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    setSelectedDocId(initialDocId)
  }, [initialDocId])

  useEffect(() => {
    setActiveTab(initialTab ?? '')
  }, [initialTab])

  const isBrowseView = (BROWSE_IDS as readonly string[]).includes(selectedDocId)
  const doc = isBrowseView ? null : (DOCS.find((d) => d.id === selectedDocId) ?? DOCS[0])
  const tabs = doc?.parsed.sectionOrder ?? []
  const showTabs = tabs.length > 1

  const resolvedTab = activeTab && tabs.includes(activeTab) ? activeTab : tabs[0] ?? ''

  const handleDocSelect = (id: string) => {
    setSelectedDocId(id)
    if (!(BROWSE_IDS as readonly string[]).includes(id)) {
      const newDoc = DOCS.find((d) => d.id === id)
      setActiveTab(newDoc?.parsed.sectionOrder[0] ?? '')
    }
    setMobileNavOpen(false)
  }

  const groups = groupedDocs()

  const currentTitle = isBrowseView
    ? (selectedDocId === '__cards__' ? 'Card Pool' : 'Upgrades')
    : (doc?.parsed.meta.title ?? '')

  const sidebar = (
    <nav className="space-y-4 py-3 px-3">
      {groups.map(({ category, label, docs }) => (
        <div key={category}>
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 px-2">
            {label}
          </h3>
          <div className="space-y-0.5">
            {docs.map((d) => (
              <button
                key={d.id}
                onClick={() => handleDocSelect(d.id)}
                className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                  d.id === selectedDocId
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`}
              >
                {d.parsed.meta.title}
              </button>
            ))}
          </div>
        </div>
      ))}

      {gameId && (
        <div className="border-t border-gray-700/50 pt-3">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 px-2">
            Browse
          </h3>
          <div className="space-y-0.5">
            <button
              onClick={() => handleDocSelect('__cards__')}
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                selectedDocId === '__cards__'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              Card Pool
            </button>
            <button
              onClick={() => handleDocSelect('__upgrades__')}
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                selectedDocId === '__upgrades__'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              Upgrades
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-gray-700/50 pt-3">
        <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5 px-2">
          External Links
        </h3>
        <div className="space-y-0.5">
          <a
            href={`https://cubecobra.com/cube/list/${cubeId ?? 'auto'}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-2 py-1.5 rounded text-sm text-amber-400 hover:text-amber-300 hover:bg-gray-800 transition-colors"
          >
            Card Pool (CubeCobra) ↗
          </a>
          <a
            href="https://discord.gg/2NAjcWXNKn"
            target="_blank"
            rel="noopener noreferrer"
            className="block px-2 py-1.5 rounded text-sm text-[#7289da] hover:text-[#99aab5] hover:bg-gray-800 transition-colors"
          >
            Discord ↗
          </a>
        </div>
      </div>
    </nav>
  )

  return (
    <div className="flex flex-1 min-h-0">
      {/* Desktop sidebar */}
      <div className="hidden sm:block w-[200px] shrink-0 border-r border-gray-700/50 overflow-y-auto">
        {sidebar}
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Mobile nav toggle */}
        <div className="sm:hidden px-4 py-2 border-b border-gray-700/50">
          <button
            onClick={() => setMobileNavOpen((v) => !v)}
            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white w-full"
          >
            <span className="truncate">{currentTitle}</span>
            <span className="text-gray-500 shrink-0">{mobileNavOpen ? '▴' : '▾'}</span>
          </button>
          {mobileNavOpen && (
            <div className="mt-2 bg-gray-800 rounded-lg border border-gray-700 max-h-[50vh] overflow-y-auto">
              {sidebar}
            </div>
          )}
        </div>

        {isBrowseView && gameId ? (
          <>
            <div className="px-4 pt-3">
              <h2 className="text-lg font-semibold text-white mb-2">{currentTitle}</h2>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <CardsView
                gameId={gameId}
                which={selectedDocId === '__cards__' ? 'cards' : 'upgrades'}
              />
            </div>
          </>
        ) : doc && (
          <>
            {/* Doc heading + tabs */}
            <div className="px-4 pt-3">
              <h2 className="text-lg font-semibold text-white mb-2">{doc.parsed.meta.title}</h2>
              {showTabs && (
                <div className="flex gap-1 border-b border-gray-700/50 -mx-4 px-4">
                  {tabs.map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`px-3 py-1.5 text-sm capitalize transition-colors border-b-2 -mb-px ${
                        tab === resolvedTab
                          ? 'text-amber-400 border-amber-400'
                          : 'text-gray-400 border-transparent hover:text-gray-200'
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <TabContent doc={doc} tab={resolvedTab} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface RulesPanelProps {
  onClose: () => void
  initialDocId?: string
  initialTab?: string
  cubeId?: string
  gameId?: string
}

export function RulesPanel({ onClose, initialDocId, initialTab, cubeId, gameId }: RulesPanelProps) {
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
        className="bg-gray-900 rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2.5 border-b border-gray-700/50 flex justify-between items-center shrink-0">
          <h2 className="text-white font-semibold">Rules & Help</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none p-1"
          >
            &times;
          </button>
        </div>
        <RulesPanelContent
          initialDocId={initialDocId}
          initialTab={initialTab}
          cubeId={cubeId}
          gameId={gameId}
        />
      </div>
    </div>
  )
}
