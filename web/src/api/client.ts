import type { CreateGameResponse, JoinGameResponse } from '../types'

const API_BASE = '/api'

export async function createGame(playerName: string, cubeId: string = 'auto'): Promise<CreateGameResponse> {
  const response = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player_name: playerName, cube_id: cubeId }),
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
