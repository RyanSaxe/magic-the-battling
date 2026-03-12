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
}

interface BeamGroup {
  sourceCardId: string
  targetOwner: OverlayOwner
  beamCount: number
}

const BASE_SETTLE_MS = 620
const COUNTER_TICK_MS = 260
const DEATH_PHASE_MS = 1450
const SOURCE_MOVE_MS = 540
const BEAM_TRAVEL_MS = 260
const BEAM_SETTLE_MS = 320
const BEAM_PAUSE_MS = 260
const GROUP_EXIT_MS = 220
const NO_UPGRADE_WAIT_MS = 1000
const CONTINUATION_MS = 1500
const POISON_TO_LOSE = 10

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

function uniqueOwners(owners: OverlayOwner[]): OverlayOwner[] {
  return Array.from(new Set(owners))
}

function buildStageRect(owner: OverlayOwner): StageRect {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const margin = clamp(Math.round(viewportWidth * 0.035), 18, 34)
  const width = clamp(
    Math.round(Math.min(viewportWidth * 0.22, viewportHeight * 0.19)),
    120,
    220,
  )
  const height = Math.round((width * 7) / 5)
  const topPadding = clamp(Math.round(viewportHeight * 0.11), 74, 116)
  const bottomPadding = clamp(Math.round(viewportHeight * 0.14), 96, 132)

  return {
    left: margin,
    top: owner === 'player'
      ? viewportHeight - bottomPadding - height
      : topPadding,
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
      enterX: owner === 'player' ? 36 : 28,
      enterY: owner === 'player' ? 54 : -54,
      enterScale: 0.84,
    }
  }

  return {
    enterX: sourceRect.left - stageRect.left,
    enterY: sourceRect.top - stageRect.top,
    enterScale: clamp(sourceRect.width / stageRect.width, 0.28, 0.86),
  }
}

