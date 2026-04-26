import { describe, expect, it } from 'vitest'

import { getAppErrorMessage, unknownToAppError, wsPayloadToAppError } from './appError'

describe('appError', () => {
  it('maps spectate target failures separately from missing games', () => {
    const error = wsPayloadToAppError(
      { code: 'SPECTATE_TARGET_NOT_FOUND', detail: 'Target player not found' },
      'default',
      'Fallback message',
    )

    expect(getAppErrorMessage(error, 'game-connection', 'Fallback message')).toBe(
      'That player is no longer available to spectate.',
    )
  })

  it('uses create-game specific copy for server updates', () => {
    const error = wsPayloadToAppError(
      { code: 'SERVER_UPDATING', detail: 'Server is updating. New games are temporarily blocked.' },
      'default',
      'Fallback message',
    )

    expect(getAppErrorMessage(error, 'create-game', 'Fallback message')).toContain(
      'New games are temporarily paused',
    )
  })

  it('preserves user-facing details for user-message errors', () => {
    const error = unknownToAppError(
      new Error('Battler is still loading'),
      'lobby-action',
      'Fallback message',
    )

    expect(error.message).toBe('Battler is still loading')
  })
})
