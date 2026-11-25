import type {
  BattleView,
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
} from "../types";

type Catalog = Record<string, CardCatalogEntry>;

interface HydrationContext {
  catalog: Catalog;
  refsById: Map<string, CardRef>;
}

interface CatalogCardIdentity {
  scryfallId: string;
  instanceId: string;
}

function makeFallbackCard(ref: CardRef): Card {
  return {
    id: ref.id,
    scryfall_id: ref.scryfall_id,
    name: "",
    image_url: "",
    flip_image_url: null,
    png_url: null,
    flip_png_url: null,
    type_line: "",
    tokens: [],
    elo: null,
    upgrade_target: null,
    is_revealed: ref.is_revealed !== false,
    oracle_text: null,
    colors: [],
    keywords: [],
    cmc: 0,
    original_owner: ref.original_owner,
  };
}

function isCardRef(value: unknown): value is CardRef {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "scryfall_id" in value
  );
}

function hydrateCatalogCard(
  catalog: Catalog,
  identity: CatalogCardIdentity,
  tokenStack: Set<string>,
): Card {
  const { scryfallId, instanceId } = identity;
  const def = catalog[scryfallId];
  if (!def) {
    return makeFallbackCard({
      id: instanceId,
      scryfall_id: scryfallId,
      upgrade_target_id: null,
      original_owner: null,
    });
  }

  const nextTokenStack = new Set(tokenStack);
  nextTokenStack.add(scryfallId);
  const tokens = def.token_scryfall_ids
    .filter((tokenId) => !nextTokenStack.has(tokenId))
    .map((tokenId) =>
      hydrateCatalogCard(
        catalog,
        { scryfallId: tokenId, instanceId: tokenId },
        nextTokenStack,
      ),
    );

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
  };
}

function indexCardRefs(obj: unknown, refs: Map<string, CardRef>): void {
  if (obj === null || obj === undefined) {
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      indexCardRefs(item, refs);
    }
    return;
  }
  if (typeof obj !== "object") {
    return;
  }

  if (isCardRef(obj)) {
    refs.set(obj.id, obj);
    if (obj.upgrade_target_ref) {
      refs.set(obj.upgrade_target_ref.id, obj.upgrade_target_ref);
    }
    return;
  }

  for (const value of Object.values(obj)) {
    indexCardRefs(value, refs);
  }
}

function hydrateCard(
  ref: CardRef,
  ctx: HydrationContext,
  stack: Set<string> = new Set(),
): Card {
  if (stack.has(ref.id)) {
    return makeFallbackCard(ref);
  }

  const base = hydrateCatalogCard(
    ctx.catalog,
    { scryfallId: ref.scryfall_id, instanceId: ref.id },
    new Set(),
  );
  const nextStack = new Set(stack);
  nextStack.add(ref.id);

  return {
    ...base,
    original_owner: ref.original_owner,
    is_revealed: ref.is_revealed !== false,
    upgrade_target: ref.upgrade_target_id
      ? hydrateOptionalCard(
          ctx.refsById.get(ref.upgrade_target_id) ?? null,
          ctx,
          nextStack,
        )
      : null,
  };
}

function hydrateOptionalCard(
  ref: CardRef | null,
  ctx: HydrationContext,
  stack: Set<string> = new Set(),
): Card | null {
  if (!ref) {
    return null;
  }
  return hydrateCard(ref, ctx, stack);
}

function hydrateCards(refs: CardRef[], ctx: HydrationContext): Card[] {
  return refs.map((ref) => hydrateCard(ref, ctx));
}

