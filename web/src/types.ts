export type Phase = 'draft' | 'build' | 'battle' | 'reward' | 'awaiting_elimination' | 'eliminated' | 'winner' | 'game_over'
export type LastResult = 'win' | 'loss' | 'draw'
export type CubeLoadingStatus = 'loading' | 'ready' | 'error'
export type ZoneName = 'battlefield' | 'graveyard' | 'exile' | 'hand' | 'sideboard' | 'upgrades' | 'command_zone' | 'library'
export type CardStateAction = 'tap' | 'untap' | 'flip' | 'face_down' | 'counter' | 'attach' | 'detach' | 'spawn' | 'create_treasure'
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
  upgrade_target: Card | null
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
  tapped_card_ids: string[]
  flipped_card_ids: string[]
  face_down_card_ids: string[]
  counters: Record<string, Record<string, number>>
  attachments: Record<string, string[]>
  spawned_tokens: Card[]
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
  is_bot: boolean
  time_of_death: number | null
  hand_count: number
  sideboard_count: number
  hand_size: number
  is_stage_increasing: boolean
  upgrades: Card[]
  vanguard: Card | null
  chosen_basics: string[]
  most_recently_revealed_cards: Card[]
  last_result: LastResult | null
  pairing_probability: number | null
  is_most_recent_ghost: boolean
  full_sideboard: Card[]
  placement: number
}

export interface LastBattleResult {
  opponent_name: string
  winner_name: string | null
  is_draw: boolean
  poison_dealt: number
  poison_taken: number
  treasures_gained: number
  card_gained: Card | null
  vanquisher_gained: boolean
}

export interface SelfPlayerView extends PlayerView {
  hand: Card[]
  sideboard: Card[]
  current_pack: Card[] | null
  last_battle_result: LastBattleResult | null
  build_ready: boolean
  in_sudden_death: boolean
}

export interface BattleView {
  opponent_name: string
  coin_flip_name: string
  your_zones: Zones
  opponent_zones: Zones
  opponent_hand_count: number
  result_submissions: Record<string, string>
  your_poison: number
  opponent_poison: number
  opponent_hand_revealed: boolean
  your_life: number
  opponent_life: number
  is_sudden_death: boolean
}

export interface GameState {
  game_id: string
  phase: string
  starting_life: number
  players: PlayerView[]
  self_player: SelfPlayerView
  available_upgrades: Card[]
  current_battle: BattleView | null
  use_upgrades: boolean
}

export interface LobbyPlayer {
  player_id: string
  name: string
  is_ready: boolean
  is_host: boolean
}

export interface LobbyState {
  game_id: string
  join_code: string
  players: LobbyPlayer[]
  can_start: boolean
  is_started: boolean
  target_player_count: number
  cube_loading_status: CubeLoadingStatus
  cube_loading_error: string | null
  available_bot_count: number | null
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
