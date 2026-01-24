import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameState, LobbyState } from '../types'

interface WebSocketState {
  isConnected: boolean
  gameState: GameState | null
  lobbyState: LobbyState | null
  error: string | null
}

export function useWebSocket(gameId: string | null, sessionId: string | null) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    gameState: null,
    lobbyState: null,
    error: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttempts = useRef(0)

  useEffect(() => {
    if (!gameId || !sessionId) return

    const connect = () => {
      if (!gameId || !sessionId) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      const ws = new WebSocket(`${protocol}//${host}/ws/${gameId}?session_id=${sessionId}`)

      ws.onopen = () => {
        setState(s => ({ ...s, isConnected: true, error: null }))
        reconnectAttempts.current = 0
      }

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data)
        if (message.type === 'game_state') {
          setState(s => ({ ...s, gameState: message.payload, lobbyState: null }))
        } else if (message.type === 'lobby_state') {
          setState(s => ({ ...s, lobbyState: message.payload }))
        } else if (message.type === 'error') {
          setState(s => ({ ...s, error: message.payload.message }))
        }
      }

      ws.onclose = () => {
        setState(s => ({ ...s, isConnected: false }))
        wsRef.current = null

        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
        reconnectAttempts.current++
        reconnectTimeoutRef.current = window.setTimeout(connect, delay)
      }

      ws.onerror = () => {
        setState(s => ({ ...s, error: 'WebSocket connection error' }))
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [gameId, sessionId])

  const send = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, payload }))
    }
  }, [])

  return { ...state, send }
}
