export type Phase = 'draft' | 'build' | 'battle' | 'reward' | 'awaiting_elimination' | 'eliminated' | 'winner' | 'game_over'
export type PlayMode = 'limited' | 'constructed'
export type LastResult = 'win' | 'loss' | 'draw'
export type CubeLoadingStatus = 'loading' | 'ready' | 'error'
export type BattlerLoadingStatus = 'missing' | 'loading' | 'ready' | 'error'
export type ZoneName = 'battlefield' | 'graveyard' | 'exile' | 'hand' | 'sideboard' | 'upgrades' | 'command_zone' | 'library'
export type CardStateAction = 'tap' | 'untap' | 'flip' | 'face_down' | 'counter' | 'attach' | 'detach' | 'spawn' | 'create_treasure'
export type CardDestination = 'hand' | 'sideboard' | 'upgrades'
export type BuildSource = 'hand' | 'sideboard'

export interface Card {
  id: string
  scryfall_id?: string
  name: string
  image_url: string
  flip_image_url: string | null
  png_url: string | null
  flip_png_url: string | null
  type_line: string
  tokens: Card[]
  elo: number | null
  upgrade_target: Card | null
  oracle_text: string | null
  colors: string[]
  keywords?: string[]
  cmc: number
  original_owner?: string | null
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
  is_puppet: boolean
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
  command_zone: Card[]
  placement: number
  in_sudden_death: boolean
  build_ready: boolean
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
  pre_battle_treasures: number
}

export interface BattleResolutionEvent {
  event_type: 'base_increment' | 'upgrade_beam'
  source_card_id: string | null
}

export interface BattleResolutionSide {
  name: string
  starting_poison: number
  ending_poison: number
  poison_delta: number
  took_damage: boolean
  is_lethal: boolean
  show_death_animation: boolean
  events: BattleResolutionEvent[]
}

export interface BattleResolution {
  resolution_id: string
  winner_name: string | null
  is_draw: boolean
  is_sudden_death: boolean
  continue_sudden_death: boolean
  your_side: BattleResolutionSide
  opponent_side: BattleResolutionSide
}

export interface SelfPlayerView extends PlayerView {
  hand: Card[]
  sideboard: Card[]
  command_zone: Card[]
  current_pack: Card[] | null
  last_battle_result: LastBattleResult | null
  build_ready: boolean
  in_sudden_death: boolean
}

export interface BattleView {
  opponent_name: string
  coin_flip_name: string
  on_the_play_name: string
  current_turn_name: string
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
  opponent_full_sideboard: Card[]
  can_manipulate_opponent: boolean
}

export interface GameState {
  game_id: string
  phase: string
  starting_life: number
  players: PlayerView[]
  self_player: SelfPlayerView
  available_upgrades: Card[]
  current_battle: BattleView | null
  battle_resolution: BattleResolution | null
  use_upgrades: boolean
  cube_id: string
  play_mode: PlayMode
}

export interface CardCatalogEntry {
  scryfall_id: string
  name: string
  image_url: string
  flip_image_url: string | null
  png_url: string | null
  flip_png_url: string | null
  type_line: string
  oracle_text: string | null
  colors: string[]
  keywords: string[]
  cmc: number
  life_modifier: number | null
  hand_modifier: number | null
  token_scryfall_ids: string[]
  is_upgrade: boolean
  is_vanguard: boolean
  is_companion: boolean
}

export interface CardRef {
  id: string
  scryfall_id: string
  upgrade_target_id: string | null
  original_owner: string | null
}

export interface CompactZones {
  battlefield: CardRef[]
  graveyard: CardRef[]
  exile: CardRef[]
  hand: CardRef[]
  sideboard: CardRef[]
  upgrades: CardRef[]
  command_zone: CardRef[]
  library: CardRef[]
  treasures: number
  submitted_cards: CardRef[]
  original_hand_ids: string[]
  tapped_card_ids: string[]
  flipped_card_ids: string[]
  face_down_card_ids: string[]
  counters: Record<string, Record<string, number>>
  attachments: Record<string, string[]>
  spawned_tokens: CardRef[]
  revealed_card_ids?: string[]
}

