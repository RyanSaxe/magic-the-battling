import { useState, useEffect } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { UpgradeConfirmationModal } from './UpgradeConfirmationModal'

interface UpgradesModalProps {
  upgrades: CardType[]
  mode: 'view' | 'apply'
  targets?: CardType[]
  onApply?: (upgradeId: string, targetId: string) => void
  onClose: () => void
}

export function UpgradesModal({ upgrades, mode, targets = [], onApply, onClose }: UpgradesModalProps) {
  const [selectedUpgrade, setSelectedUpgrade] = useState<CardType | null>(null)
  const [pendingUpgrade, setPendingUpgrade] = useState<{ upgrade: CardType; target: CardType } | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pendingUpgrade) {
          setPendingUpgrade(null)
        } else if (selectedUpgrade) {
          setSelectedUpgrade(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selectedUpgrade, pendingUpgrade])

  const applied = upgrades.filter((u) => u.upgrade_target)
  const unapplied = upgrades.filter((u) => !u.upgrade_target)

  const handleUpgradeClick = (upgrade: CardType) => {
    if (mode !== 'apply') return
    setSelectedUpgrade(upgrade)
  }

  const handleTargetClick = (target: CardType) => {
    if (!selectedUpgrade) return
    setPendingUpgrade({ upgrade: selectedUpgrade, target })
  }

  const handleConfirm = () => {
    if (!pendingUpgrade || !onApply) return
    onApply(pendingUpgrade.upgrade.id, pendingUpgrade.target.id)
    setPendingUpgrade(null)
    setSelectedUpgrade(null)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg p-6 max-w-3xl w-full max-h-[85vh] overflow-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-semibold text-lg">
            {selectedUpgrade ? 'Select Target' : 'Upgrades'}
          </h2>
          <button onClick={selectedUpgrade ? () => setSelectedUpgrade(null) : onClose} className="text-gray-400 hover:text-white text-xl">
            {selectedUpgrade ? '\u2190' : '\u2715'}
          </button>
        </div>

        {selectedUpgrade ? (
          <div>
            <p className="text-gray-400 text-sm mb-3">Choose a card to apply <span className="text-white">{selectedUpgrade.name}</span> to:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {targets.map((card) => (
                <Card
                  key={card.id}
                  card={card}
                  size="sm"
                  onClick={() => handleTargetClick(card)}
                  glow="green"
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {applied.length > 0 && (
              <div>
                <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-2">Applied</h3>
                <div className="flex flex-wrap gap-2 justify-center">
                  {applied.map((upgrade) => (
                    <UpgradeStack key={upgrade.id} upgrade={upgrade} size="sm" />
                  ))}
                </div>
              </div>
            )}
            {unapplied.length > 0 && (
              <div>
                <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-2">
                  {mode === 'apply' ? 'Click to apply' : 'Unapplied'}
                </h3>
                <div className="flex flex-wrap gap-2 justify-center">
                  {unapplied.map((upgrade) => (
                    <Card
                      key={upgrade.id}
                      card={upgrade}
                      size="sm"
                      onClick={mode === 'apply' ? () => handleUpgradeClick(upgrade) : undefined}
                      glow={mode === 'apply' ? 'green' : 'none'}
                    />
                  ))}
                </div>
              </div>
            )}
            {upgrades.length === 0 && (
              <p className="text-gray-500 text-center py-8">No upgrades yet</p>
            )}
          </div>
        )}
      </div>

      {pendingUpgrade && (
        <UpgradeConfirmationModal
          upgrade={pendingUpgrade.upgrade}
          target={pendingUpgrade.target}
          onConfirm={handleConfirm}
          onCancel={() => setPendingUpgrade(null)}
        />
      )}
    </div>
  )
}
