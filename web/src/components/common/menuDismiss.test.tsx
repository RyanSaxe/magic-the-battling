// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { MoreMenu } from '../dashboard/MoreMenu'
import { UserMenuButton } from './AppHeader'
import { SidePanelHostContext } from './sidePanelHost'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

vi.mock('../../contexts', () => ({ useToast: () => ({ addToast: () => {} }) }))
vi.mock('../../contexts/authState', () => ({ useAuth: () => ({ user: { username: 'tester' }, loading: false }) }))

afterEach(() => {
  cleanup()
  document.body.replaceChildren()
})

it.each<[string, ReactNode, string]>([
  ["a card's menu", <MoreMenu label="More" items={[{ label: 'View', onSelect: () => {} }]} />, 'More'],
  ['the account menu', <UserMenuButton />, 'Menu'],
])('%s takes the whole tap that closes it, so nothing underneath gets the click', (_, menu, opener) => {
  const feltCover = document.body.appendChild(document.createElement('div'))
  render(
    <MemoryRouter>
      <SidePanelHostContext.Provider value={feltCover}>{menu}</SidePanelHostContext.Provider>
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByRole('button', { name: opener }))

  const tapTarget = feltCover.firstElementChild
  expect(tapTarget).not.toBeNull()
  fireEvent.mouseDown(tapTarget!)
  expect(feltCover.firstElementChild).toBe(tapTarget)

  fireEvent.click(tapTarget!)
  expect(feltCover.childElementCount).toBe(0)
})
