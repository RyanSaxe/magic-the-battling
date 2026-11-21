import { type AppError, type AppErrorCode, createAppError } from './appError'

const FINAL_CLOSE_CODES: Record<number, { code: AppErrorCode; detail: string }> = {
  1013: { code: 'WS_CAPACITY', detail: 'Server is at websocket capacity' },
  4001: { code: 'INVALID_SESSION', detail: 'Invalid session' },
  4004: { code: 'GAME_NOT_FOUND', detail: 'Game not found' },
  4006: { code: 'SEAT_MOVED', detail: 'Seat opened elsewhere' },
}

/** The error a close code ends the connection with, or null when the client should reconnect. */
export function connectionErrorForCloseCode(closeCode: number, reason: string): AppError | null {
  const final = FINAL_CLOSE_CODES[closeCode]
  if (!final) return null
  return createAppError({
    code: final.code,
    detail: reason || final.detail,
    context: 'default',
    fallbackMessage: 'The connection could not be established.',
  })
}
