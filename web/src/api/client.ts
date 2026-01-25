import type { CreateGameResponse, JoinGameResponse } from '../types'

const API_BASE = '/api'

export interface GameOptions {
  cubeId?: string
  useUpgrades?: boolean
  useVanguards?: boolean
  targetPlayerCount?: number
}

export async function createGame(
  playerName: string,
  options: GameOptions = {}
): Promise<CreateGameResponse> {
  const response = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      player_name: playerName,
      cube_id: options.cubeId ?? 'auto',
      use_upgrades: options.useUpgrades ?? true,
      use_vanguards: options.useVanguards ?? false,
      target_player_count: options.targetPlayerCount ?? 4,
    }),
  })
  if (!response.ok) {
    throw new Error('Failed to create game')
  }
  return response.json()
}

export async function joinGame(joinCode: string, playerName: string): Promise<JoinGameResponse> {
  const response = await fetch(`${API_BASE}/games/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ join_code: joinCode, player_name: playerName }),
  })
  if (!response.ok) {
    throw new Error('Failed to join game')
  }
  return response.json()
}

export async function startGame(gameId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/games/${gameId}/start`, {
    method: 'POST',
  })
  if (!response.ok) {
    throw new Error('Failed to start game')
  }
}

export async function rejoinGame(gameId: string, playerName: string): Promise<JoinGameResponse> {
  const response = await fetch(`${API_BASE}/games/${gameId}/rejoin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_name: playerName }),
  })
  if (!response.ok) {
    throw new Error('Failed to rejoin game')
  }
  return response.json()
}

export interface BotAvailabilityResponse {
  available: boolean
  count: number
}

export async function checkBotAvailability(
  useUpgrades: boolean,
  useVanguards: boolean
): Promise<BotAvailabilityResponse> {
  const params = new URLSearchParams({
    use_upgrades: String(useUpgrades),
    use_vanguards: String(useVanguards),
  })
  const response = await fetch(`${API_BASE}/games/bots/available?${params}`)
  if (!response.ok) {
    throw new Error('Failed to check bot availability')
  }
  return response.json()
}
