import { useState, useEffect, useCallback, useRef } from 'react'
import { SHOWCASE_STAGES } from '../../constants/showcaseCards'
import type { Card as CardType } from '../../types'
import { Card } from '../card/Card'
import { BasicLandCard } from '../common/BasicLandCard'
import { TreasureCard } from '../common/TreasureCard'
import { UpgradeStack } from '../sidebar/UpgradeStack'

const CYCLE_INTERVAL = 4000
const FADE_DURATION = 400
const MAX_HAND_SIZE = 5
const CARD_GAP = 12

type UpgradePhase = 'hidden' | 'enlarge' | 'slide-in' | 'linger' | 'glow' | 'shrink' | 'done'

const UPGRADE_TIMINGS = {
  startDelay: 500,
  enlargeDuration: 500,
  slideInDuration: 600,
  lingerDuration: 1000,
  glowDuration: 600,
  shrinkDuration: 500,
}

function computeShowcaseSizes(vw: number, vh: number) {
  const isMobile = vw < 640
  const availableWidth = vw - (isMobile ? 32 : 64)
  const maxWidthFromViewport = Math.floor((availableWidth - CARD_GAP * (MAX_HAND_SIZE - 1)) / MAX_HAND_SIZE)
  const maxHeightFromViewport = Math.round(vh * (isMobile ? 0.28 : 0.38))
  const cardHeight = Math.min(maxHeightFromViewport, Math.round(maxWidthFromViewport * 7 / 5))
  const cardWidth = Math.round(cardHeight * 5 / 7)
  const fieldHeight = Math.round(cardHeight * 0.55)
  const fieldWidth = Math.round(fieldHeight * 5 / 7)

  return {
    hand: { width: cardWidth, height: cardHeight },
    field: { width: fieldWidth, height: fieldHeight },
  }
}

