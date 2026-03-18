import { useCallback, useEffect, useState } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { CardGrid } from './CardGrid'
import { useCardLayout } from '../../hooks/useCardLayout'
import { useElementHeight } from '../../hooks/useElementHeight'
import { applyUpgradeWithModalClose, revealUpgradeWithModalClose } from './upgradeModalFlow'
import { getAppliedUpgrades, getUnappliedUpgrades, getUnrevealedAppliedUpgrades } from '../../utils/upgrades'

interface UpgradesModalProps {
  upgrades: CardType[]
  mode: 'view' | 'apply' | 'reveal'
  targets?: CardType[]
  onApply?: (upgradeId: string, targetId: string) => void
  onReveal?: (upgradeId: string) => void
  onClose: () => void
  initialTargetId?: string
}

export function UpgradesModal({
  upgrades,
  mode,
  targets = [],
  onApply,
  onReveal,
  onClose,
  initialTargetId,
}: UpgradesModalProps) {
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(() => {
    if (mode === 'apply') {
      const unapplied = getUnappliedUpgrades(upgrades)
      return unapplied.length === 1 ? unapplied[0].id : null
    }
    if (mode === 'reveal') {
      const hiddenApplied = getUnrevealedAppliedUpgrades(upgrades)
      return hiddenApplied.length === 1 ? hiddenApplied[0].id : null
    }
    return null
  })
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(initialTargetId ?? null)

  const applyUpgrade = useCallback((upgradeId: string, targetId: string) => {
    applyUpgradeWithModalClose({
      upgradeId,
      targetId,
      onApply,
      onClose,
    })
  }, [onApply, onClose])

  const revealUpgrade = useCallback((upgradeId: string) => {
    revealUpgradeWithModalClose({
      upgradeId,
      onReveal,
      onClose,
    })
  }, [onClose, onReveal])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (mode === 'apply' && selectedTargetId) {
          setSelectedTargetId(null)
        } else if (selectedUpgradeId) {
          setSelectedUpgradeId(null)
        } else {
          onClose()
        }
      } else if (e.key === 'Enter' && mode === 'apply' && selectedUpgradeId && selectedTargetId && onApply) {
        e.preventDefault()
        e.stopPropagation()
        const active = document.activeElement
        if (active instanceof HTMLElement) {
          active.blur()
        }
        applyUpgrade(selectedUpgradeId, selectedTargetId)
      } else if (e.key === 'Enter' && mode === 'reveal' && selectedUpgradeId && onReveal) {
        e.preventDefault()
        e.stopPropagation()
        const active = document.activeElement
        if (active instanceof HTMLElement) {
          active.blur()
        }
        revealUpgrade(selectedUpgradeId)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [applyUpgrade, mode, onClose, onApply, onReveal, revealUpgrade, selectedUpgradeId, selectedTargetId])

  const applied = getAppliedUpgrades(upgrades)
  const unapplied = getUnappliedUpgrades(upgrades)
  const hiddenApplied = getUnrevealedAppliedUpgrades(upgrades)
  const revealedApplied = applied.filter((upgrade) => upgrade.is_revealed !== false)
  const selectedUpgrade = (mode === 'reveal' ? hiddenApplied : unapplied).find((u) => u.id === selectedUpgradeId) ?? null
  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? null
  const readyToConfirm = mode === 'apply'
    ? !!(selectedUpgrade && selectedTarget)
    : mode === 'reveal'
      ? !!selectedUpgrade
      : false

  const isApplyMode = mode === 'apply'
  const isRevealMode = mode === 'reveal'

  const [separatorRef, separatorHeight] = useElementHeight()
  const [applyRef, applyDims] = useCardLayout({
    zones: {
      upgrades: { count: isApplyMode ? upgrades.length : 0, maxCardWidth: 200 },
      targets: { count: isApplyMode ? targets.length : 0, maxCardWidth: 200 },
    },
    layout: { top: ['upgrades'], bottomLeft: ['targets'] },
    fixedHeight: separatorHeight,
  })

  const [viewRef, viewDims] = useCardLayout({
    zones: {
      upgrades: {
        count: !isApplyMode
          ? (isRevealMode ? revealedApplied.length + hiddenApplied.length : upgrades.length)
          : 0,
      },
    },
    layout: { top: ['upgrades'] },
  })

  const upgradeDims = isApplyMode
    ? { width: applyDims.upgrades.width, height: applyDims.upgrades.height }
    : { width: viewDims.upgrades.width, height: viewDims.upgrades.height }
  const targetDims = { width: applyDims.targets.width, height: applyDims.targets.height }

  const handleConfirm = () => {
    if (!selectedUpgrade) return
    if (isApplyMode) {
      if (!selectedTarget || !onApply) return
      applyUpgrade(selectedUpgrade.id, selectedTarget.id)
      return
    }
    if (!isRevealMode || !onReveal) return
    revealUpgrade(selectedUpgrade.id)
  }

  const handleTargetClick = (target: CardType) => {
    setSelectedTargetId(selectedTargetId === target.id ? null : target.id)
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 sm:p-8"
      onClick={onClose}
    >
      <div
        className="modal-chrome border gold-border rounded-lg flex flex-col w-full h-[calc(100dvh-2rem)] sm:h-[calc(100dvh-4rem)] overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-1 shrink-0 border-b gold-divider flex justify-between items-center">
          <div className="min-w-0">
            <h2 className="text-white font-semibold text-lg truncate">
              {isApplyMode ? (
                <>Apply Upgrade <span className="text-red-400 font-bold">Permanently</span></>
              ) : isRevealMode ? (
                'Reveal Upgrade'
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
            {separatorHeight > 0 && (
              <div className="shrink-0 flex justify-center">
                <CardGrid columns={applyDims.upgrades.columns} cardWidth={upgradeDims.width}>
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
            )}
            <div ref={separatorRef} className="py-2 shrink-0"><hr className="gold-divider" /></div>
            {separatorHeight > 0 && (
              <div className="flex-1 min-h-0 flex justify-center">
                <CardGrid columns={applyDims.targets.columns} cardWidth={targetDims.width}>
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
            )}
          </div>
        ) : (
          <div ref={viewRef} className="flex-1 min-h-0 p-2">
            <div className="h-full">
              {(isRevealMode ? revealedApplied.length + hiddenApplied.length : upgrades.length) > 0 ? (
                <CardGrid columns={viewDims.upgrades.columns} cardWidth={upgradeDims.width}>
                  {(isRevealMode ? revealedApplied : upgrades).map((upgrade) =>
                    upgrade.upgrade_target ? (
                      <UpgradeStack key={upgrade.id} upgrade={upgrade} dimensions={upgradeDims} />
                    ) : (
                      <Card key={upgrade.id} card={upgrade} dimensions={upgradeDims} />
                    )
                  )}
                  {isRevealMode && hiddenApplied.map((upgrade) => (
                    <UpgradeStack
                      key={upgrade.id}
                      upgrade={upgrade}
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
              ) : (
                <p className="text-gray-500">{isRevealMode ? 'No hidden upgrades to reveal' : 'No upgrades yet'}</p>
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
