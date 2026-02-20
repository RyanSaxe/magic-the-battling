import { useState, useEffect } from 'react'
import { DOCS, type DocEntry } from '../docs'
import { DocRenderer } from './DocRenderer'
import { PHASE_HOTKEYS, type HotkeyEntry } from '../constants/hotkeys'

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

interface RulesPanelContentProps {
  initialDocId?: string
  initialTab?: string
  cubeId?: string
}

export function RulesPanelContent({
  initialDocId = 'overview',
  initialTab,
  cubeId,
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

  const doc = DOCS.find((d) => d.id === selectedDocId) ?? DOCS[0]
  const tabs = doc.parsed.sectionOrder
  const showTabs = tabs.length > 1

  const resolvedTab = activeTab && tabs.includes(activeTab) ? activeTab : tabs[0] ?? ''

  const handleDocSelect = (id: string) => {
    setSelectedDocId(id)
    const newDoc = DOCS.find((d) => d.id === id)
    setActiveTab(newDoc?.parsed.sectionOrder[0] ?? '')
    setMobileNavOpen(false)
  }

  const groups = groupedDocs()

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
            <span className="truncate">{doc.parsed.meta.title}</span>
            <span className="text-gray-500 shrink-0">{mobileNavOpen ? '▴' : '▾'}</span>
          </button>
          {mobileNavOpen && (
            <div className="mt-2 bg-gray-800 rounded-lg border border-gray-700 max-h-[50vh] overflow-y-auto">
              {sidebar}
            </div>
          )}
        </div>

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
      </div>
    </div>
  )
}

interface RulesPanelProps {
  onClose: () => void
  initialDocId?: string
  initialTab?: string
  cubeId?: string
}

export function RulesPanel({ onClose, initialDocId, initialTab, cubeId }: RulesPanelProps) {
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
        />
      </div>
    </div>
  )
}
