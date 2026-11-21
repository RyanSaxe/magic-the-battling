import { describe, expect, it } from 'vitest'

import type { Card, ShareGameResponse, SharePlayerSnapshot } from '../types'
import {
  buildGameSummaryData,
  buildSharePlayerViews,
  getSharePlayerRowBadge,
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
  }
}

function makeShareData(): ShareGameResponse {
  return {
    game_id: 'game-1',
    owner_name: 'Alice',
    created_at: '2026-03-11T00:00:00',
    use_upgrades: true,
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
  it('shows each player\'s final state from their last round on', () => {
    const data = makeFinishedShareData()

    const atBobsLastRound = buildSharePlayerViews(data, '4_2')
    expect(atBobsLastRound.find((p) => p.name === 'Bob')).toMatchObject({ poison: 12, treasures: 5 })
    expect(atBobsLastRound.find((p) => p.name === 'Alice')).toMatchObject({ poison: 4, treasures: 2 })

    const atTheFinalRound = buildSharePlayerViews(data, '4_3')
    expect(atTheFinalRound.find((p) => p.name === 'Bob')).toMatchObject({ poison: 12, treasures: 5 })
    expect(atTheFinalRound.find((p) => p.name === 'Alice')).toMatchObject({ poison: 7, treasures: 3 })
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
