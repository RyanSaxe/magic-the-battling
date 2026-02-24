import type { Card, CreateGameResponse, JoinGameResponse, GameStatusResponse, SpectateRequestStatus, ShareGameResponse } from '../types'

const API_BASE = '/api'

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
      puppet_count: options.puppetCount ?? 0,
      auto_approve_spectators: options.autoApproveSpectators ?? false,
    }),
  })
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, 'Failed to create game'))
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
    headers: { 'Content-Type': 'application/json' },
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
    headers: { 'Content-Type': 'application/json' },
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
