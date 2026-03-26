import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [phase, setPhase] = useState<'show' | 'glow' | 'fade'>('show')
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete })

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      await wait(520)
      if (cancelled) return
      setPhase('glow')
      await wait(960)
      if (cancelled) return
      setPhase('fade')
      await wait(760)
      if (cancelled) return
      onCompleteRef.current()
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

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

  return (
    <div className="fixed inset-0 z-[86] pointer-events-none">
      <div className="build-upgrade-backdrop absolute inset-0" />
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
