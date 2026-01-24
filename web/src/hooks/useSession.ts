import { useState, useCallback } from 'react'

const SESSION_KEY = 'mtb_session'
const PLAYER_KEY = 'mtb_player'

interface Session {
  sessionId: string
  playerId: string
}

function getSessionFromStorage(): Session | null {
  const sessionId = sessionStorage.getItem(SESSION_KEY)
  const playerId = sessionStorage.getItem(PLAYER_KEY)
  if (sessionId && playerId) {
    return { sessionId, playerId }
  }
  return null
}

export function useSession() {
  const [session, setSession] = useState<Session | null>(getSessionFromStorage)

  const saveSession = useCallback((sessionId: string, playerId: string) => {
    sessionStorage.setItem(SESSION_KEY, sessionId)
    sessionStorage.setItem(PLAYER_KEY, playerId)
    setSession({ sessionId, playerId })
  }, [])

  const clearSession = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(PLAYER_KEY)
    setSession(null)
  }, [])

  return { session, saveSession, clearSession }
}
