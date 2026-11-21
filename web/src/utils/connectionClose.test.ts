import { describe, expect, it } from 'vitest'
import { connectionErrorForCloseCode } from './connectionClose'

describe('connectionErrorForCloseCode', () => {
  it('ends the connection when another tab took the seat, so two tabs never fight over it', () => {
    expect(connectionErrorForCloseCode(4006, '')?.code).toBe('SEAT_MOVED')
  })

  it.each([
    [4001, 'INVALID_SESSION'],
    [4004, 'GAME_NOT_FOUND'],
    [1013, 'WS_CAPACITY'],
  ])('ends the connection on close code %i', (closeCode, errorCode) => {
    expect(connectionErrorForCloseCode(closeCode, '')?.code).toBe(errorCode)
  })

  it.each([1000, 1001, 1006, 1011])('reconnects after close code %i', (closeCode) => {
    expect(connectionErrorForCloseCode(closeCode, '')).toBeNull()
  })
})
