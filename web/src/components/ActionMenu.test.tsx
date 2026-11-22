// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import type { Card, Zones } from '../types'
import type { ZoneOwner } from '../dnd/types'
import { ActionMenu } from './ActionMenu'

afterEach(cleanup)

const card = { id: 'card-1', name: 'Mantis Rider', tokens: [], flip_image_url: null } as unknown as Card

function zones(faceDown: string[]) {
  return {
    battlefield: [card],
    library: [],
    tapped_card_ids: [],
    face_down_card_ids: faceDown,
    counters: {},
    attachments: {},
  } as unknown as Zones
}

function openMenu(owner: ZoneOwner, faceDown: string[]) {
  const props = {
    selectedCard: { card, zone: 'battlefield', owner },
    battle: {
      your_zones: zones(owner === 'player' ? faceDown : []),
      opponent_zones: zones(owner === 'opponent' ? faceDown : []),
      current_turn_name: 'Alice',
      can_manipulate_opponent: true,
    },
    playerName: 'Alice',
  } as unknown as ComponentProps<typeof ActionMenu>
  render(<ActionMenu {...props} />)
}

describe('ActionMenu', () => {
  it.each(['player', 'opponent'] as const)("offers to turn the %s's face-down card face up", (owner) => {
    openMenu(owner, ['card-1'])

    expect(screen.getByRole('button', { name: 'Turn Face Up' })).toBeTruthy()
  })
})
