// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { installMemoryLocalStorage } from '../../test/memoryStorage'
import { rememberGuestName } from '../../utils/deviceIdentity'
import { LobbySeatNotice } from './LobbySeatNotice'

const auth = vi.hoisted(() => ({ user: null as { username: string } | null }))
vi.mock('../../contexts/authState', () => ({ useAuth: () => auth }))
vi.mock('../../api/client', () => ({
  getLobby: async () => ({ join_code: 'ABC123', players: [], puppet_count: 0, target_player_count: 4 }),
}))

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it("offers a guest's remembered name until the login check finds an account, whose name wins", async () => {
  installMemoryLocalStorage()
  rememberGuestName('Kellogg')
  const notice = () => (
    <MemoryRouter>
      <LobbySeatNotice gameId="game-1" seat={{ kind: 'none' }} onJoined={() => {}} onClaim={() => {}} onTakeBack={() => {}} />
    </MemoryRouter>
  )
  const { rerender } = render(notice())
  await act(async () => {})
  const name = screen.getByLabelText<HTMLInputElement>('Your Name')
  expect(name.value).toBe('Kellogg')

  auth.user = { username: 'Jaya' }
  rerender(notice())

  expect(name.value).toBe('Jaya')
})
