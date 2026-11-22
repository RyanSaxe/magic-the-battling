import { hasForgottenSeat, onSeatsForgotten } from './deviceIdentity'

const LEGACY_SESSION_KEY = 'mtb_session'
const LEGACY_PLAYER_KEY = 'mtb_player'
const SESSION_KEY_PREFIX = 'mtb_session:'
const SPECTATE_KEY_PREFIX = 'mtb_spectate:'

/** The connection credential this tab uses for one game. It lives per tab, so each tab connects on its own. */
export interface TabSession {
  sessionId: string
  playerId: string
}

function sessionKey(gameId: string): string {
  return `${SESSION_KEY_PREFIX}${gameId}`
}

function parseSession(raw: string | null): TabSession | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<TabSession>
    if (typeof value.sessionId === 'string' && typeof value.playerId === 'string') {
      return { sessionId: value.sessionId, playerId: value.playerId }
    }
  } catch {
    // An unreadable entry is treated as no session.
  }
  return null
}

// A tab used to keep a single session for whatever game it opened. The first game the tab opens now adopts it;
// if it belonged to another game the server refuses it, and the seat token takes over from there.
function adoptLegacySession(gameId: string): TabSession | null {
  const sessionId = sessionStorage.getItem(LEGACY_SESSION_KEY)
  const playerId = sessionStorage.getItem(LEGACY_PLAYER_KEY)
  sessionStorage.removeItem(LEGACY_SESSION_KEY)
  sessionStorage.removeItem(LEGACY_PLAYER_KEY)
  if (!sessionId || !playerId) return null
  const session = { sessionId, playerId }
  saveTabSession(gameId, session)
  return session
}

/** This tab's session for the game, until the browser forgets the seat, which can happen in another tab. */
export function readTabSession(gameId: string): TabSession | null {
  const session = parseSession(sessionStorage.getItem(sessionKey(gameId)))
  if (!session) return adoptLegacySession(gameId)
  if (!hasForgottenSeat(gameId)) return session
  clearTabSession(gameId)
  return null
}

export function saveTabSession(gameId: string, session: TabSession): void {
  sessionStorage.setItem(sessionKey(gameId), JSON.stringify(session))
}

export function clearTabSession(gameId: string): void {
  sessionStorage.removeItem(sessionKey(gameId))
}

/** Drops this tab's sessions for seats the browser has forgotten, before anything can remember those games again. */
export function dropForgottenSessions(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (!key.startsWith(SESSION_KEY_PREFIX)) continue
    const gameId = key.slice(SESSION_KEY_PREFIX.length)
    if (hasForgottenSeat(gameId)) clearTabSession(gameId)
  }
}

/** Drops this tab's sessions as their seats are forgotten, whatever page it shows. */
export function watchForForgottenSeats(): () => void {
  dropForgottenSessions()
  return onSeatsForgotten((gameIds) => gameIds.forEach(clearTabSession))
}

/** The request this tab made to watch a player in one game, with its spectator session once approved. */
export interface TabSpectate {
  target: string
  requestId: string
  sessionId: string | null
}

function spectateKey(gameId: string): string {
  return `${SPECTATE_KEY_PREFIX}${gameId}`
}

export function readTabSpectate(gameId: string): TabSpectate | null {
  const raw = sessionStorage.getItem(spectateKey(gameId))
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as Partial<TabSpectate>
    if (typeof value.target === 'string' && typeof value.requestId === 'string') {
      return {
        target: value.target,
        requestId: value.requestId,
        sessionId: typeof value.sessionId === 'string' ? value.sessionId : null,
      }
    }
  } catch {
    // An unreadable entry is treated as no request.
  }
  return null
}

export function saveTabSpectate(gameId: string, spectate: TabSpectate): void {
  sessionStorage.setItem(spectateKey(gameId), JSON.stringify(spectate))
}

export function clearTabSpectate(gameId: string): void {
  sessionStorage.removeItem(spectateKey(gameId))
}
