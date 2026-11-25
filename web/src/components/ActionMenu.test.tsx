// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { ZoneOwner } from '../dnd/types'
import type { Card, Zones } from '../types'
import { ActionMenu } from './ActionMenu'

afterEach(cleanup)

const card = { id: 'card-1', name: 'Mantis Rider', tokens: [], flip_image_url: null } as unknown as Card

function zones(faceDown: string[] = []) {
  return {
    battlefield: faceDown.length ? [card] : [],
    library: [],
    tapped_card_ids: [],
    face_down_card_ids: faceDown,
    counters: {},
    attachments: {},
  } as unknown as Zones
}

function renderMenu(props: Record<string, unknown>) {
  render(<ActionMenu {...(props as unknown as ComponentProps<typeof ActionMenu>)} />)
}

describe('ActionMenu', () => {
  it.each(['player', 'opponent'] as const)("offers to turn the %s's face-down card face up", (owner: ZoneOwner) => {
    renderMenu({
      selectedCard: { card, zone: 'battlefield', owner },
      battle: {
        your_zones: zones(owner === 'player' ? ['card-1'] : []),
        opponent_zones: zones(owner === 'opponent' ? ['card-1'] : []),
        current_turn_name: 'Alice',
        can_manipulate_opponent: true,
      },
      playerName: 'Alice',
    })

    expect(screen.getByRole('button', { name: 'Turn Face Up' })).toBeTruthy()
  })

  it.each([
    ['Puppet', true, false],
    ['Bob', false, true],
  ])("sets Pass Turn disabled=%s when turn is %s (can_manipulate_opponent=%s)", (turn, againstPuppet, expectedDisabled) => {
    renderMenu({
      selectedCard: null,
      battle: { your_zones: zones(), opponent_zones: zones(), current_turn_name: turn, can_manipulate_opponent: againstPuppet },
      playerName: 'Alice',
      sideboardCount: 0,
      opponentSideboardCount: 0,
    })

    expect((screen.getByRole('button', { name: 'Pass Turn' }) as HTMLButtonElement).disabled).toBe(expectedDisabled)
  })
})
