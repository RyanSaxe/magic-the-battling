import type {
  CardCatalogEntry,
  CardRef,
  CompactBattleView,
  CompactGameState,
  CompactPlayerView,
  CompactSelfPlayerView,
  CompactZones,
  GameBootstrap,
  Phase,
} from '../src/types'

export const GAME_ID = 'game-layout'
const PLAYER_NAME = 'Alice'
const OPPONENT_NAME = 'Bob'
const CARD_IMAGE_URL = 'https://cards.scryfall.io/large/front/mock.jpg'

function catalogEntry(scryfallId: string, typeLine: string): CardCatalogEntry {
  return {
    scryfall_id: scryfallId,
    name: scryfallId,
    image_url: CARD_IMAGE_URL,
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    type_line: typeLine,
    oracle_text: null,
    colors: [],
    keywords: [],
    cmc: 2,
    life_modifier: null,
    hand_modifier: null,
    token_scryfall_ids: [],
    is_upgrade: typeLine === 'Conspiracy',
    is_vanguard: false,
    is_companion: false,
  }
}

const CATALOG: Record<string, CardCatalogEntry> = {
  creature: catalogEntry('creature', 'Creature — Bear'),
  land: catalogEntry('land', 'Basic Land — Forest'),
  upgrade: catalogEntry('upgrade', 'Conspiracy'),
}

function cards(prefix: string, count: number, scryfallId: keyof typeof CATALOG = 'creature'): CardRef[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    scryfall_id: scryfallId,
    upgrade_target_id: null,
    original_owner: null,
  }))
}

function playerView(name: string, phase: Phase, overrides: Partial<CompactPlayerView> = {}): CompactPlayerView {
  return {
    name,
    treasures: 2,
    poison: 3,
    phase,
    round: 2,
    stage: 4,
    vanquishers: 0,
    is_ghost: false,
    is_puppet: false,
    time_of_death: null,
    hand_count: 0,
    sideboard_count: 0,
    hand_size: 4,
    is_stage_increasing: false,
    upgrades: [],
    vanguard: null,
    chosen_basics: ['Forest', 'Island', 'Plains'],
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: null,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: [],
    placement: 0,
    in_sudden_death: false,
    build_ready: false,
    ...overrides,
  }
}

function emptyZones(): CompactZones {
  return {
    battlefield: [],
    graveyard: [],
    exile: [],
    hand: [],
    sideboard: [],
    upgrades: [],
    command_zone: [],
    library: [],
    treasures: 0,
    submitted_cards: [],
    original_hand_ids: [],
    tapped_card_ids: [],
    flipped_card_ids: [],
    face_down_card_ids: [],
    counters: {},
    attachments: {},
    spawned_tokens: [],
  }
}

/** Card counts on the screen under test. Zones a phase does not show are ignored. */
export interface Counts {
  pack?: number
  hand?: number
  handSize?: number
  sideboard?: number
  upgrades?: number
  rewardUpgrades?: number
  lands?: number
  nonlands?: number
  opponentHand?: number
  opponentLands?: number
  opponentNonlands?: number
}

export type GamePhase = 'draft' | 'build' | 'battle' | 'reward'

export interface ScreenState {
  phase: GamePhase
  counts: Counts
  stageEnd?: boolean
  suddenDeath?: boolean
}

function battleView(counts: Counts, suddenDeath: boolean): CompactBattleView {
  const yours = emptyZones()
  yours.hand = cards('battle-hand', counts.hand ?? 0)
  yours.battlefield = [...cards('your-land', counts.lands ?? 0, 'land'), ...cards('your-creature', counts.nonlands ?? 0)]
  yours.library = cards('your-library', 20)
  const theirs = emptyZones()
  theirs.battlefield = [
    ...cards('their-land', counts.opponentLands ?? counts.lands ?? 0, 'land'),
    ...cards('their-creature', counts.opponentNonlands ?? counts.nonlands ?? 0),
  ]
  theirs.library = cards('their-library', 20)
  return {
    opponent_name: OPPONENT_NAME,
    coin_flip_name: PLAYER_NAME,
    on_the_play_name: PLAYER_NAME,
    current_turn_name: PLAYER_NAME,
    your_zones: yours,
    opponent_zones: theirs,
    opponent_hand_count: counts.opponentHand ?? counts.hand ?? 0,
    result_submissions: {},
    your_poison: 3,
    opponent_poison: 4,
    opponent_hand_revealed: false,
    your_life: 20,
    opponent_life: 20,
    is_sudden_death: suddenDeath,
    opponent_full_sideboard: [],
    can_manipulate_opponent: false,
    pending_reveal_animations: [],
  }
}

export function gameBootstrap({ phase, counts, stageEnd = false, suddenDeath = false }: ScreenState): GameBootstrap {
  const handSize = counts.handSize ?? 4
  const hand = cards('hand', Math.min(counts.hand ?? 0, handSize))
  const sideboard = cards('pool', counts.sideboard ?? 0)
  const self: CompactSelfPlayerView = {
    ...playerView(PLAYER_NAME, phase, {
      hand_size: handSize,
      hand_count: hand.length,
      sideboard_count: sideboard.length,
      upgrades: cards('upgrade', counts.upgrades ?? 0, 'upgrade'),
      is_stage_increasing: stageEnd,
      in_sudden_death: suddenDeath,
    }),
    hand,
    sideboard,
    command_zone: [],
    current_pack: phase === 'draft' ? cards('pack', counts.pack ?? 0) : null,
    last_battle_result: phase === 'reward'
      ? {
          opponent_name: OPPONENT_NAME,
          winner_name: PLAYER_NAME,
          is_draw: false,
          poison_dealt: 2,
          poison_taken: 0,
          treasures_gained: 1,
          card_gained: cards('gained', 1)[0],
          vanquisher_gained: false,
          pre_battle_treasures: 1,
        }
      : null,
  }
  const state: CompactGameState = {
    game_id: GAME_ID,
    phase,
    starting_life: 20,
    players: [
      self,
      playerView(OPPONENT_NAME, phase, { placement: 0 }),
      playerView('Carol', phase),
      playerView('Dave', phase, { is_puppet: true }),
    ],
    self_player: self,
    available_upgrades: phase === 'reward' && stageEnd ? cards('offer', counts.rewardUpgrades ?? 3, 'upgrade') : [],
    current_battle: phase === 'battle' ? battleView(counts, suddenDeath) : null,
    battle_resolution: null,
    use_upgrades: true,
    voice_chat_enabled: false,
    cube_id: 'vintage-cube',
    play_mode: 'limited',
    catalog_delta: {},
  }
  return { catalog: CATALOG, state }
}
