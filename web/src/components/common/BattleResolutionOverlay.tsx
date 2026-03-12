import { useEffect, useMemo, useState } from 'react'
import { Card } from '../card'
import { PoisonCard } from './PoisonCard'
import type { BattleResolution, BattleView, Card as CardType } from '../../types'

type OverlayOwner = 'player' | 'opponent'

interface BattleResolutionOverlayProps {
  battle: BattleView
  resolution: BattleResolution
  onComplete: () => void
}

interface CardLookupEntry {
  card: CardType
  owner: OverlayOwner
}

interface Point {
  x: number
  y: number
}

interface StageRect {
  left: number
  top: number
  width: number
  height: number
}

interface ActiveSourceState {
  card: CardType
  owner: OverlayOwner
  stageRect: StageRect
  enterX: number
  enterY: number
  enterScale: number
  firing: boolean
}

const SOURCE_MOVE_MS = 720
const BEAM_CHARGE_MS = 360
const BEAM_IMPACT_MS = 620
const BASE_CHARGE_MS = 480
const BASE_IMPACT_MS = 860

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function buildCardLookup(battle: BattleView): Map<string, CardLookupEntry> {
  const lookup = new Map<string, CardLookupEntry>()
  const addCards = (cards: CardType[], owner: OverlayOwner) => {
    cards.forEach((card) => lookup.set(card.id, { card, owner }))
  }

  const addZones = (owner: OverlayOwner, zones: BattleView['your_zones']) => {
    addCards(zones.hand, owner)
    addCards(zones.battlefield, owner)
    addCards(zones.graveyard, owner)
    addCards(zones.exile, owner)
    addCards(zones.sideboard, owner)
    addCards(zones.command_zone, owner)
    addCards(zones.submitted_cards, owner)
    addCards(zones.upgrades, owner)
  }

  addZones('player', battle.your_zones)
  addZones('opponent', battle.opponent_zones)
  return lookup
}

