// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { UPGRADES_HELP } from '../../constants/rules'
import { AddCubeModal } from './AddCubeModal'

vi.mock('../../api/client', () => ({
  createBattler: vi.fn(),
}))

afterEach(() => {
  cleanup()
})

it('shows the Upgrades tip in Add Cube / Deck without toggling the checkbox', () => {
  render(
    <AddCubeModal
      onClose={() => {}}
      onCreated={() => {}}
      addToast={() => {}}
    />,
  )

  const checkbox = screen.getByRole('checkbox', { name: 'Upgrades' }) as HTMLInputElement
  expect(checkbox.checked).toBe(true)

  const info = screen.getByRole('button', { name: 'What upgrades are' })
  fireEvent.click(info)

  expect(checkbox.checked).toBe(true)
  expect(screen.getByRole('tooltip').textContent).toBe(UPGRADES_HELP)

  fireEvent.click(screen.getByText('Upgrades'))
  expect(checkbox.checked).toBe(false)
})