export interface CompactLastBattleResult {
  opponent_name: string
  winner_name: string | null
  is_draw: boolean
  poison_dealt: number
  poison_taken: number
  treasures_gained: number
  card_gained: CardRef | null
  vanquisher_gained: boolean
  pre_battle_treasures: number
}

export interface CompactPlayerView {
  name: string
  treasures: number
  poison: number
  phase: Phase
  round: number
  stage: number
  vanquishers: number
  is_ghost: boolean
  is_puppet: boolean
  time_of_death: number | null
  hand_count: number
  sideboard_count: number
  hand_size: number
  is_stage_increasing: boolean
  upgrades: CardRef[]
  vanguard: CardRef | null
  chosen_basics: string[]
  most_recently_revealed_cards: CardRef[]
  last_result: LastResult | null
  pairing_probability: number | null
  is_most_recent_ghost: boolean
  full_sideboard: CardRef[]
  command_zone: CardRef[]
  placement: number
  in_sudden_death: boolean
  build_ready: boolean
}

export interface CompactSelfPlayerView extends CompactPlayerView {
  hand: CardRef[]
  sideboard: CardRef[]
  command_zone: CardRef[]
  current_pack: CardRef[] | null
  last_battle_result: CompactLastBattleResult | null
}

export interface CompactBattleView {
  opponent_name: string
  coin_flip_name: string
  on_the_play_name: string
  current_turn_name: string
  your_zones: CompactZones
  opponent_zones: CompactZones
  opponent_hand_count: number
  result_submissions: Record<string, string>
  your_poison: number
  opponent_poison: number
  opponent_hand_revealed: boolean
  your_life: number
  opponent_life: number
  is_sudden_death: boolean
  opponent_full_sideboard: CardRef[]
  can_manipulate_opponent: boolean
}

export interface CompactGameState {
  game_id: string
  phase: string
  starting_life: number
  players: CompactPlayerView[]
  self_player: CompactSelfPlayerView
  available_upgrades: CardRef[]
  current_battle: CompactBattleView | null
  battle_resolution: BattleResolution | null
  use_upgrades: boolean
  cube_id: string
  play_mode: PlayMode
}

export interface GameBootstrap {
  catalog: Record<string, CardCatalogEntry>
  state: CompactGameState
}

export interface LobbyPlayer {
  player_id: string
  name: string
  is_ready: boolean
  is_host: boolean
  battler_id: string | null
  battler_status: BattlerLoadingStatus | null
  battler_error: string | null
}

export interface LobbyState {
  game_id: string
  join_code: string
  cube_id: string
  players: LobbyPlayer[]
  can_start: boolean
  is_started: boolean
  target_player_count: number
  puppet_count: number
  cube_loading_status: CubeLoadingStatus
  cube_loading_error: string | null
  available_puppet_count: number | null
  use_upgrades: boolean
  guided_mode_default: boolean
  play_mode: PlayMode
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

export interface GameStatusPlayer {
  name: string
  is_connected: boolean
  is_puppet: boolean
  phase: string
}

export interface GameStatusResponse {
  game_id: string
  phase: string
  is_started: boolean
  players: GameStatusPlayer[]
  auto_approve_spectators: boolean
}

export interface ServerStatus {
  mode: 'normal' | 'draining' | 'maintenance'
  message: string
  updated_at: string
  new_games_blocked: boolean
  scheduled_for_utc: string | null
  estimated_recovery_minutes: number | null
}

export interface SpectateRequestStatus {
  status: 'pending' | 'approved' | 'denied'
  session_id?: string
  player_id?: string
}

export interface SharePlayerSnapshot {
  stage: number
  round: number
  hand: Card[]
  sideboard: Card[]
  command_zone: Card[]
  applied_upgrades: Card[]
  upgrades?: Card[]
  basic_lands: string[]
  treasures: number
  poison: number
  vanguard: Card | null
}

export interface SharePlayerData {
  name: string
  final_placement: number | null
  final_poison: number
  is_puppet: boolean
  snapshots: SharePlayerSnapshot[]
}

export interface ShareGameResponse {
  game_id: string
  owner_name: string
  created_at: string
  use_upgrades: boolean
  players: SharePlayerData[]
}
