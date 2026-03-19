import type {
  Card,
  CardCatalogEntry,
  CardRef,
  CompactBattleView,
  CompactGameState,
  CompactLastBattleResult,
  CompactPlayerView,
  CompactSelfPlayerView,
  CompactZones,
  GameState,
  LastBattleResult,
  PlayerView,
  SelfPlayerView,
  Zones,
} from '../types'

type Catalog = Record<string, CardCatalogEntry>

function makeFallbackCard(ref: CardRef): Card {
  return {
    id: ref.id,
    scryfall_id: ref.scryfall_id,
    name: '',
    image_url: '',
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    type_line: '',
    tokens: [],
    elo: null,
    upgrade_target: null,
    is_revealed: ref.is_revealed !== false,
    oracle_text: null,
    colors: [],
    keywords: [],
    cmc: 0,
    original_owner: ref.original_owner,
  }
}

function hydrateCatalogCard(
  catalog: Catalog,
  scryfallId: string,
  instanceId: string,
  tokenStack: Set<string>,
): Card {
  const def = catalog[scryfallId]
  if (!def) {
    return makeFallbackCard({
      id: instanceId,
      scryfall_id: scryfallId,
      upgrade_target_id: null,
      original_owner: null,
    })
  }

  const nextTokenStack = new Set(tokenStack)
  nextTokenStack.add(scryfallId)
  const tokens = def.token_scryfall_ids
    .filter((tokenId) => !nextTokenStack.has(tokenId))
    .map((tokenId) => hydrateCatalogCard(catalog, tokenId, tokenId, nextTokenStack))

  return {
    id: instanceId,
    scryfall_id: scryfallId,
    name: def.name,
    image_url: def.image_url,
    flip_image_url: def.flip_image_url,
    png_url: def.png_url,
    flip_png_url: def.flip_png_url,
    type_line: def.type_line,
    tokens,
    elo: null,
    upgrade_target: null,
    is_revealed: true,
    oracle_text: def.oracle_text,
    colors: def.colors,
    keywords: def.keywords,
    cmc: def.cmc,
    original_owner: null,
  }
}

function indexCardRefs(obj: unknown, refs: Map<string, CardRef>): void {
  if (obj == null) {
    return
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      indexCardRefs(item, refs)
    }
    return
  }
  if (typeof obj !== 'object') {
    return
  }

  if ('id' in obj && 'scryfall_id' in obj) {
    const ref = obj as CardRef
    refs.set(ref.id, ref)
    return
  }

  for (const value of Object.values(obj)) {
    indexCardRefs(value, refs)
  }
}

function hydrateCard(
  ref: CardRef,
  catalog: Catalog,
  refsById: Map<string, CardRef>,
  stack: Set<string> = new Set(),
): Card {
  if (stack.has(ref.id)) {
    return makeFallbackCard(ref)
  }

  const base = hydrateCatalogCard(catalog, ref.scryfall_id, ref.id, new Set())
  const nextStack = new Set(stack)
  nextStack.add(ref.id)

  return {
    ...base,
    original_owner: ref.original_owner,
    is_revealed: ref.is_revealed !== false,
    upgrade_target: ref.upgrade_target_id ? hydrateOptionalCard(refsById.get(ref.upgrade_target_id) ?? null, catalog, refsById, nextStack) : null,
  }
}

function hydrateOptionalCard(
  ref: CardRef | null,
  catalog: Catalog,
  refsById: Map<string, CardRef>,
  stack: Set<string> = new Set(),
): Card | null {
  if (!ref) {
    return null
  }
  return hydrateCard(ref, catalog, refsById, stack)
}

function hydrateCards(refs: CardRef[], catalog: Catalog, refsById: Map<string, CardRef>): Card[] {
  return refs.map((ref) => hydrateCard(ref, catalog, refsById))
}