function useShowcaseSizes() {
  const [sizes, setSizes] = useState(() => computeShowcaseSizes(window.innerWidth, window.innerHeight))

  useEffect(() => {
    const handleResize = () => setSizes(computeShowcaseSizes(window.innerWidth, window.innerHeight))
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return sizes
}

function UpgradeSourceCard({ card, dimensions, phase, targetPosition }: {
  card: CardType
  dimensions: { width: number; height: number }
  phase: UpgradePhase
  targetPosition: { centerY: number; right: number } | null
}) {
  const isVisible = phase === 'slide-in' || phase === 'linger'
  const isFading = phase === 'glow'

  const enlargedWidth = Math.round(dimensions.width * 1.5)
  const enlargedHeight = Math.round(dimensions.height * 1.5)

  const centerY = targetPosition?.centerY ?? window.innerHeight / 2
  const top = centerY - enlargedHeight / 2
  const left = targetPosition ? targetPosition.right + 16 : window.innerWidth / 2

  const style: React.CSSProperties = {
    top,
    left,
    width: enlargedWidth,
    height: enlargedHeight,
    transform: isVisible || isFading ? 'translateX(0)' : `translateX(${window.innerWidth}px)`,
  }

  const className = [
    'upgrade-source',
    (isVisible || isFading) && !isFading && 'phase-slide-in',
    isFading && 'phase-fade-out',
  ].filter(Boolean).join(' ')

  return (
    <div className={className} style={style}>
      <Card card={card} dimensions={{ width: enlargedWidth, height: enlargedHeight }} />
    </div>
  )
}

export function CardShowcase() {
  const [currentStage, setCurrentStage] = useState(0)
  const [fading, setFading] = useState(false)
  const [upgradePhase, setUpgradePhase] = useState<UpgradePhase>('hidden')
  const [myrUpgraded, setMyrUpgraded] = useState(false)
  const [targetPosition, setTargetPosition] = useState<{ centerY: number; right: number } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stageRef = useRef(currentStage)
  const targetCardRef = useRef<HTMLDivElement | null>(null)
  const sizes = useShowcaseSizes()

  useEffect(() => { stageRef.current = currentStage }, [currentStage])

  const runUpgradeSequence = useCallback(() => {
    const rect = targetCardRef.current?.getBoundingClientRect()
    if (rect) {
      setTargetPosition({ centerY: rect.top + rect.height / 2, right: rect.right })
    }
    const { startDelay, enlargeDuration, slideInDuration, lingerDuration, glowDuration, shrinkDuration } = UPGRADE_TIMINGS
    const t1 = startDelay
    const t2 = t1 + enlargeDuration
    const t3 = t2 + slideInDuration
    const t4 = t3 + lingerDuration
    const t5 = t4 + glowDuration
    const t6 = t5 + shrinkDuration

    setTimeout(() => setUpgradePhase('enlarge'), t1)
    setTimeout(() => setUpgradePhase('slide-in'), t2)
    setTimeout(() => setUpgradePhase('linger'), t3)
    setTimeout(() => {
      setUpgradePhase('glow')
      setMyrUpgraded(true)
    }, t4)
    setTimeout(() => setUpgradePhase('shrink'), t5)
    setTimeout(() => setUpgradePhase('done'), t6)
  }, [])

  const goTo = useCallback((index: number) => {
    setFading(true)
    setUpgradePhase('hidden')
    setMyrUpgraded(false)
    setTimeout(() => {
      setCurrentStage(index)
      setFading(false)
      if (index === 2) {
        runUpgradeSequence()
      }
    }, FADE_DURATION)
  }, [runUpgradeSequence])

  const startTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      goTo((stageRef.current + 1) % SHOWCASE_STAGES.length)
    }, CYCLE_INTERVAL)
  }, [goTo])

  useEffect(() => {
    startTimer()
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [startTimer])

  const handleDotClick = (index: number) => {
    if (index === currentStage) return
    goTo(index)
    startTimer()
  }

  const stage = SHOWCASE_STAGES[currentStage]
  const isEnlarged = upgradePhase === 'enlarge' || upgradePhase === 'slide-in' || upgradePhase === 'linger' || upgradePhase === 'glow'
  const showSourceCard = upgradePhase === 'enlarge' || upgradePhase === 'slide-in' || upgradePhase === 'linger' || upgradePhase === 'glow'
  const showBattlefieldStack = upgradePhase === 'done'

  return (
    <div className="flex flex-col items-center gap-4 flex-1 justify-center">
      <p className="text-amber-200/80 text-lg sm:text-xl italic font-medium tracking-wide">
        {stage.tagline}
      </p>

      <div className={fading ? 'carousel-fade-out' : 'carousel-fade-in'}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-end justify-center gap-3">
            {stage.hand.map((card) => {
              const isTarget = stage.upgrade?.targetCardId === card.id
              const targetClass = isTarget ? [
                'upgrade-target',
                isEnlarged && 'phase-enlarge',
                upgradePhase === 'glow' && 'phase-glow',
                upgradePhase === 'shrink' && 'phase-shrink',
              ].filter(Boolean).join(' ') : ''

              return (
                <div
                  key={card.id}
                  ref={isTarget ? targetCardRef : undefined}
                  className={targetClass}
                >
                  <Card
                    card={card}
                    dimensions={sizes.hand}
                    upgraded={isTarget && myrUpgraded}
                  />
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-center gap-2">
            {stage.battlefield.lands.map((land, i) => (
              <BasicLandCard key={`${land}-${i}`} name={land} dimensions={sizes.field} />
            ))}
            {stage.battlefield.treasures > 0 && (
              <TreasureCard count={stage.battlefield.treasures} dimensions={sizes.field} />
            )}
            {stage.upgrade && (
              <div
                className="transition-opacity duration-500"
                style={{ opacity: showBattlefieldStack ? 1 : 0 }}
              >
                <UpgradeStack upgrade={stage.upgrade.stackedCard} dimensions={sizes.field} />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {SHOWCASE_STAGES.map((_, i) => (
          <button
            key={i}
            onClick={() => handleDotClick(i)}
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i === currentStage ? 'bg-amber-400' : 'bg-gray-600 hover:bg-gray-500'
            }`}
            aria-label={`Stage ${i + 1}`}
          />
        ))}
      </div>

      {stage.upgrade && showSourceCard && (
        <UpgradeSourceCard
          card={stage.upgrade.upgradeCard}
          dimensions={sizes.hand}
          phase={upgradePhase}
          targetPosition={targetPosition}
        />
      )}
    </div>
  )
}
