import { useState, useEffect } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { CardGrid } from './CardGrid'
import { useGameSummaryCardSize } from '../../hooks/useGameSummaryCardSize'

interface UpgradesModalProps {
  upgrades: CardType[]
  mode: 'view' | 'apply'
  targets?: CardType[]
  onApply?: (upgradeId: string, targetId: string) => void
  onClose: () => void
}

export function UpgradesModal({ upgrades, mode, targets = [], onApply, onClose }: UpgradesModalProps) {
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedTargetId) {
          setSelectedTargetId(null)
        } else if (selectedUpgradeId) {
          setSelectedUpgradeId(null)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, selectedUpgradeId, selectedTargetId])

  const applied = upgrades.filter((u) => u.upgrade_target)
  const unapplied = upgrades.filter((u) => !u.upgrade_target)
  const selectedUpgrade = unapplied.find((u) => u.id === selectedUpgradeId) ?? null
  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? null
  const readyToConfirm = selectedUpgrade && selectedTarget

  const isApplyMode = mode === 'apply'

  const [czRef, czDims] = useGameSummaryCardSize({
    sideboardCount: isApplyMode ? upgrades.length : 0,
    handCount: 0,
    battlefieldCount: 0,
    commandZoneCount: 0,
    maxCardWidth: 150,
  })

  const [poolRef, poolDims] = useGameSummaryCardSize({
    sideboardCount: isApplyMode ? targets.length : upgrades.length,
    handCount: 0,
    battlefieldCount: 0,
    commandZoneCount: 0,
  })

  const upgradeDims = isApplyMode
    ? { width: czDims.sideboard.width, height: czDims.sideboard.height }
    : { width: poolDims.sideboard.width, height: poolDims.sideboard.height }
  const targetDims = { width: poolDims.sideboard.width, height: poolDims.sideboard.height }

  const handleConfirm = () => {
    if (!selectedUpgrade || !selectedTarget || !onApply) return
    onApply(selectedUpgrade.id, selectedTarget.id)
    setSelectedUpgradeId(null)
    setSelectedTargetId(null)
    onClose()
  }

  const handleTargetClick = (target: CardType) => {
    if (!selectedUpgrade) return
    setSelectedTargetId(selectedTargetId === target.id ? null : target.id)
  }

  const subtitle = isApplyMode
    ? readyToConfirm
      ? `Apply ${selectedUpgrade.name} to ${selectedTarget.name}?`
      : selectedUpgrade
        ? `Now select a card from your pool`
        : 'Select an upgrade, then click a card from your pool'
    : '\u00A0'

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg flex flex-col w-full h-full max-w-5xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-2 shrink-0 border-b border-gray-700/50 flex justify-between items-center">
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-lg truncate">
              {isApplyMode ? (
                <>Apply Upgrade <span className="text-red-400 font-bold">Permanently</span></>
              ) : (
                'Upgrades'
              )}
            </h2>
            <p className="text-gray-400 text-sm truncate">{subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none shrink-0 ml-4 p-1"
          >
            &times;
          </button>
        </div>

        {isApplyMode ? (
          <div className="flex-1 min-h-0 flex flex-col p-[1px]">
            <div className="flex flex-1" style={{ gap: 1 }}>
              <div ref={czRef} style={{ minWidth: '5.5rem', maxWidth: '33%' }}>
                <div className="bg-black/30 px-3 pt-5 pb-3 h-full flex items-center justify-center">
                  <CardGrid columns={czDims.sideboard.columns} cardWidth={upgradeDims.width}>
                    {applied.map((upgrade) => (
                      <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={upgradeDims} />
                    ))}
                    {unapplied.map((upgrade) => (
                      <Card
                        key={upgrade.id}
                        card={upgrade}
                        dimensions={upgradeDims}
                        onClick={() => {
                          if (selectedUpgradeId === upgrade.id) {
                            setSelectedUpgradeId(null)
                          } else {
                            setSelectedUpgradeId(upgrade.id)
                          }
                          setSelectedTargetId(null)
                        }}
                        selected={selectedUpgradeId === upgrade.id}
                      />
                    ))}
                  </CardGrid>
                </div>
              </div>
              <div ref={poolRef} className="flex-1 min-w-0 flex flex-col" style={{ gap: 1 }}>
                <div className="bg-black/30 px-3 pt-5 pb-3 flex-1">
                  <CardGrid columns={poolDims.sideboard.columns} cardWidth={targetDims.width}>
                    {targets.map((card) => (
                      <Card
                        key={card.id}
                        card={card}
                        dimensions={targetDims}
                        onClick={selectedUpgrade ? () => handleTargetClick(card) : undefined}
                        selected={selectedTargetId === card.id}
                      />
                    ))}
                  </CardGrid>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div ref={poolRef} className="flex-1 min-h-0 p-[1px]">
            <div className="bg-black/30 px-3 pt-5 pb-3 h-full">
              {upgrades.length > 0 ? (
                <CardGrid columns={poolDims.sideboard.columns} cardWidth={upgradeDims.width}>
                  {upgrades.map((upgrade) =>
                    upgrade.upgrade_target ? (
                      <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={upgradeDims} />
                    ) : (
                      <Card key={upgrade.id} card={upgrade} dimensions={upgradeDims} />
                    )
                  )}
                </CardGrid>
              ) : (
                <p className="text-gray-500">No upgrades yet</p>
              )}
            </div>
          </div>
        )}
        {readyToConfirm && (
          <button
            onClick={handleConfirm}
            className="absolute bottom-4 right-4 bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold px-5 py-2 rounded shadow-lg transition-colors"
          >
            Confirm
          </button>
        )}
      </div>
    </div>
  )
}
