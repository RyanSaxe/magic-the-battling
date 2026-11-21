const LEGACY_SESSION_KEY = 'mtb_session'
const LEGACY_PLAYER_KEY = 'mtb_player'
const SESSION_KEY_PREFIX = 'mtb_session:'

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

export function readTabSession(gameId: string): TabSession | null {
  return parseSession(sessionStorage.getItem(sessionKey(gameId))) ?? adoptLegacySession(gameId)
}

export function saveTabSession(gameId: string, session: TabSession): void {
  sessionStorage.setItem(sessionKey(gameId), JSON.stringify(session))
}

export function clearTabSession(gameId: string): void {
  sessionStorage.removeItem(sessionKey(gameId))
}
