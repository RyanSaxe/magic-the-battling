import { useEffect, useMemo, useState } from 'react'
import { Card } from '../card'
import type { Card as CardType } from '../../types'

interface BuildUpgradeOverlayProps {
  upgrade: CardType
  target: CardType
  onComplete: () => void
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function BuildUpgradeOverlay({
  upgrade,
  target,
  onComplete,
}: BuildUpgradeOverlayProps) {
  const [phase, setPhase] = useState<'enlarge' | 'glow' | 'fade'>('enlarge')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      await wait(520)
      if (cancelled) return
      setPhase('glow')
      await wait(1080)
      if (cancelled) return
      setPhase('fade')
      await wait(820)
      if (cancelled) return
      onComplete()
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [onComplete])

  const dims = useMemo(() => {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const targetWidth = clamp(Math.round(viewportWidth * 0.18), 220, 320)
    const targetHeight = Math.round((targetWidth * 7) / 5)
    const upgradeWidth = clamp(Math.round(targetWidth * 0.74), 160, 240)
    const upgradeHeight = Math.round((upgradeWidth * 7) / 5)

    return {
      targetWidth,
      targetHeight,
      upgradeWidth,
      upgradeHeight,
      centerX: viewportWidth / 2,
      centerY: viewportHeight / 2,
    }
  }, [])

  return (
    <div className="fixed inset-0 z-[86] pointer-events-none">
      <div className="absolute inset-0 bg-black/12 backdrop-blur-[1.2px]" />
      <div
        className={[
          'fixed battle-upgrade-target',
          phase === 'glow' && 'battle-upgrade-target-glow',
          phase === 'fade' && 'battle-upgrade-target-fade',
        ].filter(Boolean).join(' ')}
        style={{
          left: dims.centerX - dims.targetWidth / 2,
          top: dims.centerY - dims.targetHeight / 2 + 28,
          width: dims.targetWidth,
          height: dims.targetHeight,
        }}
      >
        <Card
          card={target}
          dimensions={{ width: dims.targetWidth, height: dims.targetHeight }}
          upgraded
          trackDomId={false}
        />
        <div className="battle-upgrade-gold-flare" />
      </div>

      <div
        className={[
          'fixed battle-upgrade-source',
          phase === 'glow' && 'battle-upgrade-source-glow',
          phase === 'fade' && 'battle-upgrade-source-fade',
        ].filter(Boolean).join(' ')}
        style={{
          left: dims.centerX + dims.targetWidth * 0.18,
          top: dims.centerY - dims.targetHeight * 0.52,
          width: dims.upgradeWidth,
          height: dims.upgradeHeight,
        }}
      >
        <Card
          card={upgrade}
          dimensions={{ width: dims.upgradeWidth, height: dims.upgradeHeight }}
          trackDomId={false}
        />
      </div>
    </div>
  )
}