function hydrateZones(zones: CompactZones, ctx: HydrationContext): Zones {
  return {
    battlefield: hydrateCards(zones.battlefield, ctx),
    graveyard: hydrateCards(zones.graveyard, ctx),
    exile: hydrateCards(zones.exile, ctx),
    hand: hydrateCards(zones.hand, ctx),
    sideboard: hydrateCards(zones.sideboard, ctx),
    upgrades: hydrateCards(zones.upgrades, ctx),
    command_zone: hydrateCards(zones.command_zone, ctx),
    library: hydrateCards(zones.library, ctx),
    treasures: zones.treasures,
    submitted_cards: hydrateCards(zones.submitted_cards, ctx),
    tapped_card_ids: zones.tapped_card_ids,
    flipped_card_ids: zones.flipped_card_ids,
    face_down_card_ids: zones.face_down_card_ids,
    counters: zones.counters,
    attachments: zones.attachments,
    spawned_tokens: hydrateCards(zones.spawned_tokens, ctx),
  };
}

function hydrateLastBattleResult(
  result: CompactLastBattleResult | null,
  ctx: HydrationContext,
): LastBattleResult | null {
  if (!result) {
    return null;
  }
  return {
    ...result,
    card_gained: hydrateOptionalCard(result.card_gained, ctx),
  };
}

function hydratePlayerView(
  player: CompactPlayerView,
  ctx: HydrationContext,
): PlayerView {
  return {
    ...player,
    upgrades: hydrateCards(player.upgrades, ctx),
    vanguard: hydrateOptionalCard(player.vanguard, ctx),
    most_recently_revealed_cards: hydrateCards(
      player.most_recently_revealed_cards,
      ctx,
    ),
    full_sideboard: hydrateCards(player.full_sideboard, ctx),
    command_zone: hydrateCards(player.command_zone, ctx),
  };
}

function hydrateSelfPlayer(
  player: CompactSelfPlayerView,
  ctx: HydrationContext,
): SelfPlayerView {
  return {
    ...hydratePlayerView(player, ctx),
    hand: hydrateCards(player.hand, ctx),
    hand_slots: player.hand_slots,
    sideboard: hydrateCards(player.sideboard, ctx),
    command_zone: hydrateCards(player.command_zone, ctx),
    current_pack: player.current_pack
      ? hydrateCards(player.current_pack, ctx)
      : null,
    last_battle_result: hydrateLastBattleResult(player.last_battle_result, ctx),
  };
}

function hydrateBattleView(
  battle: CompactBattleView | null,
  ctx: HydrationContext,
): BattleView | null {
  if (!battle) {
    return null;
  }
  return {
    ...battle,
    your_zones: hydrateZones(battle.your_zones, ctx),
    opponent_zones: hydrateZones(battle.opponent_zones, ctx),
    opponent_full_sideboard: hydrateCards(battle.opponent_full_sideboard, ctx),
    pending_reveal_animations: (battle.pending_reveal_animations ?? []).map(
      (anim) => ({
        animation_id: anim.animation_id,
        upgrade: hydrateCard(anim.upgrade, ctx),
        target: hydrateCard(anim.target, ctx),
        player_name: anim.player_name,
      }),
    ),
  };
}

export function hydrateGameState(
  compact: CompactGameState,
  catalog: Catalog,
): GameState {
  const refsById = new Map<string, CardRef>();
  indexCardRefs(compact, refsById);
  const ctx: HydrationContext = { catalog, refsById };

  return {
    ...compact,
    players: compact.players.map((player) => hydratePlayerView(player, ctx)),
    self_player: hydrateSelfPlayer(compact.self_player, ctx),
    available_upgrades: hydrateCards(compact.available_upgrades, ctx),
    current_battle: hydrateBattleView(compact.current_battle, ctx),
  };
}

export function hydrateCardCatalogEntries(
  cards: CardCatalogEntry[],
  catalog: Catalog,
): Card[] {
  const mergedCatalog: Catalog = { ...catalog };
  for (const card of cards) {
    mergedCatalog[card.scryfall_id] = card;
  }
  return cards.map((card) =>
    hydrateCatalogCard(
      mergedCatalog,
      { scryfallId: card.scryfall_id, instanceId: card.scryfall_id },
      new Set(),
    ),
  );
}
