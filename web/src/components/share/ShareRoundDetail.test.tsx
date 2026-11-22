// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Card, SharePlayerSnapshot } from '../../types'
import { ShareRoundDetail } from './ShareRoundDetail'

// utils/inputMode reads matchMedia when it is imported, and jsdom has neither it nor ResizeObserver.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
})

function makeCard(id: string, upgradeTarget: Card | null = null): Card {
  return { id, name: id, type_line: 'Creature', tokens: [], flip_image_url: null, upgrade_target: upgradeTarget } as unknown as Card
}

it('shows the applied upgrades of a build saved with an empty upgrade list', () => {
  const target = makeCard('Battlegate Mimic')
  const snapshot: SharePlayerSnapshot = {
    stage: 6,
    round: 1,
    hand: [target],
    sideboard: [],
    command_zone: [],
    applied_upgrades: [makeCard('Adriana’s Valor', target)],
    upgrades: [],
    basic_lands: [],
    treasures: 2,
    poison: 3,
    vanguard: null,
    visibility: 'full',
    sudden_death_build: null,
  }
  const player = { name: 'Puppet', final_placement: 1, final_poison: 3, final_treasures: 2, is_puppet: true, snapshots: [snapshot] }

  const { container } = render(<ShareRoundDetail player={player} snapshot={snapshot} useUpgrades />)

  expect(screen.queryByAltText('Adriana’s Valor')).not.toBeNull()
  expect(container.querySelector('.zone-hand .card.upgraded')).not.toBeNull()
})
