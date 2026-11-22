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
export const PLAYER_NAME = 'Alice'
const OPPONENT_NAME = 'Bob'
type CardKind = 'spell' | 'land' | 'upgrade'

// Real cards, so screenshots taken with real card art look like a game. Nothing waits for their images to load.
const REAL_CARDS: [CardKind, string, string, string][] = [
  ['spell', '33672990-4860-4aa6-ac1b-f9da66f5da59', 'Wurmcoil Engine', 'Artifact Creature — Phyrexian Wurm'],
  ['spell', '3bd78731-949c-464a-826a-92f86d784911', 'Carnage Tyrant', 'Creature — Dinosaur'],
  ['spell', '82d5ce46-7118-4ede-ba1d-c387e7ce16e7', 'Mantis Rider', 'Creature — Human Monk'],
  ['spell', '9d914868-9000-4df2-a818-0ef8a7f636ae', 'Goldspan Dragon', 'Creature — Dragon'],
  ['spell', '451c8a79-1e8a-437d-836f-31155914c551', 'Great Sable Stag', 'Creature — Elk'],
  ['spell', '820e2f07-f637-4144-b45a-0e1430dcf55e', 'Devoted Druid', 'Creature — Elf Druid'],
  ['spell', '83b7c93b-06c1-4377-b516-171f6c6a1b9c', 'Dreadhorde Arcanist', 'Creature — Zombie Wizard'],
  ['spell', 'c4c7cba5-6111-40ce-828a-e811301bb283', 'Lesser Masticore', 'Artifact Creature — Masticore'],
  ['spell', 'e419cd0b-2449-4cc5-9ead-b9e45e271700', "Phlage, Titan of Fire's Fury", 'Legendary Creature — Elder Giant'],
  ['spell', '1825a719-1b2a-4af9-9cd2-7cb497cd0317', 'Force of Negation', 'Instant'],
  ['spell', '30284c06-4477-4dde-8b28-9646324303d5', 'Selesnya Charm', 'Instant'],
  ['spell', 'f83c7d53-2599-42a9-ae96-a2699c5164cb', 'Crackling Doom', 'Instant'],
  ['spell', '696d1e25-5c25-4522-b085-90d49fe23a18', 'The Rack', 'Artifact'],
  ['spell', '48d73cb5-22ac-43df-9c4b-0c860bb80b3e', 'Gravecrawler', 'Creature — Zombie'],
  ['land', '8ca3c48b-f104-4292-9a4e-2ce87a65893c', 'Mutavault', 'Land'],
  ['land', 'c7066095-f05a-4f2e-ab9c-47c498608ccb', 'Lavaclaw Reaches', 'Land'],
  ['land', 'd556d10b-83cc-4736-b269-4ce65aae2837', 'Stirring Wildwood', 'Land'],
  ['upgrade', '167c6740-0625-4987-8fac-516aab564ca1', 'Immediate Action', 'Conspiracy'],
  ['upgrade', '57c57a16-328d-4c87-adf0-7af8f3515339', "Muzzio's Preparations", 'Conspiracy'],
  ['upgrade', '8789ef9e-f68c-4ff0-8621-47678038131b', 'Unexpected Potential', 'Conspiracy'],
  ['upgrade', '9bb6ece9-2038-4dbc-83aa-01ab4d7980b4', "Brago's Favor", 'Conspiracy'],
]

function catalogEntry(scryfallId: string, name: string, typeLine: string): CardCatalogEntry {
  return {
    scryfall_id: scryfallId,
    name,
    image_url: `https://cards.scryfall.io/large/front/${scryfallId[0]}/${scryfallId[1]}/${scryfallId}.jpg`,
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

const CATALOG: Record<string, CardCatalogEntry> = Object.fromEntries(
  REAL_CARDS.map(([, id, name, typeLine]) => [id, catalogEntry(id, name, typeLine)]),
)

const IDS_BY_KIND: Record<CardKind, string[]> = {
  spell: REAL_CARDS.filter(([kind]) => kind === 'spell').map(([, id]) => id),
  land: REAL_CARDS.filter(([kind]) => kind === 'land').map(([, id]) => id),
  upgrade: REAL_CARDS.filter(([kind]) => kind === 'upgrade').map(([, id]) => id),
}

/** `count` cards of one kind, cycling through the real cards so neighbors differ. */
function cards(prefix: string, count: number, kind: CardKind = 'spell', offset = 0): CardRef[] {
  const ids = IDS_BY_KIND[kind]
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    scryfall_id: ids[(index + offset) % ids.length],
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
  graveyard?: number
  exile?: number
  library?: number
  /** Cards Bob showed in his last fight, which his scouting panel lists. */
  opponentRevealed?: number
}

export type GamePhase = 'draft' | 'build' | 'battle' | 'reward' | 'eliminated' | 'game_over'

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
  yours.library = cards('your-library', counts.library ?? 20)
  yours.sideboard = cards('battle-sideboard', counts.sideboard ?? 0, 'spell', 4)
  yours.graveyard = cards('your-graveyard', counts.graveyard ?? 0, 'spell', 10)
  yours.exile = cards('your-exile', counts.exile ?? 0, 'spell', 12)
  const theirs = emptyZones()
  theirs.battlefield = [
    ...cards('their-land', counts.opponentLands ?? counts.lands ?? 0, 'land', 1),
    ...cards('their-creature', counts.opponentNonlands ?? counts.nonlands ?? 0, 'spell', 7),
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
  const sideboard = cards('pool', counts.sideboard ?? 0, 'spell', 3)
  // The game goes on without an eliminated player, so the others are still building and can be watched.
  const othersPhase: Phase = phase === 'eliminated' ? 'build' : phase
  const placements: Record<string, number> =
    phase === 'game_over' ? { Alice: 2, Bob: 1, Carol: 3, Dave: 4 } : phase === 'eliminated' ? { Alice: 4 } : {}
  const self: CompactSelfPlayerView = {
    ...playerView(PLAYER_NAME, phase, {
      hand_size: handSize,
      hand_count: hand.length,
      sideboard_count: sideboard.length,
      upgrades: cards('upgrade', counts.upgrades ?? 0, 'upgrade'),
      is_stage_increasing: stageEnd,
      in_sudden_death: suddenDeath,
      placement: placements[PLAYER_NAME] ?? 0,
    }),
    hand,
    sideboard,
    command_zone: [],
    current_pack: phase === 'draft' ? cards('pack', counts.pack ?? 0, 'spell', 9) : null,
    last_battle_result: phase === 'reward'
      ? {
          opponent_name: OPPONENT_NAME,
          winner_name: PLAYER_NAME,
          is_draw: false,
          poison_dealt: 2,
          poison_taken: 0,
          treasures_gained: 1,
          card_gained: cards('gained', 1, 'spell', 5)[0],
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
      playerView(OPPONENT_NAME, othersPhase, {
        placement: placements[OPPONENT_NAME] ?? 0,
        most_recently_revealed_cards: cards('revealed', counts.opponentRevealed ?? 0, 'spell', 6),
      }),
      playerView('Carol', othersPhase, { placement: placements.Carol ?? 0 }),
      playerView('Dave', othersPhase, { is_puppet: true, placement: placements.Dave ?? 0 }),
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