function selectorForCard(cardId: string): string {
  const escaped = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(cardId)
    : cardId.replace(/["\\]/g, '\\$&')
  return `[data-card-id="${escaped}"]`
}

function rectForSelector(selector: string): DOMRect | null {
  return document.querySelector(selector)?.getBoundingClientRect() ?? null
}

function centerOfRect(rect: StageRect | DOMRect): Point {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function buildStageRect(owner: OverlayOwner, sourceRect: DOMRect | null): StageRect {
  const sourceWidth = sourceRect?.width ?? 118
  const sourceHeight = sourceRect?.height ?? Math.round((sourceWidth * 7) / 5)
  const width = clamp(Math.round(sourceWidth * 2.15), 220, 310)
  const height = clamp(Math.round(sourceHeight * 2.15), 308, 434)
  const left = Math.round((window.innerWidth - width) / 2)
  const preferredTop = owner === 'player'
    ? window.innerHeight * 0.56 - height / 2
    : window.innerHeight * 0.24 - height / 2
  const top = Math.round(clamp(preferredTop, 48, window.innerHeight - height - 48))

  return {
    left,
    top,
    width,
    height,
  }
}

function buildEntryTransform(
  owner: OverlayOwner,
  stageRect: StageRect,
  sourceRect: DOMRect | null,
): { enterX: number; enterY: number; enterScale: number } {
  if (!sourceRect) {
    return {
      enterX: owner === 'player' ? -70 : 70,
      enterY: owner === 'player' ? 90 : -90,
      enterScale: 0.78,
    }
  }

  return {
    enterX: sourceRect.left - stageRect.left,
    enterY: sourceRect.top - stageRect.top,
    enterScale: clamp(sourceRect.width / stageRect.width, 0.32, 0.72),
  }
}

function interleave<T>(first: T[], second: T[]): T[] {
  const output: T[] = []
  const maxLength = Math.max(first.length, second.length)
  for (let index = 0; index < maxLength; index += 1) {
    if (index < first.length) output.push(first[index])
    if (index < second.length) output.push(second[index])
  }
  return output
}

export function BattleResolutionOverlay({
  battle,
  resolution,
  onComplete,
}: BattleResolutionOverlayProps) {
  const [counts, setCounts] = useState({
    player: resolution.your_side.starting_poison,
    opponent: resolution.opponent_side.starting_poison,
  })
  const [activePulseOwners, setActivePulseOwners] = useState<OverlayOwner[]>([])
  const [deadOwners, setDeadOwners] = useState<OverlayOwner[]>([])
  const [activeSource, setActiveSource] = useState<ActiveSourceState | null>(null)
  const [activeBeam, setActiveBeam] = useState<{
    from: Point
    to: Point
  } | null>(null)
  const [showContinuation, setShowContinuation] = useState(false)

  const cardLookup = useMemo(() => buildCardLookup(battle), [battle])
  const resolutionSides = useMemo(
    () => ({
      player: resolution.your_side,
      opponent: resolution.opponent_side,
    }),
    [resolution],
  )

  useEffect(() => {
    let cancelled = false

    const markIncrement = (owner: OverlayOwner, nextValue: number) => {
      setCounts((current) => ({
        ...current,
        [owner]: nextValue,
      }))
      if (resolutionSides[owner].show_death_animation && nextValue >= 10) {
        setDeadOwners((current) => (current.includes(owner) ? current : [...current, owner]))
      }
    }

    const run = async () => {
      await wait(260)
      if (cancelled) return

      const baseOwners = (['player', 'opponent'] as const).filter(
        (owner) => resolutionSides[owner].events[0]?.event_type === 'base_increment',
      )

      if (baseOwners.length > 0) {
        setActivePulseOwners([...baseOwners])
        await wait(BASE_CHARGE_MS)
        if (cancelled) return
        baseOwners.forEach((owner) => {
          markIncrement(owner, resolutionSides[owner].starting_poison + 1)
        })
        await wait(BASE_IMPACT_MS)
        if (cancelled) return
        setActivePulseOwners([])
      }

      const playerBeams = resolutionSides.player.events
        .filter((event) => event.event_type === 'upgrade_beam')
        .map((event) => ({ owner: 'player' as const, event }))
      const opponentBeams = resolutionSides.opponent.events
        .filter((event) => event.event_type === 'upgrade_beam')
        .map((event) => ({ owner: 'opponent' as const, event }))

      const sequence = interleave<
        { owner: 'player'; event: typeof playerBeams[number]['event'] } |
        { owner: 'opponent'; event: typeof opponentBeams[number]['event'] }
      >(playerBeams, opponentBeams)

      const currentCounts = {
        player: resolutionSides.player.starting_poison + (baseOwners.includes('player') ? 1 : 0),
        opponent: resolutionSides.opponent.starting_poison + (baseOwners.includes('opponent') ? 1 : 0),
      }

      for (const entry of sequence) {
        const sourceCardId = entry.event.source_card_id
        if (!sourceCardId) continue

        const lookup = cardLookup.get(sourceCardId) ?? null
        if (!lookup) continue

        const sourceRect = rectForSelector(selectorForCard(sourceCardId))
        const targetRect = rectForSelector(`[data-poison-owner="${entry.owner}"]`)
        const stageRect = buildStageRect(lookup.owner, sourceRect)
        const { enterX, enterY, enterScale } = buildEntryTransform(lookup.owner, stageRect, sourceRect)

        setActiveSource({
          card: lookup.card,
          owner: lookup.owner,
          stageRect,
          enterX,
          enterY,
          enterScale,
          firing: false,
        })

        await wait(SOURCE_MOVE_MS)
        if (cancelled) return

        setActiveSource((current) => (current ? { ...current, firing: true } : current))
        await wait(BEAM_CHARGE_MS)
        if (cancelled) return

        const beamStart = centerOfRect(stageRect)
        const beamEnd = targetRect
          ? centerOfRect(targetRect)
          : {
              x: entry.owner === 'player' ? window.innerWidth * 0.76 : window.innerWidth * 0.24,
              y: entry.owner === 'player' ? window.innerHeight * 0.72 : window.innerHeight * 0.28,
            }

        setActiveBeam({ from: beamStart, to: beamEnd })
        setActivePulseOwners([entry.owner])

        await wait(BEAM_IMPACT_MS)
        if (cancelled) return

        currentCounts[entry.owner] += 1
        markIncrement(entry.owner, currentCounts[entry.owner])

        await wait(720)
        if (cancelled) return

        setActiveBeam(null)
        setActiveSource(null)
        setActivePulseOwners([])
        await wait(180)
        if (cancelled) return
      }

      if (resolution.continue_sudden_death) {
        setShowContinuation(true)
        await wait(1600)
        if (cancelled) return
      } else if (resolutionSides.player.show_death_animation || resolutionSides.opponent.show_death_animation) {
        await wait(1250)
        if (cancelled) return
      } else {
        await wait(460)
        if (cancelled) return
      }

      onComplete()
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [battle, cardLookup, onComplete, resolution, resolutionSides])

  const poisonRects = {
    player: rectForSelector('[data-poison-owner="player"]'),
    opponent: rectForSelector('[data-poison-owner="opponent"]'),
  }

  return (
    <div className="fixed inset-0 z-[80] pointer-events-auto">
      <div className="absolute inset-0 bg-black/28 backdrop-blur-[1.5px]" />

      <svg className="pointer-events-none fixed inset-0 z-[82] h-full w-full overflow-visible">
        {activeBeam && (
          <g>
            <line
              x1={activeBeam.from.x}
              y1={activeBeam.from.y}
              x2={activeBeam.to.x}
              y2={activeBeam.to.y}
              className="battle-resolution-beam-core"
            />
            <line
              x1={activeBeam.from.x}
              y1={activeBeam.from.y}
              x2={activeBeam.to.x}
              y2={activeBeam.to.y}
              className="battle-resolution-beam-glow"
            />
          </g>
        )}
      </svg>

      {(['player', 'opponent'] as const).map((owner) => {
        const rect = poisonRects[owner]
        if (!rect) return null

        const isActive = activePulseOwners.includes(owner)
        const isDead = deadOwners.includes(owner)

        return (
          <div
            key={owner}
            className={[
              'fixed z-[83] battle-resolution-counter',
              isActive && 'battle-resolution-counter-active',
              isDead && 'battle-resolution-counter-dead',
            ].filter(Boolean).join(' ')}
            style={{ left: rect.left, top: rect.top }}
          >
            <PoisonCard
              count={counts[owner]}
              dimensions={{ width: rect.width, height: rect.height }}
              owner={owner}
              badgeTextClassName={isDead ? 'text-red-300' : 'text-purple-300'}
            />
          </div>
        )
      })}

      {activeSource && (
        <div
          className={[
            'fixed z-[84] battle-resolution-source-card',
            activeSource.firing && 'battle-resolution-source-card-firing',
          ].filter(Boolean).join(' ')}
          style={{
            left: activeSource.stageRect.left,
            top: activeSource.stageRect.top,
            width: activeSource.stageRect.width,
            height: activeSource.stageRect.height,
            ['--battle-enter-x' as string]: `${activeSource.enterX}px`,
            ['--battle-enter-y' as string]: `${activeSource.enterY}px`,
            ['--battle-enter-scale' as string]: String(activeSource.enterScale),
          }}
        >
          <Card
            card={activeSource.card}
            dimensions={{
              width: Math.round(activeSource.stageRect.width),
              height: Math.round(activeSource.stageRect.height),
            }}
            upgraded
            trackDomId={false}
          />
        </div>
      )}

      {showContinuation && (
        <div className="fixed inset-0 z-[85] pointer-events-none flex items-center justify-center">
          <div className="battle-resolution-continue-panel">
            Sudden Death Continues
          </div>
        </div>
      )}
    </div>
  )
}
