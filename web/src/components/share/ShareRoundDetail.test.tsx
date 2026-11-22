// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Card, SharePlayerSnapshot } from '../../types'
import { CardPreviewContext } from '../card/CardPreviewContext'
import { PageFrame } from '../common/PageFrame'
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

afterEach(cleanup)

function makeSnapshot(hand: Card[], appliedUpgrades: Card[]): SharePlayerSnapshot {
  return {
    stage: 6,
    round: 1,
    hand,
    sideboard: [],
    command_zone: [],
    applied_upgrades: appliedUpgrades,
    upgrades: [],
    basic_lands: [],
    treasures: 2,
    poison: 3,
    vanguard: null,
    visibility: 'full',
    sudden_death_build: null,
  }
}

function makePlayer(snapshot: SharePlayerSnapshot) {
  return { name: 'Puppet', final_placement: 1, final_poison: 3, final_treasures: 2, is_puppet: true, snapshots: [snapshot] }
}

it('shows the applied upgrades of a build saved with an empty upgrade list', () => {
  const target = makeCard('Battlegate Mimic')
  const snapshot = makeSnapshot([target], [makeCard('Adriana’s Valor', target)])

  const { container } = render(<ShareRoundDetail player={makePlayer(snapshot)} snapshot={snapshot} useUpgrades />)

  expect(screen.queryByAltText('Adriana’s Valor')).not.toBeNull()
  expect(container.querySelector('.zone-hand .card.upgraded')).not.toBeNull()
})

it('magnifies an upgrade after a tap on either of its cards, or on one not applied yet', () => {
  const target = makeCard('Battlegate Mimic')
  const applied = makeCard('Adriana’s Valor', target)
  const unapplied = makeCard('Brago’s Favor')
  const snapshot = { ...makeSnapshot([], [applied]), upgrades: [applied, unapplied] }
  const setPreviewCard = vi.fn()
  render(
    <CardPreviewContext.Provider value={{ setPreviewCard }}>
      <ShareRoundDetail player={makePlayer(snapshot)} snapshot={snapshot} useUpgrades />
    </CardPreviewContext.Provider>,
  )

  const magnify = (name: string) => {
    fireEvent.click(screen.getByAltText(name))
    fireEvent.click(screen.getByTitle('Preview card'))
  }
  magnify('Battlegate Mimic')
  expect(setPreviewCard).toHaveBeenLastCalledWith(target, [applied])
  magnify('Brago’s Favor')
  expect(setPreviewCard).toHaveBeenLastCalledWith(unapplied, undefined)
  magnify('Adriana’s Valor')
  expect(setPreviewCard).toHaveBeenLastCalledWith(target, [applied])
})

it("leaves the board's gold edge to the page's frame", () => {
  const snapshot = makeSnapshot([makeCard('Battlegate Mimic')], [])

  const { container } = render(
    <PageFrame header={null} scroll={false} footer={<footer />}>
      <ShareRoundDetail player={makePlayer(snapshot)} snapshot={snapshot} useUpgrades />
    </PageFrame>,
  )

  expect(container.querySelectorAll('main .zone-divider-bg[class*="p-[2px]"], main.zone-divider-bg[class*="p-[2px]"]')).toHaveLength(1)
})
