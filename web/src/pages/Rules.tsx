import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DOCS, type DocEntry } from '../docs'
import { DocRenderer } from '../components/DocRenderer'

const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  phases: 'Game Phases',
  concepts: 'Concepts',
}

const CATEGORY_ORDER = ['getting-started', 'phases', 'concepts']

export function Rules() {
  const navigate = useNavigate()
  const [selectedDoc, setSelectedDoc] = useState<DocEntry | null>(null)

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    docs: DOCS.filter((d) => d.category === cat).sort(
      (a, b) => (a.parsed.meta.order ?? 99) - (b.parsed.meta.order ?? 99),
    ),
  }))

  return (
    <div className="game-table h-dvh flex flex-col overflow-hidden">
      <header className="shrink-0 px-4 sm:px-6 py-3 border-b border-gray-700/50">
        <div className="flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold text-white">
            {selectedDoc ? selectedDoc.parsed.meta.title : 'Rules & Help'}
          </h1>
          <div className="flex items-center gap-2">
            {selectedDoc && (
              <button
                onClick={() => setSelectedDoc(null)}
                className="btn btn-secondary text-sm"
              >
                Back
              </button>
            )}
            <button
              onClick={() => navigate('/')}
              className="btn btn-secondary text-sm"
            >
              Home
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {selectedDoc ? (
          <div className="max-w-2xl mx-auto">
            <DocRenderer content={selectedDoc.parsed.body} />
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-6">
            {grouped.map(({ category, label, docs }) => (
              <div key={category}>
                <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide mb-3">
                  {label}
                </h2>
                <div className="grid gap-2">
                  {docs.map((doc) => (
                    <button
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="text-left px-4 py-3 rounded-lg bg-black/30 hover:bg-black/50 border border-gray-700/50 hover:border-gray-600 transition-colors"
                    >
                      <span className="text-white font-medium">
                        {doc.parsed.meta.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
