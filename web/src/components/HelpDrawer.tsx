import { useEffect, useState } from 'react'
import { DOCS, type DocEntry } from '../docs'
import { DocRenderer } from './DocRenderer'

interface HelpDrawerProps {
  open: boolean
  onClose: () => void
  cubeId?: string
}

const CATEGORY_LABELS: Record<string, string> = {
  'getting-started': 'Getting Started',
  phases: 'Game Phases',
  concepts: 'Concepts',
}

const CATEGORY_ORDER = ['getting-started', 'phases', 'concepts']

export function HelpDrawer({ open, onClose, cubeId }: HelpDrawerProps) {
  const [selectedDoc, setSelectedDoc] = useState<DocEntry | null>(null)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleClose = () => {
    setSelectedDoc(null)
    onClose()
  }

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedDoc) {
          setSelectedDoc(null)
        } else {
          setSelectedDoc(null)
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, selectedDoc])

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    docs: DOCS.filter((d) => d.category === cat).sort(
      (a, b) => (a.parsed.meta.order ?? 99) - (b.parsed.meta.order ?? 99),
    ),
  }))

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40" onClick={handleClose} />
      )}
      <div
        className={`fixed top-0 right-0 h-full z-50 w-[420px] max-w-full bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between shrink-0">
          {selectedDoc ? (
            <>
              <button
                onClick={() => setSelectedDoc(null)}
                className="text-gray-400 hover:text-white text-sm mr-2"
              >
                ← Back
              </button>
              <h2 className="text-white font-semibold truncate flex-1">
                {selectedDoc.parsed.meta.title}
              </h2>
            </>
          ) : (
            <h2 className="text-white font-semibold">Help</h2>
          )}
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-2xl leading-none p-1 shrink-0 ml-2"
          >
            &times;
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {selectedDoc ? (
            <DocRenderer content={selectedDoc.parsed.body} />
          ) : (
            <div className="space-y-4">
              {grouped.map(({ category, label, docs }) => (
                <div key={category}>
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                    {label}
                  </h3>
                  <div className="space-y-1">
                    {docs.map((doc) => (
                      <button
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-800 text-sm text-gray-300 hover:text-white transition-colors"
                      >
                        {doc.parsed.meta.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              <div>
                <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                  External Links
                </h3>
                <div className="space-y-1">
                  <a
                    href={`https://cubecobra.com/cube/list/${cubeId ?? 'auto'}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-3 py-2 rounded-lg hover:bg-gray-800 text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    Card Pool (CubeCobra) ↗
                  </a>
                  <a
                    href="https://discord.gg/2NAjcWXNKn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-3 py-2 rounded-lg hover:bg-gray-800 text-sm text-[#7289da] hover:text-[#99aab5] transition-colors"
                  >
                    Discord ↗
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
