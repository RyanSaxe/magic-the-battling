import { useState, useEffect, useCallback, useRef } from 'react'
import type { CardCatalogEntry, CompactGameState, GameBootstrap, GameState, LobbyState } from '../types'
import { hydrateGameState } from '../utils/catalogHydration'

interface SpectateRequest {
  request_id: string
  spectator_name: string
}

interface WebSocketState {
  isConnected: boolean
  gameState: GameState | null
  lobbyState: LobbyState | null
  pendingSpectateRequest: SpectateRequest | null
  serverNotice: {
    mode: 'normal' | 'draining' | 'maintenance'
    message: string
    updated_at: string
    new_games_blocked?: boolean
    scheduled_for_utc?: string | null
    estimated_recovery_minutes?: number | null
  } | null
  kicked: boolean
  invalidSession: boolean
  gameNotFound: boolean
}

interface SpectatorConfig {
  spectatePlayer: string
  requestId: string
}

function computeReconnectDelayMs(attempt: number): number {
  const capped = Math.min(500 * (2 ** attempt), 30_000)
  return Math.floor(Math.random() * capped)
}

export interface VoiceSignalPayload {
  signal_type: string
  data: unknown
  from_player: string
}

export function useWebSocket(
  gameId: string | null,
  sessionId: string | null,
  spectatorConfig?: SpectatorConfig | null,
  onServerError?: (message: string) => void,
  onVoiceSignal?: (payload: VoiceSignalPayload) => void,
) {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    gameState: null,
    lobbyState: null,
    pendingSpectateRequest: null,
    serverNotice: null,
    kicked: false,
    invalidSession: false,
    gameNotFound: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const catalogRef = useRef<Record<string, CardCatalogEntry>>({})
  const reconnectTimeoutRef = useRef<number | null>(null)
  const reconnectAttempts = useRef(0)
  const isClosingRef = useRef(false)
  const connectionGenerationRef = useRef(0)
  const onServerErrorRef = useRef(onServerError)
  useEffect(() => {
    onServerErrorRef.current = onServerError
  }, [onServerError])
  const onVoiceSignalRef = useRef(onVoiceSignal)
  useEffect(() => {
    onVoiceSignalRef.current = onVoiceSignal
  }, [onVoiceSignal])

  useEffect(() => {
    if (!gameId || !sessionId) {
      isClosingRef.current = true
      catalogRef.current = {}
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      return
    }

    const generation = ++connectionGenerationRef.current
    isClosingRef.current = false
    reconnectAttempts.current = 0
    catalogRef.current = {}

    const connect = () => {
      if (!gameId || !sessionId || generation !== connectionGenerationRef.current) return

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      let url = `${protocol}//${host}/ws/${gameId}?session_id=${sessionId}`

      if (spectatorConfig) {
        url += `&spectate_player=${encodeURIComponent(spectatorConfig.spectatePlayer)}&request_id=${encodeURIComponent(spectatorConfig.requestId)}`
      }

      const ws = new WebSocket(url)
      wsRef.current = ws
      const isCurrentSocket = () => connectionGenerationRef.current === generation && wsRef.current === ws

      ws.onopen = () => {
        if (!isCurrentSocket()) return
        setState(s => ({
          ...s,
          isConnected: true,
          invalidSession: false,
          gameNotFound: false,
        }))
        reconnectAttempts.current = 0
      }

      const messageQueue: MessageEvent[] = []
      let processing = false

      async function processQueue() {
        if (processing) return
        processing = true
        while (messageQueue.length > 0) {
          if (!isCurrentSocket()) {
            messageQueue.length = 0
            break
          }
          const ev = messageQueue.shift()!
          try {
            let message
            if (ev.data instanceof Blob) {
              const ds = new DecompressionStream('gzip')
              const decompressed = ev.data.stream().pipeThrough(ds)
              const text = await new Response(decompressed).text()
              message = JSON.parse(text)
            } else {
              message = JSON.parse(ev.data)
            }
            if (message.type === 'game_bootstrap') {
              const payload = message.payload as GameBootstrap
              catalogRef.current = { ...payload.catalog, ...(payload.state.catalog_delta ?? {}) }
              setState(s => ({
                ...s,
                gameState: hydrateGameState(payload.state, catalogRef.current),
                lobbyState: null,
              }))
            } else if (message.type === 'game_state') {
              const payload = message.payload as CompactGameState
              if (payload.catalog_delta && Object.keys(payload.catalog_delta).length > 0) {
                catalogRef.current = { ...catalogRef.current, ...payload.catalog_delta }
              }
              const catalog = catalogRef.current
              setState(s => ({
                ...s,
                gameState: hydrateGameState(payload, catalog),
                lobbyState: null,
              }))
            } else if (message.type === 'lobby_state') {
              setState(s => ({ ...s, lobbyState: message.payload }))
            } else if (message.type === 'error') {
              onServerErrorRef.current?.(message.payload.message)
            } else if (message.type === 'spectate_request') {
              setState(s => ({ ...s, pendingSpectateRequest: message.payload }))
            } else if (message.type === 'server_notice') {
              setState(s => ({ ...s, serverNotice: message.payload }))
            } else if (message.type === 'kicked') {
              isClosingRef.current = true
              setState(s => ({ ...s, kicked: true }))
            } else if (message.type === 'voice_signal') {
              onVoiceSignalRef.current?.(message.payload)
            }
          } catch (err) {
            console.error('Failed to process WebSocket message:', err)
          }
        }
        processing = false
      }

      ws.onmessage = (event) => {
        if (!isCurrentSocket()) return
        messageQueue.push(event)
        processQueue()
      }

      ws.onclose = (event) => {
        if (!isCurrentSocket()) return
        setState(s => ({ ...s, isConnected: false }))
        wsRef.current = null

        if (event.code === 4001) {
          isClosingRef.current = true
          setState(s => ({ ...s, invalidSession: true }))
          return
        }
        if (event.code === 4004) {
          isClosingRef.current = true
          setState(s => ({ ...s, gameNotFound: true }))
          return
        }

        if (!isClosingRef.current) {
          const delay = computeReconnectDelayMs(reconnectAttempts.current)
          reconnectAttempts.current++
          reconnectTimeoutRef.current = window.setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {}
    }

    connect()

    return () => {
      isClosingRef.current = true
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
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
