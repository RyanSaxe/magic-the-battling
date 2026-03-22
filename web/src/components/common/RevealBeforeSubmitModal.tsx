import { useCallback, useEffect, useState } from 'react'
import type { Card as CardType } from '../../types'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { CardGrid } from './CardGrid'
import { useCardLayout } from '../../hooks/useCardLayout'

interface RevealBeforeSubmitModalProps {
  upgrades: CardType[]
  onRevealAndSubmit: (upgradeIds: string[]) => void
  onSkip: () => void
  onClose: () => void
}

export function RevealBeforeSubmitModal({
  upgrades,
  onRevealAndSubmit,
  onSkip,
  onClose,
}: RevealBeforeSubmitModalProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    upgrades.map((u) => u.id),
  )

  const toggleUpgrade = useCallback((id: string) => {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id],
    )
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      } else if (e.key === 'Enter' && selectedIds.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        onRevealAndSubmit(selectedIds)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, onRevealAndSubmit, selectedIds])

  const [ref, dims] = useCardLayout({
    zones: {
      upgrades: { count: upgrades.length },
    },
    layout: { top: ['upgrades'] },
  })

  const upgradeDims = { width: dims.upgrades.width, height: dims.upgrades.height }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="modal-chrome border gold-border rounded-lg flex flex-col w-full max-w-xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1 shrink-0 border-b gold-divider flex justify-between items-center">
          <h2 className="text-white font-semibold text-lg">Unrevealed Upgrades</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none shrink-0 ml-4 p-1"
          >
            &times;
          </button>
        </div>

        <div className="px-4 pt-3 pb-1">
          <p className="text-amber-400 text-sm">
            You have unrevealed upgrades that won&apos;t count toward poison damage.
          </p>
        </div>

        <div ref={ref} className="flex-1 min-h-0 p-2">
          <CardGrid columns={dims.upgrades.columns} cardWidth={upgradeDims.width}>
            {upgrades.map((upgrade) => (
              <UpgradeStack
                key={upgrade.id}
                upgrade={upgrade}
                dimensions={upgradeDims}
                onClick={() => toggleUpgrade(upgrade.id)}
                selected={selectedIds.includes(upgrade.id)}
              />
            ))}
          </CardGrid>
        </div>

        <div className="px-4 py-3 border-t gold-divider flex justify-end gap-3">
          <button
            onClick={onSkip}
            className="btn bg-gray-600 hover:bg-gray-500 text-white text-sm px-4 py-2 rounded"
          >
            Submit Without Revealing
          </button>
          <button
            onClick={() => onRevealAndSubmit(selectedIds)}
            disabled={selectedIds.length === 0}
            className="btn bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-5 py-2 rounded shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reveal & Submit
          </button>
        </div>
      </div>
    </div>
  )
}