function groupUpgradeEvents(
  events: BattleResolution['your_side']['events'],
  targetOwner: OverlayOwner,
): BeamGroup[] {
  const groups: BeamGroup[] = []

  events
    .filter((event) => event.event_type === 'upgrade_beam' && event.source_card_id)
    .forEach((event) => {
      const sourceCardId = event.source_card_id
      if (!sourceCardId) return

      const previous = groups.at(-1)
      if (previous && previous.sourceCardId === sourceCardId && previous.targetOwner === targetOwner) {
        previous.beamCount += 1
        return
      }

      groups.push({
        sourceCardId,
        targetOwner,
        beamCount: 1,
      })
    })

  return groups
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

function SkullIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className="h-[60%] w-[60%]">
      <path
        d="M32 6c-12.7 0-23 10.3-23 23 0 9 5.2 16.8 12.8 20.6v8.4c0 1.7 1.3 3 3 3h4.2v-6.2h6v6.2h4.2c1.7 0 3-1.3 3-3v-8.4C49.8 45.8 55 38 55 29 55 16.3 44.7 6 32 6Zm-8.6 24.3a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4Zm17.2 0a4.2 4.2 0 1 1 0-8.4 4.2 4.2 0 0 1 0 8.4Zm-13.9 8.6h10.6a2 2 0 0 1 2 2v3.5a2 2 0 0 1-2 2h-2.6V42h-5.4v4.4h-2.6a2 2 0 0 1-2-2v-3.5a2 2 0 0 1 2-2Z"
        fill="currentColor"
      />
    </svg>
  )
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
  const [focusedOwners, setFocusedOwners] = useState<OverlayOwner[]>([])
  const [incrementOwners, setIncrementOwners] = useState<OverlayOwner[]>([])
  const [lethalOwners, setLethalOwners] = useState<OverlayOwner[]>([])
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

    const applyIncrement = (owner: OverlayOwner, nextValue: number) => {
      setCounts((current) => ({
        ...current,
        [owner]: nextValue,
      }))
      if (nextValue >= POISON_TO_LOSE) {
        setLethalOwners((current) => uniqueOwners([...current, owner]))
      }
    }

    const run = async () => {
      await wait(160)
      if (cancelled) return

      const damagedOwners = (['player', 'opponent'] as const).filter(
        (owner) => resolutionSides[owner].took_damage,
      )

      if (damagedOwners.length === 0) {
        await wait(220)
        if (!cancelled) onComplete()
        return
      }

      setFocusedOwners(damagedOwners)
      await wait(360)
      if (cancelled) return

      const baseOwners = (['player', 'opponent'] as const).filter(
        (owner) => resolutionSides[owner].events[0]?.event_type === 'base_increment',
      )

      if (baseOwners.length > 0) {
        baseOwners.forEach((owner) => {
          applyIncrement(owner, resolutionSides[owner].starting_poison + 1)
        })
        setIncrementOwners(baseOwners)
        await wait(COUNTER_TICK_MS)
        if (cancelled) return
        setIncrementOwners([])
        await wait(BASE_SETTLE_MS)
        if (cancelled) return
      }

      const playerGroups = groupUpgradeEvents(resolutionSides.player.events, 'player')
      const opponentGroups = groupUpgradeEvents(resolutionSides.opponent.events, 'opponent')
      const groups = interleave(playerGroups, opponentGroups)

      const currentCounts = {
        player: resolutionSides.player.starting_poison + (baseOwners.includes('player') ? 1 : 0),
        opponent: resolutionSides.opponent.starting_poison + (baseOwners.includes('opponent') ? 1 : 0),
      }

      for (const group of groups) {
        const lookup = cardLookup.get(group.sourceCardId) ?? null
        if (!lookup) continue

        const sourceRect = rectForSelector(selectorForCard(group.sourceCardId))
        const stageRect = buildStageRect(lookup.owner)
        const { enterX, enterY, enterScale } = buildEntryTransform(lookup.owner, stageRect, sourceRect)

        setActiveSource({
          card: lookup.card,
          owner: lookup.owner,
          stageRect,
          enterX,
          enterY,
          enterScale,
        })

        await wait(SOURCE_MOVE_MS)
        if (cancelled) return

        const targetRect = rectForSelector(`[data-poison-owner="${group.targetOwner}"]`)
        const beamStart = centerOfRect(stageRect)
        const beamEnd = targetRect
          ? centerOfRect(targetRect)
          : {
              x: group.targetOwner === 'player' ? window.innerWidth * 0.72 : window.innerWidth * 0.78,
              y: group.targetOwner === 'player' ? window.innerHeight * 0.68 : window.innerHeight * 0.24,
            }

        for (let beamIndex = 0; beamIndex < group.beamCount; beamIndex += 1) {
          setActiveBeam({ from: beamStart, to: beamEnd })
          await wait(BEAM_TRAVEL_MS)
          if (cancelled) return

          currentCounts[group.targetOwner] += 1
          applyIncrement(group.targetOwner, currentCounts[group.targetOwner])
          setIncrementOwners([group.targetOwner])

          await wait(BEAM_SETTLE_MS)
          if (cancelled) return

          setActiveBeam(null)
          setIncrementOwners([])

          if (beamIndex < group.beamCount - 1) {
            await wait(BEAM_PAUSE_MS)
            if (cancelled) return
          }
        }

        await wait(GROUP_EXIT_MS)
        if (cancelled) return
        setActiveSource(null)
        await wait(120)
        if (cancelled) return
      }

      const deathTargets = (['player', 'opponent'] as const).filter(
        (owner) => resolutionSides[owner].show_death_animation && currentCounts[owner] >= POISON_TO_LOSE,
      )

      if (deathTargets.length > 0) {
        await wait(360)
        if (cancelled) return
        setDeadOwners(deathTargets)
        await wait(DEATH_PHASE_MS)
        if (cancelled) return
      } else if (groups.length === 0) {
        await wait(NO_UPGRADE_WAIT_MS)
        if (cancelled) return
      } else {
        await wait(420)
        if (cancelled) return
      }

      if (resolution.continue_sudden_death) {
        setShowContinuation(true)
        await wait(CONTINUATION_MS)
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

  const counterScale = window.innerWidth < 640 ? '1.55' : '1.82'

  return (
    <div className="fixed inset-0 z-[80] pointer-events-auto">
      <div className="battle-resolution-backdrop absolute inset-0" />

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

        const isFocused = focusedOwners.includes(owner)
        const isIncrementing = incrementOwners.includes(owner)
        const isLethal = lethalOwners.includes(owner)
        const isDead = deadOwners.includes(owner)

        return (
          <div
            key={owner}
            className={[
              'fixed z-[83] battle-resolution-counter',
              isFocused && 'battle-resolution-counter-focused',
              isIncrementing && 'battle-resolution-counter-increment',
              isLethal && 'battle-resolution-counter-lethal',
              isDead && 'battle-resolution-counter-dead',
            ].filter(Boolean).join(' ')}
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              ['--battle-counter-scale' as string]: counterScale,
            }}
          >
            <PoisonCard
              count={counts[owner]}
              dimensions={{ width: rect.width, height: rect.height }}
              owner={owner}
              badgeTextClassName={isLethal ? 'text-red-200' : 'text-purple-200'}
            />
            <div className="battle-resolution-counter-skull">
              <SkullIcon />
            </div>
          </div>
        )
      })}

      {activeSource && (
        <div
          className="fixed z-[84] battle-resolution-source-card"
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
