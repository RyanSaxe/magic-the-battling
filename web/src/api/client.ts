import type {
  Card,
  CreateGameResponse,
  JoinGameResponse,
  GameStatusResponse,
  SpectateRequestStatus,
  ShareGameResponse,
  ServerStatus,
} from '../types'
import { getOrCreateDeviceId } from '../utils/deviceIdentity'

const API_BASE = '/api'
const DEVICE_ID_HEADER = 'X-MTB-Device-Id'
const IDEMPOTENCY_KEY_HEADER = 'X-MTB-Idempotency-Key'
const CREATE_RETRY_BASE_MS = 150
const CREATE_RETRY_MAX_MS = 2000
const CREATE_RETRY_MAX_ATTEMPTS = 5
const CREATE_RETRY_MAX_TOTAL_MS = 12_000

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createRetryDelay(attempt: number): number {
  const exp = Math.min(CREATE_RETRY_BASE_MS * (2 ** attempt), CREATE_RETRY_MAX_MS)
  return Math.floor(Math.random() * exp)
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status === 503 || status === 504 || status >= 500
}

function withDeviceHeaders(baseHeaders: HeadersInit = {}): HeadersInit {
  const deviceId = getOrCreateDeviceId()
  if (!deviceId) return baseHeaders
  return { ...baseHeaders, [DEVICE_ID_HEADER]: deviceId }
}

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json()
    return data.detail || fallback
  } catch {
    return fallback
  }
}

export interface GameOptions {
  cubeId?: string
  useUpgrades?: boolean
  useVanguards?: boolean
  targetPlayerCount?: number
  puppetCount?: number
  autoApproveSpectators?: boolean
  guidedModeDefault?: boolean
}

export async function createGame(
  playerName: string,
  options: GameOptions = {}
): Promise<CreateGameResponse> {
  const idempotencyKey = createIdempotencyKey()
  const startedAt = Date.now()
  const body = JSON.stringify({
    player_name: playerName,
    cube_id: options.cubeId ?? 'auto',
    use_upgrades: options.useUpgrades ?? true,
    use_vanguards: options.useVanguards ?? false,
    target_player_count: options.targetPlayerCount ?? 4,
    puppet_count: options.puppetCount ?? 0,
    auto_approve_spectators: options.autoApproveSpectators ?? false,
    guided_mode_default: options.guidedModeDefault ?? false,
  })

  for (let attempt = 0; attempt < CREATE_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/games`, {
        method: 'POST',
        headers: withDeviceHeaders({
          'Content-Type': 'application/json',
          [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
        }),
        body,
      })

      if (response.ok) {
        return response.json()
      }

      const message = await getErrorMessage(response, 'Failed to create game')
      const elapsed = Date.now() - startedAt
      const canRetry = isRetryableStatus(response.status)
        && attempt < CREATE_RETRY_MAX_ATTEMPTS - 1
        && elapsed < CREATE_RETRY_MAX_TOTAL_MS
      if (!canRetry) {
        throw new Error(message)
      }
    } catch (err) {
      const elapsed = Date.now() - startedAt
      const isAbortError = err instanceof DOMException && err.name === 'AbortError'
      const canRetry = !isAbortError
        && attempt < CREATE_RETRY_MAX_ATTEMPTS - 1
        && elapsed < CREATE_RETRY_MAX_TOTAL_MS
      if (!canRetry) {
        if (err instanceof Error) {
          throw err
        }
        throw new Error('Failed to create game')
      }
    }

    await sleep(createRetryDelay(attempt))
  }

  throw new Error('Failed to create game')
}

export async function joinGame(joinCode: string, playerName: string): Promise<JoinGameResponse> {
  const response = await fetch(`${API_BASE}/games/join`, {
    method: 'POST',
    headers: withDeviceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ join_code: joinCode, player_name: playerName }),
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to join game'))
  }
  return response.json()
}

export async function startGame(gameId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/games/${gameId}/start`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to start game'))
  }
}

export async function rejoinGame(gameId: string, playerName: string): Promise<JoinGameResponse> {
  const response = await fetch(`${API_BASE}/games/${gameId}/rejoin`, {
    method: 'POST',
    headers: withDeviceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ player_name: playerName }),
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to rejoin game'))
  }
  return response.json()
}

export async function getGameStatus(gameId: string): Promise<GameStatusResponse> {
  const response = await fetch(`${API_BASE}/games/${gameId}/status`)
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to get game status'))
  }
  return response.json()
}

export async function createSpectateRequest(
  gameId: string,
  targetPlayerName: string,
  spectatorName: string
): Promise<{ request_id: string }> {
  const response = await fetch(`${API_BASE}/games/${gameId}/spectate-request`, {
    method: 'POST',
    headers: withDeviceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ target_player_name: targetPlayerName, spectator_name: spectatorName }),
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to create spectate request'))
  }
  return response.json()
}

export async function getSpectateRequestStatus(
  gameId: string,
  requestId: string
): Promise<SpectateRequestStatus> {
  const response = await fetch(`${API_BASE}/games/${gameId}/spectate-request/${requestId}`)
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to get spectate status'))
  }
  return response.json()
}

export interface GameCardsResponse {
  cards: Card[]
  upgrades: Card[]
}

export async function getGameCards(gameId: string): Promise<GameCardsResponse> {
  const response = await fetch(`${API_BASE}/games/${gameId}/cards`)
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to load card pool'))
  }
  return response.json()
}

export async function getShareGame(gameId: string, playerName: string): Promise<ShareGameResponse> {
  const response = await fetch(`${API_BASE}/games/${gameId}/share/${encodeURIComponent(playerName)}`)
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to load shared game'))
  }
  return response.json()
}

export async function getServerStatus(): Promise<ServerStatus> {
  const response = await fetch(`${API_BASE}/server/status`)
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to load server status'))
  }
  return response.json()
}

const _lastWarmTimes = new Map<string, number>()

export function warmCubeCache(cubeId: string): void {
  const now = Date.now()
  if (now - (_lastWarmTimes.get(cubeId) ?? 0) < 30_000) return
  _lastWarmTimes.set(cubeId, now)
  fetch(`${API_BASE}/games/cubes/warm`, {
    method: 'POST',
    headers: withDeviceHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ cube_id: cubeId }),
  }).catch(() => {})
}
