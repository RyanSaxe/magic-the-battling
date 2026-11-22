// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { Register } from './Register'

// utils/inputMode reads matchMedia when it is imported, and jsdom has none.
vi.hoisted(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia
})

const TAKEN = 'That username is already taken.'

vi.mock('../contexts', () => ({ useToast: () => ({ addToast: () => {} }) }))
vi.mock('../contexts/authState', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    register: async () => {
      throw new Error(TAKEN)
    },
  }),
}))

afterEach(cleanup)

it('drops the sign-up error once the player edits the form', async () => {
  render(
    <MemoryRouter>
      <Register />
    </MemoryRouter>,
  )
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
  type('Username', 'jace_fan')
  type('Email', 'jace@example.com')
  type('Password', 'password1')
  type('Confirm Password', 'password1')
  await act(async () => screen.getByRole('button', { name: 'Create Account' }).click())
  expect(screen.queryByText(TAKEN)).not.toBeNull()

  type('Username', 'jace_fan2')
  expect(screen.queryByText(TAKEN)).toBeNull()
})
