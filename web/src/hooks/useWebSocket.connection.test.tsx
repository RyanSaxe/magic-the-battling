// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWebSocket } from '../test/fakeWebSocket'
import { useWebSocket } from './useWebSocket'

function render(gameId: string, sessionId: string) {
  return renderHook(({ game, session }) => useWebSocket(game, session, null), {
    initialProps: { game: gameId, session: sessionId },
  })
}

async function openSocket(): Promise<FakeWebSocket> {
  await act(async () => {
    vi.advanceTimersByTime(0)
  })
  const socket = FakeWebSocket.latest()
  act(() => socket.serverOpen())
  return socket
}

describe('useWebSocket connection status', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('starts a new game clean, without the previous game error or lobby', async () => {
    const hook = render('game-A', 'session-A')
    const socket = await openSocket()
    act(() => {
      socket.serverMessage({ type: 'lobby_state', payload: { game_id: 'game-A', players: [] } })
      socket.serverMessage({ type: 'connection_error', payload: { code: 'GAME_NOT_FOUND', message: 'Game not found' } })
      socket.serverClose(4004, 'Game not found')
    })
    expect(hook.result.current.connectionError?.code).toBe('GAME_NOT_FOUND')

    hook.rerender({ game: 'game-B', session: 'session-B' })

    expect(hook.result.current.status.kind).toBe('connecting')
    expect(hook.result.current.connectionError).toBeNull()
    expect(hook.result.current.lobbyState).toBeNull()
  })

  it('reconnects after a dropped connection', async () => {
    const hook = render('game-A', 'session-A')
    const socket = await openSocket()

    act(() => socket.serverClose(1006))
    expect(hook.result.current.status.kind).toBe('reconnecting')
    await act(async () => {
      vi.advanceTimersByTime(1_000)
    })

    expect(FakeWebSocket.instances).toHaveLength(2)
  })

  it.each([
    [4006, 'SEAT_MOVED'],
    [4005, 'KICKED'],
    [4001, 'INVALID_SESSION'],
  ])('stops for good on close code %i', async (closeCode, errorCode) => {
    const hook = render('game-A', 'session-A')
    const socket = await openSocket()

    act(() => socket.serverClose(closeCode))
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })

    expect(hook.result.current.status).toMatchObject({ kind: 'ended', error: { code: errorCode } })
    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('ends when the host removes the player, before the socket closes', async () => {
    const hook = render('game-A', 'session-A')
    const socket = await openSocket()

    act(() => socket.serverMessage({ type: 'kicked', payload: {} }))

    expect(hook.result.current.status).toMatchObject({ kind: 'ended', error: { code: 'KICKED' } })
  })
})
