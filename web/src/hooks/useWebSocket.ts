import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameState, LobbyState } from '../types'

interface SpectateRequest {
  request_id: string
  spectator_name: string
}

interface WebSocketState {
  isConnected: boolean
  gameState: GameState | null
  lobbyState: LobbyState | null
  error: string | null
  pendingSpectateRequest: SpectateRequest | null
}

interface SpectatorConfig {
  spectatePlayer: string
  requestId: string
}

export function useWebSocket(
  gameId: string | null,
  sessionId: string | null,
  spectatorConfig?: SpectatorConfig | null
) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    gameState: null,
    lobbyState: null,
    error: null,
    pendingSpectateRequest: null,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttempts = useRef(0)
  const isClosingRef = useRef(false)

  useEffect(() => {
    if (!gameId || !sessionId) return

    isClosingRef.current = false
    reconnectAttempts.current = 0

    const connect = () => {
      if (!gameId || !sessionId) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      let url = `${protocol}//${host}/ws/${gameId}?session_id=${sessionId}`

      if (spectatorConfig) {
        url += `&spectate_player=${encodeURIComponent(spectatorConfig.spectatePlayer)}&request_id=${encodeURIComponent(spectatorConfig.requestId)}`
      }

      const ws = new WebSocket(url)

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
        } else if (message.type === 'spectate_request') {
          setState(s => ({ ...s, pendingSpectateRequest: message.payload }))
        }
      }

      ws.onclose = () => {
        setState(s => ({ ...s, isConnected: false }))
        wsRef.current = null

        if (!isClosingRef.current) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
          reconnectAttempts.current++
          reconnectTimeoutRef.current = window.setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        setState(s => ({ ...s, error: 'WebSocket connection error' }))
      }

      wsRef.current = ws
    }

    connect()

    return () => {
      isClosingRef.current = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [gameId, sessionId, spectatorConfig])

  const send = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, payload }))
    }
  }, [])

  const clearSpectateRequest = useCallback(() => {
    setState(s => ({ ...s, pendingSpectateRequest: null }))
  }, [])

  return { ...state, send, clearSpectateRequest }
}