function hydrateZones(zones: CompactZones, catalog: Catalog, refsById: Map<string, CardRef>): Zones {
  return {
    battlefield: hydrateCards(zones.battlefield, catalog, refsById),
    graveyard: hydrateCards(zones.graveyard, catalog, refsById),
    exile: hydrateCards(zones.exile, catalog, refsById),
    hand: hydrateCards(zones.hand, catalog, refsById),
    sideboard: hydrateCards(zones.sideboard, catalog, refsById),
    upgrades: hydrateCards(zones.upgrades, catalog, refsById),
    command_zone: hydrateCards(zones.command_zone, catalog, refsById),
    library: hydrateCards(zones.library, catalog, refsById),
    treasures: zones.treasures,
    submitted_cards: hydrateCards(zones.submitted_cards, catalog, refsById),
    tapped_card_ids: zones.tapped_card_ids,
    flipped_card_ids: zones.flipped_card_ids,
    face_down_card_ids: zones.face_down_card_ids,
    counters: zones.counters,
    attachments: zones.attachments,
    spawned_tokens: hydrateCards(zones.spawned_tokens, catalog, refsById),
  }
}

function hydrateLastBattleResult(
  result: CompactLastBattleResult | null,
  catalog: Catalog,
  refsById: Map<string, CardRef>,
): LastBattleResult | null {
  if (!result) {
    return null
  }
  return {
    ...result,
    card_gained: hydrateOptionalCard(result.card_gained, catalog, refsById),
  }
}

function hydratePlayerView(player: CompactPlayerView, catalog: Catalog, refsById: Map<string, CardRef>): PlayerView {
  return {
    ...player,
    upgrades: hydrateCards(player.upgrades, catalog, refsById),
    vanguard: hydrateOptionalCard(player.vanguard, catalog, refsById),
    most_recently_revealed_cards: hydrateCards(player.most_recently_revealed_cards, catalog, refsById),
    full_sideboard: hydrateCards(player.full_sideboard, catalog, refsById),
    command_zone: hydrateCards(player.command_zone, catalog, refsById),
  }
}

function hydrateSelfPlayer(
  player: CompactSelfPlayerView,
  catalog: Catalog,
  refsById: Map<string, CardRef>,
): SelfPlayerView {
  return {
    ...hydratePlayerView(player, catalog, refsById),
    hand: hydrateCards(player.hand, catalog, refsById),
    sideboard: hydrateCards(player.sideboard, catalog, refsById),
    command_zone: hydrateCards(player.command_zone, catalog, refsById),
    current_pack: player.current_pack ? hydrateCards(player.current_pack, catalog, refsById) : null,
    last_battle_result: hydrateLastBattleResult(player.last_battle_result, catalog, refsById),
  }
}

function hydrateBattleView(
  battle: CompactBattleView | null,
  catalog: Catalog,
  refsById: Map<string, CardRef>,
) {
  if (!battle) {
    return null
  }
  return {
    ...battle,
    your_zones: hydrateZones(battle.your_zones, catalog, refsById),
    opponent_zones: hydrateZones(battle.opponent_zones, catalog, refsById),
    opponent_full_sideboard: hydrateCards(battle.opponent_full_sideboard, catalog, refsById),
  }
}

export function hydrateGameState(compact: CompactGameState, catalog: Catalog): GameState {
  const refsById = new Map<string, CardRef>()
  indexCardRefs(compact, refsById)

  return {
    ...compact,
    players: compact.players.map((player) => hydratePlayerView(player, catalog, refsById)),
    self_player: hydrateSelfPlayer(compact.self_player, catalog, refsById),
    available_upgrades: hydrateCards(compact.available_upgrades, catalog, refsById),
    current_battle: hydrateBattleView(compact.current_battle, catalog, refsById),
  }
}

export function hydrateCardCatalogEntries(cards: CardCatalogEntry[], catalog: Catalog): Card[] {
  const mergedCatalog: Catalog = { ...catalog }
  for (const card of cards) {
    mergedCatalog[card.scryfall_id] = card
  }
  return cards.map((card) => hydrateCatalogCard(mergedCatalog, card.scryfall_id, card.scryfall_id, new Set()))
}
