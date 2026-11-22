// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlayerView } from '../types'
import { PlayerRow } from './PlayerList'

function player(overrides: Partial<PlayerView>): PlayerView {
  return {
    name: 'Bob',
    treasures: 2,
    poison: 3,
    phase: 'build',
    round: 2,
    stage: 4,
    vanquishers: 0,
    is_ghost: false,
    is_puppet: false,
    time_of_death: null,
    hand_count: 0,
    sideboard_count: 0,
    hand_size: 4,
    is_stage_increasing: false,
    upgrades: [],
    vanguard: null,
    chosen_basics: [],
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: 0.4,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: [],
    placement: 0,
    in_sudden_death: false,
    build_ready: false,
    ...overrides,
  }
}

function renderCard(shown: PlayerView, { micToggle }: { micToggle?: React.ReactNode } = {}) {
  const onClick = vi.fn()
  const players = [player({ name: 'Alice' }), shown]
  render(
    <PlayerRow
      player={shown}
      players={players}
      currentPlayerName="Alice"
      isSelected={false}
      onClick={onClick}
      micToggle={micToggle}
    />,
  )
  return { onClick }
}

describe('PlayerRow', () => {
  afterEach(cleanup)

  it('keeps the mic outside the card, so neither click does the other', () => {
    const onMute = vi.fn()
    const { onClick } = renderCard(player({}), { micToggle: <button type="button" onClick={onMute}>Mute</button> })

    expect(document.querySelector('button button')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }))
    expect(onMute).toHaveBeenCalledOnce()
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Bob/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
