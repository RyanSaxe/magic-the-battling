import { describe, expect, it } from 'vitest'
import type { ResumableSeat } from '../hooks/useResumableGames'
import { cubeTitle, formatWhen, modeLabel, resumeDetail, resumeHeadline, seatsLabel, winsLabel } from './accountFormat'

const now = Date.parse('2026-11-21T12:00:00Z')

describe('cubeTitle', () => {
  it('keeps the name the player gave a saved cube over the CubeCobra name', () => {
    expect(cubeTitle({ display_name: 'Friday Vintage', cube_name: 'Vintage Cube', cube_id: 'vintage' })).toBe('Friday Vintage')
  })

  it('falls back to the CubeCobra name, then the id', () => {
    expect(cubeTitle({ display_name: null, cube_name: 'Vintage Cube', cube_id: 'vintage' })).toBe('Vintage Cube')
    expect(cubeTitle({ display_name: null, cube_name: null, cube_id: 'vintage' })).toBe('vintage')
  })
})

describe('formatWhen', () => {
  it('says how long ago within a day, then gives the date', () => {
    expect(formatWhen('2026-11-21T10:00:00Z', now)).toBe('2 h ago')
    expect(formatWhen('2026-11-19T12:00:00Z', now)).toBe('Nov 19')
    expect(formatWhen('2025-11-19T12:00:00Z', now)).toBe('Nov 19, 2025')
  })
})

describe('seatsLabel', () => {
  it('counts humans and puppets, leaving out puppets when there are none', () => {
    expect(seatsLabel(1, 3)).toBe('1 human, 3 puppets')
    expect(seatsLabel(4, 0)).toBe('4 humans')
    expect(seatsLabel(2, 1)).toBe('2 humans, 1 puppet')
  })
})

describe('modeLabel', () => {
  it('names the mode as players see it', () => {
    expect(modeLabel('constructed')).toBe('Deck')
    expect(modeLabel('limited')).toBe('Cube')
  })

  it('treats a game saved without a mode as a Cube game', () => {
    expect(modeLabel(undefined)).toBe('Cube')
  })
})

describe('winsLabel', () => {
  it('rounds the win rate and handles no games', () => {
    expect(winsLabel(9, 24)).toBe('9 wins (38%)')
    expect(winsLabel(1, 1)).toBe('1 win (100%)')
    expect(winsLabel(0, 0)).toBe('0 wins (0%)')
  })
})

describe('the resume banner', () => {
  const running: ResumableSeat = {
    gameId: 'g1',
    playerName: 'kestrel',
    kind: 'game',
    lastActiveAt: '2026-11-21T11:00:00Z',
    joinCode: 'ABCD',
    cubeId: 'vintage',
    cubeName: 'Vintage Cube',
    cubeImageUri: null,
    playMode: 'limited',
    useUpgrades: true,
    playerCount: 4,
    canClose: false,
    stage: 2,
    round: 4,
    poison: 2,
  }
  const lobby: ResumableSeat = { ...running, kind: 'lobby', stage: null, round: null, poison: null, playerCount: 2 }

  it('shows a game in progress with its stage, round and the seat poison', () => {
    expect(resumeHeadline(running)).toBe('In progress · Stage 2, Round 4')
    expect(resumeDetail(running)).toBe('Cube · Upgrades On · 4 players · 2 poison')
  })

  it('shows a waiting lobby with its code and no poison', () => {
    expect(resumeHeadline(lobby)).toBe('Lobby waiting · Code ABCD')
    expect(resumeDetail(lobby)).toBe('Cube · Upgrades On · 2 players')
  })
})
