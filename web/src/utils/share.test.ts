import { describe, expect, it } from 'vitest'

import type { Card, ShareGameResponse, SharePlayerSnapshot } from '../types'
import {
  buildGameSummaryData,
  buildSharePlayerViews,
  getShareHiddenZones,
  getSharePlayerRowBadge,
  getShareRoundBand,
  getShareRoundLabel,
  getShareRoundValue,
} from './share'

function makeCard(id: string): Card {
  return {
    id,
    name: `Card ${id}`,
    image_url: '',
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    type_line: 'Creature',
    tokens: [],
    elo: null,
    upgrade_target: null,
    oracle_text: null,
    colors: [],
    cmc: 1,
  }
}

function makeSnapshot(
  stage: number,
  round: number,
  poison: number,
  treasures: number,
): SharePlayerSnapshot {
  return {
    stage,
    round,
    hand: [makeCard(`hand-${stage}-${round}`)],
    sideboard: [makeCard(`side-${stage}-${round}`)],
    command_zone: [],
    applied_upgrades: [],
    upgrades: [],
    basic_lands: ['Plains', 'Island', 'Mountain'],
    treasures,
    poison,
    vanguard: null,
    visibility: 'full',
    sudden_death_build: null,
  }
}

function makeShareData(): ShareGameResponse {
  return {
    game_id: 'game-1',
    owner_name: 'Alice',
    created_at: '2026-03-11T00:00:00',
    use_upgrades: true,
    in_progress: false,
    players: [
      {
        name: 'Alice',
        final_placement: 1,
        final_poison: 6,
        final_treasures: null,
        is_puppet: false,
        snapshots: [
          makeSnapshot(4, 2, 4, 2),
          makeSnapshot(4, 3, 6, 3),
        ],
      },
      {
        name: 'Bob',
        final_placement: 2,
        final_poison: 10,
        final_treasures: null,
        is_puppet: false,
        snapshots: [
          makeSnapshot(4, 1, 7, 1),
          makeSnapshot(4, 2, 10, 0),
        ],
      },
    ],
  }
}

describe('share row helpers', () => {
  it('uses the selected round snapshot when a player was still alive', () => {
    const players = buildSharePlayerViews(makeShareData(), '4_2')
    const alice = players.find((player) => player.name === 'Alice')

    expect(alice).toMatchObject({
      stage: 4,
      round: 2,
      poison: 4,
      treasures: 2,
      hand_count: 1,
      sideboard_count: 1,
    })
  })

  it('falls back to the last prior snapshot when a player is already dead', () => {
    const players = buildSharePlayerViews(makeShareData(), '4_3')
    const bob = players.find((player) => player.name === 'Bob')

    expect(bob).toMatchObject({
      stage: 4,
      round: 2,
      poison: 10,
      treasures: 0,
      hand_count: 1,
      sideboard_count: 1,
    })
  })

  it('computes viewing, alive, and dead badges from the selected round', () => {
    const data = makeShareData()
    const [alice, bob] = data.players

    expect(getSharePlayerRowBadge(alice, 'Alice', '4_3')).toBe('viewing')
    expect(getSharePlayerRowBadge(alice, 'Bob', '4_3')).toBe('alive')
    expect(getSharePlayerRowBadge(bob, 'Alice', '4_3')).toBe('dead')
    expect(getSharePlayerRowBadge(alice, 'Bob', '4_2')).toBe('alive')
    expect(getSharePlayerRowBadge(bob, 'Alice', '4_2')).toBe('alive')
  })
})

function makeFinishedShareData(): ShareGameResponse {
  const data = makeShareData()
  const [alice, bob] = data.players
  alice.final_poison = 7
  alice.final_treasures = 3
  bob.snapshots = [makeSnapshot(4, 1, 7, 1), makeSnapshot(4, 2, 9, 6)]
  bob.final_poison = 12
  bob.final_treasures = 5
  return data
}

