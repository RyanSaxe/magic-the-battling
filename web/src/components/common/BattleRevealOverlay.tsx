import { useEffect, useMemo, useState } from 'react'
import { Card } from '../card'
import type { Card as CardType } from '../../types'

interface BattleRevealOverlayProps {
  upgrade: CardType
  target: CardType
  playerName: string
  selfName: string
  onComplete: () => void
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function BattleRevealOverlay({
  upgrade,
  target,
  playerName,
  selfName,
  onComplete,
}: BattleRevealOverlayProps) {
  const [phase, setPhase] = useState<'show' | 'glow' | 'fade'>('show')

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      await wait(400)
      if (cancelled) return
      setPhase('glow')
      await wait(700)
      if (cancelled) return
      setPhase('fade')
      await wait(500)
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
    const gap = clamp(Math.round(viewportWidth * 0.03), 18, 28)
    const margin = clamp(Math.round(viewportWidth * 0.06), 20, 40)
    const cardWidth = clamp(
      Math.round(
        Math.min(
          (viewportWidth - (margin * 2) - gap) / 2,
          viewportHeight * 0.24,
        ),
      ),
      120,
      220,
    )
    const cardHeight = Math.round((cardWidth * 7) / 5)

    return {
      cardWidth,
      cardHeight,
      gap,
      left: Math.round((viewportWidth - ((cardWidth * 2) + gap)) / 2),
      top: Math.round((viewportHeight - cardHeight) / 2),
    }
  }, [])

  const isSelf = playerName === selfName
  const label = isSelf ? 'Upgrade Revealed' : `${playerName} revealed an upgrade`

  return (
    <div className="fixed inset-0 z-[86] pointer-events-none">
      <div className="build-upgrade-backdrop absolute inset-0" />
      <div
        className="fixed left-0 right-0 text-center text-white text-sm font-semibold"
        style={{ top: dims.top - 28 }}
      >
        {label}
      </div>
      <div
        className={[
          'fixed build-upgrade-row',
          phase === 'glow' && 'build-upgrade-row-glow',
          phase === 'fade' && 'build-upgrade-row-fade',
        ].filter(Boolean).join(' ')}
        style={{
          left: dims.left,
          top: dims.top,
          gap: dims.gap,
        }}
      >
        <div
          className="build-upgrade-card-shell"
          style={{ width: dims.cardWidth, height: dims.cardHeight }}
        >
          <Card
            card={target}
            dimensions={{ width: dims.cardWidth, height: dims.cardHeight }}
            upgraded
            trackDomId={false}
          />
        </div>
        <div
          className="build-upgrade-card-shell"
          style={{ width: dims.cardWidth, height: dims.cardHeight }}
        >
          <Card
            card={upgrade}
            dimensions={{ width: dims.cardWidth, height: dims.cardHeight }}
            trackDomId={false}
          />
        </div>
        <div className="build-upgrade-gold-band" />
      </div>
    </div>
  )
}
