import type {
  Card,
  CardCatalogEntry,
  CreateGameResponse,
  JoinGameResponse,
  GameStatusResponse,
  SpectateRequestStatus,
  ShareGameResponse,
  ServerStatus,
  PlayMode,
  AuthUser,
  UserBattler,
  GameSummary,
  FollowedBattler,
} from '../types'
import { getOrCreateDeviceId } from '../utils/deviceIdentity'
import { hydrateCardCatalogEntries } from '../utils/catalogHydration'

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
  playMode?: PlayMode
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
    play_mode: options.playMode ?? 'limited',
  })

  for (let attempt = 0; attempt < CREATE_RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(`${API_BASE}/games`, {
        method: 'POST',
        headers: withDeviceHeaders({
          'Content-Type': 'application/json',
          [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
        }),
        credentials: 'include',
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
    credentials: 'include',
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
    credentials: 'include',
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

export async function getGameCards(gameId: string, playerName?: string): Promise<GameCardsResponse> {
  const query = playerName ? `?player_name=${encodeURIComponent(playerName)}` : ''
  const response = await fetch(`${API_BASE}/games/${gameId}/cards${query}`)
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to load card pool'))
  }
  const payload = await response.json() as { cards: CardCatalogEntry[]; upgrades: CardCatalogEntry[] }
  const mergedCatalog = Object.fromEntries(
    [...payload.cards, ...payload.upgrades].map((card) => [card.scryfall_id, card]),
  )
  return {
    cards: hydrateCardCatalogEntries(payload.cards, mergedCatalog),
    upgrades: hydrateCardCatalogEntries(payload.upgrades, mergedCatalog),
  }
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

// ── Auth ────────────────────────────────────────────────────────────

export async function authRegister(username: string, password: string, email?: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password, email: email || null }),
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to register'))
  }
  return response.json()
}

export async function authLogin(username: string, password: string): Promise<AuthUser> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to log in'))
  }
  return response.json()
}

export async function authLogout(): Promise<void> {
  await fetch(`${API_BASE}/auth/logout`, { method: 'POST', credentials: 'include' })
}

export async function authGetMe(): Promise<AuthUser | null> {
  try {
    const response = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  }
}

// ── Battlers ────────────────────────────────────────────────────────

export async function getBattlers(): Promise<UserBattler[]> {
  const response = await fetch(`${API_BASE}/battlers`, { credentials: 'include' })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load battlers'))
  const data = await response.json()
  return data.battlers
}

export interface CreateBattlerRequest {
  cube_id: string
  display_name?: string
  use_upgrades?: boolean
  use_vanguards?: boolean
  play_mode?: PlayMode
  puppet_count?: number
  target_player_count?: number
  auto_approve_spectators?: boolean
  guided_mode_default?: boolean
}

export async function createBattler(data: CreateBattlerRequest): Promise<UserBattler> {
  const response = await fetch(`${API_BASE}/battlers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to create battler'))
  return response.json()
}

export async function updateBattler(id: number, data: Partial<CreateBattlerRequest> & { position?: number }): Promise<UserBattler> {
  const response = await fetch(`${API_BASE}/battlers/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to update battler'))
  return response.json()
}

export async function deleteBattler(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/battlers/${id}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to delete battler'))
}

export async function getBattlerGames(battlerId: number): Promise<GameSummary[]> {
  const response = await fetch(`${API_BASE}/battlers/${battlerId}/games`, { credentials: 'include' })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load games'))
  const data = await response.json()
  return data.games
}

// ── Follows ─────────────────────────────────��───────────────────────

export async function getFollowing(): Promise<FollowedBattler[]> {
  const response = await fetch(`${API_BASE}/battlers/following`, { credentials: 'include' })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load following'))
  const data = await response.json()
  return data.following
}

export async function followCube(cubeId: string, displayName?: string): Promise<FollowedBattler> {
  const response = await fetch(`${API_BASE}/battlers/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ cube_id: cubeId, display_name: displayName || null }),
  })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to follow cube'))
  return response.json()
}

export async function unfollowCube(followId: number): Promise<void> {
  const response = await fetch(`${API_BASE}/battlers/follow/${followId}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to unfollow'))
}

// ── Discover ────────────────────────────────────────────────────────

export interface DiscoverResult {
  cube_id: string
  game_count: number
  player_count: number
  last_played: string | null
  is_following: boolean
}

export async function discoverCubes(offset = 0): Promise<{ results: DiscoverResult[]; has_more: boolean }> {
  const response = await fetch(`${API_BASE}/discover?offset=${offset}`, { credentials: 'include' })
  if (!response.ok) throw new Error(await getErrorMessage(response, 'Failed to load cubes'))
  return response.json()
}
