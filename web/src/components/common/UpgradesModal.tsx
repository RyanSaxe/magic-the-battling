import { useCallback, useEffect, useRef, useState } from 'react'
import type { Card as CardType } from '../../types'
import { Card } from '../card'
import { UpgradeStack } from '../sidebar/UpgradeStack'
import { CardGrid } from './CardGrid'
import { CloseButton } from './CloseButton'
import { DIALOG_BACKDROP } from './styles'
import { useCardLayout } from '../../hooks/useCardLayout'
import { upgradeApplyLayoutConfig, upgradeListLayoutConfig } from './upgradeModalLayouts'
import { useElementHeight } from '../../hooks/useElementHeight'
import { applyUpgradeWithModalClose, revealUpgradeWithModalClose } from './upgradeModalFlow'
import { getAppliedUpgrades, getUnappliedUpgrades, getUnrevealedAppliedUpgrades } from '../../utils/upgrades'
import { enterPressesControl } from '../../utils/enterKey'

interface UpgradesModalProps {
  upgrades: CardType[]
  mode: 'view' | 'apply' | 'reveal'
  targets?: CardType[]
  onApply?: (upgradeId: string, targetId: string) => void
  onReveal?: (upgradeIds: string[]) => void
  onClose: () => void
  initialTargetId?: string
  initialUpgradeId?: string
  initialRevealUpgradeIds?: string[]
}

export function UpgradesModal({
  upgrades,
  mode,
  targets = [],
  onApply,
  onReveal,
  onClose,
  initialTargetId,
  initialUpgradeId,
  initialRevealUpgradeIds = [],
}: UpgradesModalProps) {
  const applied = getAppliedUpgrades(upgrades)
  const unapplied = getUnappliedUpgrades(upgrades)
  const hiddenApplied = getUnrevealedAppliedUpgrades(upgrades)
  const revealedApplied = applied.filter((upgrade) => upgrade.is_revealed !== false)
  const [selectedUpgradeId, setSelectedUpgradeId] = useState<string | null>(() => (
    mode === 'apply'
      ? (
          unapplied.some((upgrade) => upgrade.id === initialUpgradeId)
            ? initialUpgradeId ?? null
            : unapplied.length === 1
              ? unapplied[0].id
              : null
        )
      : null
  ))
  const [selectedRevealUpgradeIds, setSelectedRevealUpgradeIds] = useState<string[]>(() => {
    if (mode !== 'reveal') return []

    const hiddenUpgradeIds = new Set(hiddenApplied.map((upgrade) => upgrade.id))
    const initialSelection = initialRevealUpgradeIds.filter((upgradeId) => hiddenUpgradeIds.has(upgradeId))
    if (initialSelection.length > 0) return initialSelection
    return hiddenApplied.length === 1 ? [hiddenApplied[0].id] : []
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

  const revealUpgrade = useCallback((upgradeIds: string[]) => {
    revealUpgradeWithModalClose({
      upgradeIds,
      onReveal,
      onClose,
    })
  }, [onClose, onReveal])

  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // The Enter that opened this can still be held down, and neither applying nor revealing can be undone.
      if (e.key === 'Enter' && e.repeat) { e.preventDefault(); return }
      if (enterPressesControl(e, dialogRef.current)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (mode === 'reveal' && selectedRevealUpgradeIds.length > 0) {
          setSelectedRevealUpgradeIds([])
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
      } else if (e.key === 'Enter' && mode === 'reveal' && selectedRevealUpgradeIds.length > 0 && onReveal) {
        e.preventDefault()
        e.stopPropagation()
        const active = document.activeElement
        if (active instanceof HTMLElement) {
          active.blur()
        }
        revealUpgrade(selectedRevealUpgradeIds)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    applyUpgrade,
    mode,
    onClose,
    onApply,
    onReveal,
    revealUpgrade,
    selectedRevealUpgradeIds,
    selectedTargetId,
    selectedUpgradeId,
  ])

  const selectedUpgrade = unapplied.find((u) => u.id === selectedUpgradeId) ?? null
  const selectedTarget = targets.find((t) => t.id === selectedTargetId) ?? null
  const readyToConfirm = mode === 'apply'
    ? !!(selectedUpgrade && selectedTarget)
    : mode === 'reveal'
      ? selectedRevealUpgradeIds.length > 0
      : false

  const isApplyMode = mode === 'apply'
  const isRevealMode = mode === 'reveal'

  const [separatorRef, separatorHeight] = useElementHeight()
  const [applyRef, applyDims] = useCardLayout(upgradeApplyLayoutConfig({
    upgradeCount: isApplyMode ? upgrades.length : 0,
    targetCount: isApplyMode ? targets.length : 0,
    separatorHeight,
  }))

  const [viewRef, viewDims] = useCardLayout(upgradeListLayoutConfig(
    !isApplyMode
      ? (isRevealMode ? revealedApplied.length + hiddenApplied.length : upgrades.length)
      : 0,
  ))

  const upgradeDims = isApplyMode
    ? { width: applyDims.upgrades.width, height: applyDims.upgrades.height }
    : { width: viewDims.upgrades.width, height: viewDims.upgrades.height }
  const targetDims = { width: applyDims.targets.width, height: applyDims.targets.height }

  const handleConfirm = () => {
    if (isApplyMode) {
      if (!selectedUpgrade) return
      if (!selectedTarget || !onApply) return
      applyUpgrade(selectedUpgrade.id, selectedTarget.id)
      return
    }
    if (!isRevealMode || !onReveal) return
    revealUpgrade(selectedRevealUpgradeIds)
  }

  const handleTargetClick = (target: CardType) => {
    setSelectedTargetId(selectedTargetId === target.id ? null : target.id)
  }

  const handleRevealUpgradeClick = (upgradeId: string) => {
    setSelectedRevealUpgradeIds((current) =>
      current.includes(upgradeId)
        ? current.filter((id) => id !== upgradeId)
        : [...current, upgradeId],
    )
  }

  return (
    <div
      className={`fixed inset-0 ${DIALOG_BACKDROP} flex items-center justify-center z-50 p-4 sm:p-8`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
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
          <CloseButton onClick={onClose} label="Close Upgrades" className="shrink-0 ml-4 my-[3px]" />
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
                      onClick={() => handleRevealUpgradeClick(upgrade.id)}
                      selected={selectedRevealUpgradeIds.includes(upgrade.id)}
                    />
                  ))}
                </CardGrid>
              ) : (
                <p className="text-[var(--ivory-muted)]">{isRevealMode ? 'No hidden upgrades to reveal' : 'No upgrades yet'}</p>
              )}
            </div>
          </div>
        )}
        {readyToConfirm && (
          <button
            onClick={handleConfirm}
            className="btn btn-primary absolute bottom-4 right-4 text-sm font-semibold"
          >
            Confirm
          </button>
        )}
      </div>
    </div>
  )
}