describe('share rows after the final battle', () => {
  it('shows each round\'s own numbers, and how a player\'s game ended only in the rounds after it', () => {
    const data = makeFinishedShareData()

    const atBobsLastRound = buildSharePlayerViews(data, '4_2')
    expect(atBobsLastRound.find((p) => p.name === 'Bob')).toMatchObject({ poison: 9, treasures: 6 })
    expect(atBobsLastRound.find((p) => p.name === 'Alice')).toMatchObject({ poison: 4, treasures: 2 })

    const atTheFinalRound = buildSharePlayerViews(data, '4_3')
    expect(atTheFinalRound.find((p) => p.name === 'Bob')).toMatchObject({ poison: 12, treasures: 5 })
    expect(atTheFinalRound.find((p) => p.name === 'Alice')).toMatchObject({ poison: 6, treasures: 3 })
  })

  it('ranks a past round as it stood, and the latest by where each player finished', () => {
    const data = makeFinishedShareData()
    const places = (round: string) => buildSharePlayerViews(data, round).map((p) => [p.name, p.placement])

    expect(places('4_2')).toEqual([['Alice', 0], ['Bob', 0]])
    expect(places('4_3')).toEqual([['Alice', 1], ['Bob', 2]])

    data.owner_name = 'Bob'
    expect(places('4_2')).toEqual([['Alice', 0], ['Bob', 2]])

    data.in_progress = true
    data.owner_name = 'Alice'
    data.players[1].final_treasures = null
    expect(places('4_3').find(([name]) => name === 'Bob')).toEqual(['Bob', 0])
  })

  it('marks a player dead in the round they were knocked out, and the winner alive', () => {
    const [alice, bob] = makeFinishedShareData().players

    expect(getSharePlayerRowBadge(bob, 'Alice', '4_1')).toBe('alive')
    expect(getSharePlayerRowBadge(bob, 'Alice', '4_2')).toBe('dead')
    expect(getSharePlayerRowBadge(alice, 'Bob', '4_3')).toBe('alive')
  })

  it('shows the final poison on the summary board but keeps the treasures the build was played with', () => {
    const summary = buildGameSummaryData(makeFinishedShareData(), 'Bob')

    expect(summary?.selfPlayer).toMatchObject({ poison: 12, treasures: 6 })
    expect(summary?.selfPlayer.last_battle_result?.pre_battle_treasures).toBe(6)
    expect(summary?.players.find((p) => p.name === 'Bob')).toMatchObject({ poison: 12, treasures: 5 })
  })
})

describe('share rounds hidden while the game goes on', () => {
  it('hides every zone of another player and bands the round by whether they are still in', () => {
    const data = makeShareData()
    const hidden = { ...makeSnapshot(4, 2, 4, 2), visibility: 'hidden' as const }
    const stillIn = { ...data.players[0], final_placement: null }

    expect(getShareHiddenZones(hidden)).toEqual(['hand', 'sideboard', 'upgrades'])
    expect(getShareRoundBand(stillIn, hidden)).toBe('Still Fighting')
    expect(getShareRoundBand(data.players[1], hidden)).toBe('Game in Progress')
  })

  it('hides only the hand and upgrades of the sharer\'s last build, without a band', () => {
    const data = makeShareData()
    const lastBuild = { ...makeSnapshot(4, 3, 6, 3), visibility: 'hand_hidden' as const }

    expect(getShareHiddenZones(lastBuild)).toEqual(['hand', 'upgrades'])
    expect(getShareRoundBand(data.players[0], lastBuild)).toBeNull()
  })

  it('hides nothing in a round shown in full', () => {
    const data = makeShareData()
    const snapshot = data.players[0].snapshots[0]

    expect(getShareHiddenZones(snapshot)).toEqual([])
    expect(getShareRoundBand(data.players[0], snapshot)).toBeNull()
  })
})

function makeSuddenDeathSnapshot(
  stage: number,
  round: number,
  suddenDeathBuild: number,
  treasures: number,
): SharePlayerSnapshot {
  return { ...makeSnapshot(stage, round, 9, treasures), sudden_death_build: suddenDeathBuild }
}

