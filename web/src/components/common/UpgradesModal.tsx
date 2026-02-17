import { useState, useEffect } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { CardGrid } from './CardGrid'
import { useDualZoneCardSizes } from '../../hooks/useDualZoneCardSizes'
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

  const [applyRef, applyDims] = useDualZoneCardSizes({
    topCount: isApplyMode ? upgrades.length : 0,
    bottomCount: isApplyMode ? targets.length : 0,
    topGap: 6,
    bottomGap: 6,
    fixedHeight: 0,
    topMaxWidth: 200,
    bottomMaxWidth: 200,
  })

  const [viewRef, viewDims] = useGameSummaryCardSize({
    sideboardCount: !isApplyMode ? upgrades.length : 0,
    handCount: 0,
    battlefieldCount: 0,
    commandZoneCount: 0,
  })

  const upgradeDims = isApplyMode
    ? { width: applyDims.top.width, height: applyDims.top.height }
    : { width: viewDims.sideboard.width, height: viewDims.sideboard.height }
  const targetDims = { width: applyDims.bottom.width, height: applyDims.bottom.height }

  const handleConfirm = () => {
    if (!selectedUpgrade || !selectedTarget || !onApply) return
    onApply(selectedUpgrade.id, selectedTarget.id)
    setSelectedUpgradeId(null)
    setSelectedTargetId(null)
    onClose()
  }

  const handleTargetClick = (target: CardType) => {
    setSelectedTargetId(selectedTargetId === target.id ? null : target.id)
  }

  return (
    <div
      className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-2"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 rounded-lg flex flex-col w-full h-full max-w-5xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1 shrink-0 border-b border-gray-700/50 flex justify-between items-center">
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-lg truncate">
              {isApplyMode ? (
                <>Apply Upgrade <span className="text-red-400 font-bold">Permanently</span></>
              ) : (
                'Upgrades'
              )}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none shrink-0 ml-4 p-1"
          >
            &times;
          </button>
        </div>

        {isApplyMode ? (
          <div ref={applyRef} className="flex-1 min-h-0 flex flex-col p-2">
            <div className="shrink-0 flex justify-center">
              <CardGrid columns={applyDims.top.columns} cardWidth={upgradeDims.width}>
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
                    }}
                    selected={selectedUpgradeId === upgrade.id}
                  />
                ))}
              </CardGrid>
            </div>
            <hr className="border-gray-700 my-2" />
            <div className="flex-1 min-h-0 flex justify-center">
              <CardGrid columns={applyDims.bottom.columns} cardWidth={targetDims.width}>
                {targets.map((card) => (
                  <Card
                    key={card.id}
                    card={card}
                    dimensions={targetDims}
                    onClick={() => handleTargetClick(card)}
                    selected={selectedTargetId === card.id}
                  />
                ))}
              </CardGrid>
            </div>
          </div>
        ) : (
          <div ref={viewRef} className="flex-1 min-h-0 p-2">
            <div className="h-full">
              {upgrades.length > 0 ? (
                <CardGrid columns={viewDims.sideboard.columns} cardWidth={upgradeDims.width}>
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
