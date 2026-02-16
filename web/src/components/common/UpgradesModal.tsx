import { useState, useEffect } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'

interface UpgradesModalProps {
  upgrades: CardType[]
  mode: 'view' | 'apply'
  targets?: CardType[]
  onApply?: (upgradeId: string, targetId: string) => void
  onClose: () => void
}

export function UpgradesModal({ upgrades, mode, targets = [], onApply, onClose }: UpgradesModalProps) {
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedUpgradeId) {
          setSelectedUpgradeId(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selectedUpgradeId])

  const applied = upgrades.filter((u) => u.upgrade_target)
  const unapplied = upgrades.filter((u) => !u.upgrade_target)
  const selectedUpgrade = unapplied.find((u) => u.id === selectedUpgradeId) ?? null

  const handleTargetClick = (target: CardType) => {
    if (!selectedUpgrade || !onApply) return
    onApply(selectedUpgrade.id, target.id)
    setSelectedUpgradeId(null)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg p-6 max-w-4xl w-full max-h-[85vh] overflow-auto mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-white font-semibold text-lg">
            {mode === 'apply' ? (
              <>Apply Upgrade <span className="text-red-400 font-bold">Permanently</span></>
            ) : (
              'Upgrades'
            )}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">
            &#x2715;
          </button>
        </div>

        <div className="space-y-5">
          {unapplied.length > 0 && (
            <div>
              <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-2">
                {mode === 'apply' ? 'Select an upgrade to apply' : 'Unapplied'}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {unapplied.map((upgrade) => (
                  <Card
                    key={upgrade.id}
                    card={upgrade}
                    size="sm"
                    onClick={mode === 'apply' ? () => setSelectedUpgradeId(
                      selectedUpgradeId === upgrade.id ? null : upgrade.id
                    ) : undefined}
                    selected={selectedUpgradeId === upgrade.id}
                    glow={mode === 'apply' ? 'green' : 'none'}
                  />
                ))}
              </div>
            </div>
          )}

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

          {mode === 'apply' && (
            <div>
              <h3 className="text-gray-400 text-xs uppercase tracking-wide mb-2">
                {selectedUpgrade
                  ? <>Click a card to apply <span className="text-white">{selectedUpgrade.name}</span> to</>
                  : 'Your pool'}
              </h3>
              <div className="flex flex-wrap gap-2 justify-center">
                {targets.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    size="sm"
                    onClick={selectedUpgrade ? () => handleTargetClick(card) : undefined}
                    glow={selectedUpgrade ? 'green' : 'none'}
                  />
                ))}
              </div>
            </div>
          )}

          {upgrades.length === 0 && (
            <p className="text-gray-500 text-center py-8">No upgrades yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
