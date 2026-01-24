export type Phase = 'draft' | 'build' | 'battle' | 'reward' | 'eliminated'
export type ZoneName = 'battlefield' | 'graveyard' | 'exile' | 'hand' | 'sideboard' | 'upgrades' | 'command_zone' | 'library'
export type CardDestination = 'hand' | 'sideboard' | 'upgrades'
export type BuildSource = 'hand' | 'sideboard'

export interface Card {
  id: string
  name: string
  image_url: string
  flip_image_url: string | null
  png_url: string | null
  flip_png_url: string | null
  type_line: string
  tokens: Card[]
  elo: number | null
  upgrade_target: string | null
}

export interface Zones {
  battlefield: Card[]
  graveyard: Card[]
  exile: Card[]
  hand: Card[]
  sideboard: Card[]
  upgrades: Card[]
  command_zone: Card[]
  library: Card[]
  treasures: number
  submitted_cards: Card[]
}

export interface PlayerView {
  name: string
  treasures: number
  poison: number
  phase: Phase
  round: number
  stage: number
  vanquishers: number
  is_ghost: boolean
  time_of_death: number | null
  hand_count: number
  sideboard_count: number
  hand_size: number
  is_stage_increasing: boolean
  upgrades: Card[]
  vanguard: Card | null
  chosen_basics: string[]
}

export interface SelfPlayerView extends PlayerView {
  hand: Card[]
  sideboard: Card[]
  current_pack: Card[] | null
}

export interface BattleView {
  opponent_name: string
  coin_flip_name: string
  your_zones: Zones
  opponent_zones: Zones
  opponent_hand_count: number
  result_submissions: Record<string, string>
}

export interface GameState {
  game_id: string
  phase: string
  players: PlayerView[]
  self_player: SelfPlayerView
  available_upgrades: Card[]
  current_battle: BattleView | null
}

export interface LobbyPlayer {
  name: string
  is_ready: boolean
}

export interface LobbyState {
  game_id: string
  join_code: string
  players: LobbyPlayer[]
  can_start: boolean
  is_started: boolean
}

export interface CreateGameResponse {
  game_id: string
  join_code: string
  session_id: string
  player_id: string
}

export interface JoinGameResponse {
  game_id: string
  session_id: string
  player_id: string
}

export interface WebSocketMessage {
  type: string
  payload: unknown
}
