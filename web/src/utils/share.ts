import type { ShareGameResponse, SelfPlayerView, PlayerView } from '../types'

export function buildGameSummaryData(
  data: ShareGameResponse,
  targetPlayer?: string,
): { selfPlayer: SelfPlayerView; players: PlayerView[] } | null {
  const targetName = targetPlayer ?? data.owner_name
  const target = data.players.find((p) => p.name === targetName)
  if (!target || target.snapshots.length === 0) return null

  const lastSnap = target.snapshots[target.snapshots.length - 1]

  const selfPlayer: SelfPlayerView = {
    name: target.name,
    treasures: lastSnap.treasures,
    poison: lastSnap.poison,
    phase: 'game_over',
    round: lastSnap.round,
    stage: lastSnap.stage,
    vanquishers: 0,
    is_ghost: false,
    is_puppet: target.is_puppet,
    time_of_death: null,
    hand_count: lastSnap.hand.length,
    sideboard_count: lastSnap.sideboard.length,
    hand_size: lastSnap.hand.length,
    is_stage_increasing: false,
    upgrades: lastSnap.upgrades?.length ? lastSnap.upgrades : lastSnap.applied_upgrades,
    vanguard: lastSnap.vanguard,
    chosen_basics: lastSnap.basic_lands,
    most_recently_revealed_cards: [],
    last_result: null,
    pairing_probability: null,
    is_most_recent_ghost: false,
    full_sideboard: [],
    command_zone: lastSnap.command_zone,
    placement: target.final_placement ?? 0,
    in_sudden_death: false,
    build_ready: false,
    hand: lastSnap.hand,
    sideboard: lastSnap.sideboard,
    current_pack: null,
    last_battle_result: lastSnap.treasures > 0 ? {
      opponent_name: '',
      winner_name: null,
      is_draw: false,
      poison_dealt: 0,
      poison_taken: 0,
      treasures_gained: 0,
      card_gained: null,
      vanquisher_gained: false,
      pre_battle_treasures: lastSnap.treasures,
    } : null,
  }

  const players: PlayerView[] = data.players.map((p) => {
    const snap = p.snapshots[p.snapshots.length - 1]
    return {
      name: p.name,
      treasures: snap?.treasures ?? 0,
      poison: p.final_poison,
      phase: 'game_over',
      round: snap?.round ?? 0,
      stage: snap?.stage ?? 0,
      vanquishers: 0,
      is_ghost: false,
      is_puppet: p.is_puppet,
      time_of_death: null,
      hand_count: snap?.hand.length ?? 0,
      sideboard_count: snap?.sideboard.length ?? 0,
      hand_size: snap?.hand.length ?? 0,
      is_stage_increasing: false,
      upgrades: snap?.upgrades?.length ? snap.upgrades : (snap?.applied_upgrades ?? []),
      vanguard: snap?.vanguard ?? null,
      chosen_basics: snap?.basic_lands ?? [],
      most_recently_revealed_cards: [],
      last_result: null,
      pairing_probability: null,
      is_most_recent_ghost: false,
      full_sideboard: [],
      command_zone: snap?.command_zone ?? [],
      placement: p.final_placement ?? 0,
      in_sudden_death: false,
      build_ready: false,
    }
  })

  return { selfPlayer, players }
}
