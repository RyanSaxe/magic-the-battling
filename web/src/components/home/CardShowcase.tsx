import { useState, useEffect, useCallback, useRef } from 'react'
import { SHOWCASE_STAGES } from '../../constants/showcaseCards'
import type { CarouselStage } from '../../constants/showcaseCards'
import { Card } from '../card/Card'
import { BasicLandCard } from '../common/BasicLandCard'
import { TreasureCard } from '../common/TreasureCard'

const CYCLE_INTERVAL = 4000
const FADE_DURATION = 400
const UPGRADE_DELAY = 600
const MAX_HAND_SIZE = 5
const CARD_GAP = 12

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

function StageContent({ stage, sizes, showUpgrade }: {
  stage: CarouselStage
  sizes: ReturnType<typeof useShowcaseSizes>
  showUpgrade: boolean
}) {
  const upgradeCard = stage.battlefield.upgradedCard

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-end justify-center gap-3">
        {stage.hand.map((card) => (
          <Card key={card.id} card={card} dimensions={sizes.hand} />
        ))}
      </div>

      <div className="flex items-center justify-center gap-2">
        {stage.battlefield.lands.map((land, i) => (
          <BasicLandCard key={`${land}-${i}`} name={land} dimensions={sizes.field} />
        ))}
        {stage.battlefield.treasures > 0 && (
          <TreasureCard count={stage.battlefield.treasures} dimensions={sizes.field} />
        )}
        {upgradeCard && (
          <div className={`relative ${showUpgrade ? 'upgrade-glow-burst' : ''}`}>
            <Card card={upgradeCard} dimensions={sizes.field} upgraded />
            {upgradeCard.upgrade_target && (
              <div
                className={`absolute -top-1 -left-1 ${showUpgrade ? 'upgrade-fly-in' : 'opacity-0'}`}
                style={{ width: sizes.field.width * 0.7, height: sizes.field.height * 0.7 }}
              >
                <Card card={upgradeCard.upgrade_target} dimensions={{
                  width: Math.round(sizes.field.width * 0.7),
                  height: Math.round(sizes.field.height * 0.7),
                }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function CardShowcase() {
  const [currentStage, setCurrentStage] = useState(0)
  const [fading, setFading] = useState(false)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const stageRef = useRef(currentStage)
  const sizes = useShowcaseSizes()

  useEffect(() => { stageRef.current = currentStage }, [currentStage])

  const goTo = useCallback((index: number) => {
    setFading(true)
    setShowUpgrade(false)
    setTimeout(() => {
      setCurrentStage(index)
      setFading(false)
      if (index === 2) {
        setTimeout(() => setShowUpgrade(true), UPGRADE_DELAY)
      }
    }, FADE_DURATION)
  }, [])

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

  return (
    <div className="flex flex-col items-center gap-4 flex-1 justify-center">
      <p className="text-amber-200/80 text-lg sm:text-xl italic font-medium tracking-wide">
        {stage.tagline}
      </p>

      <div className={fading ? 'carousel-fade-out' : 'carousel-fade-in'}>
        <StageContent stage={stage} sizes={sizes} showUpgrade={showUpgrade} />
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
    </div>
  )
}