// In 4-2 Bob and Carol reach lethal while Alice survives. Their first Sudden Death is a draw, Bob wins the second,
// and Alice beats Bob in 4-3.
function makeSuddenDeathShareData(): ShareGameResponse {
  const fightersRounds = [makeSnapshot(4, 2, 8, 2), makeSuddenDeathSnapshot(4, 2, 1, 3), makeSuddenDeathSnapshot(4, 2, 2, 4)]
  return {
    ...makeShareData(),
    owner_name: 'Carol',
    players: [
      {
        name: 'Alice',
        final_placement: 1,
        final_poison: 4,
        final_treasures: 3,
        is_puppet: false,
        snapshots: [makeSnapshot(4, 2, 4, 2), makeSnapshot(4, 3, 4, 3)],
      },
      {
        name: 'Bob',
        final_placement: 2,
        final_poison: 10,
        final_treasures: 5,
        is_puppet: false,
        snapshots: [...fightersRounds, makeSnapshot(4, 3, 9, 5)],
      },
      {
        name: 'Carol',
        final_placement: 3,
        final_poison: 10,
        final_treasures: 4,
        is_puppet: false,
        snapshots: fightersRounds,
      },
    ],
  }
}

describe('share rounds with a Sudden Death', () => {
  it('lists each Sudden Death build as its own round after the round it shares', () => {
    const carol = makeSuddenDeathShareData().players[2]

    expect(carol.snapshots.map((snapshot) => getShareRoundLabel(snapshot))).toEqual([
      'Stage 4 - Round 2',
      'Stage 4 - Round 2 · Sudden Death',
      'Stage 4 - Round 2 · Sudden Death 2',
    ])
    expect(carol.snapshots.map((snapshot) => getShareRoundLabel(snapshot, true))).toEqual([
      'Stage 4 - Round 2',
      '4-2 · Sudden Death',
      '4-2 · Sudden Death 2',
    ])
    expect(new Set(carol.snapshots.map(getShareRoundValue)).size).toBe(3)
  })

  it('shows each fighter\'s Sudden Death build and the survivor\'s build from that round', () => {
    const data = makeSuddenDeathShareData()
    const firstSuddenDeath = getShareRoundValue(data.players[2].snapshots[1])

    const players = buildSharePlayerViews(data, firstSuddenDeath)

    expect(players.find((p) => p.name === 'Bob')).toMatchObject({ poison: 9, treasures: 3 })
    expect(players.find((p) => p.name === 'Alice')).toMatchObject({ stage: 4, round: 2, poison: 4, treasures: 2 })
  })

  it('keeps the survivor alive while the fighters play it out, and marks the loser dead in the last one', () => {
    const data = makeSuddenDeathShareData()
    const [alice, bob, carol] = data.players
    const [, firstSuddenDeath, secondSuddenDeath] = carol.snapshots.map(getShareRoundValue)

    expect(getSharePlayerRowBadge(alice, 'Carol', firstSuddenDeath)).toBe('alive')
    expect(getSharePlayerRowBadge(carol, 'Bob', firstSuddenDeath)).toBe('alive')
    expect(getSharePlayerRowBadge(carol, 'Bob', secondSuddenDeath)).toBe('dead')
    expect(getSharePlayerRowBadge(bob, 'Carol', secondSuddenDeath)).toBe('alive')
  })

  it('bands a Sudden Death build, unless the round is hidden while the game goes on', () => {
    const carol = makeSuddenDeathShareData().players[2]
    const build = carol.snapshots[2]

    expect(getShareRoundBand(carol, build)).toBe('Sudden Death')
    expect(getShareRoundBand(carol, { ...build, visibility: 'hand_hidden' })).toBe('Sudden Death')
    expect(getShareRoundBand(carol, { ...build, visibility: 'hidden' })).toBe('Game in Progress')
    expect(getShareRoundBand(carol, carol.snapshots[0])).toBeNull()
  })
})
