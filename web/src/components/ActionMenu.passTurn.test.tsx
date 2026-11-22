// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, it } from 'vitest'
import { ActionMenu } from './ActionMenu'

afterEach(cleanup)

const zones = { battlefield: [], library: [], tapped_card_ids: [], face_down_card_ids: [], counters: {}, attachments: {} }

function passTurnDisabled(turn: string, againstPuppet: boolean) {
  const props = {
    selectedCard: null,
    battle: { your_zones: zones, opponent_zones: zones, current_turn_name: turn, can_manipulate_opponent: againstPuppet },
    playerName: 'Alice',
    sideboardCount: 0,
    opponentSideboardCount: 0,
  } as unknown as ComponentProps<typeof ActionMenu>
  render(<ActionMenu {...props} />)
  return (screen.getByRole('button', { name: 'Pass Turn' }) as HTMLButtonElement).disabled
}

it("passes a puppet's turn", () => {
  expect(passTurnDisabled('Puppet', true)).toBe(false)
})

it("can't pass another player's turn", () => {
  expect(passTurnDisabled('Bob', false)).toBe(true)
})
