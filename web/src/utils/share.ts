import type {
  Card,
  ShareGameResponse,
  SelfPlayerView,
  PlayerView,
  SharePlayerData,
  SharePlayerSnapshot,
  ShareSnapshotVisibility,
} from '../types'

export type SharePlayerRowBadge = 'viewing' | 'alive' | 'dead'

export type ShareHiddenZone = 'hand' | 'sideboard' | 'upgrades'

const HIDDEN_ZONES: Record<ShareSnapshotVisibility, ShareHiddenZone[]> = {
  full: [],
  hand_hidden: ['hand', 'upgrades'],
  hidden: ['hand', 'sideboard', 'upgrades'],
}

export function getShareHiddenZones(snapshot: SharePlayerSnapshot): ShareHiddenZone[] {
  return HIDDEN_ZONES[snapshot.visibility]
}

// Builds saved before the full list existed read it back as [], with only their applied upgrades filled in.
export function getShareUpgrades(snapshot: SharePlayerSnapshot): Card[] {
  return snapshot.upgrades?.length ? snapshot.upgrades : snapshot.applied_upgrades
}

/** The band under a round: why the server hid it while the game goes on, else whether it was a Sudden Death build. */
export function getShareRoundBand(
  player: SharePlayerData,
  snapshot: SharePlayerSnapshot,
): 'Still Fighting' | 'Game in Progress' | 'Sudden Death' | null {
  if (snapshot.visibility === 'hidden') {
    return player.final_placement === null ? 'Still Fighting' : 'Game in Progress'
  }
  return snapshot.sudden_death_build === null ? null : 'Sudden Death'
}

interface ShareRoundPosition {
  stage: number
  round: number
  sudden_death_build: number | null
}

function compareShareRounds(
  a: ShareRoundPosition,
  b: ShareRoundPosition,
): number {
  if (a.stage !== b.stage) return a.stage - b.stage
  if (a.round !== b.round) return a.round - b.round
  return (a.sudden_death_build ?? 0) - (b.sudden_death_build ?? 0)
}

export function getShareRoundValue(position: ShareRoundPosition): string {
  const value = `${position.stage}_${position.round}`
  return position.sudden_death_build === null ? value : `${value}_${position.sudden_death_build}`
}

/** A round's name. Short names a Sudden Death build's round as 5-1, so the name fits a phone's round chip. */
export function getShareRoundLabel(position: ShareRoundPosition, short = false): string {
  const label = `Stage ${position.stage} - Round ${position.round}`
  if (position.sudden_death_build === null) return label
  const round = short ? `${position.stage}-${position.round}` : label
  return position.sudden_death_build === 1
    ? `${round} · Sudden Death`
    : `${round} · Sudden Death ${position.sudden_death_build}`
}

export function parseShareRoundValue(selectedRound: string): ShareRoundPosition | null {
  const [stagePart, roundPart, suddenDeathPart] = selectedRound.split('_')
  const stage = Number(stagePart)
  const round = Number(roundPart)
  const suddenDeathBuild = suddenDeathPart === undefined ? null : Number(suddenDeathPart)
  if (!Number.isInteger(stage) || !Number.isInteger(round)) return null
  if (suddenDeathBuild !== null && !Number.isInteger(suddenDeathBuild)) return null

  return { stage, round, sudden_death_build: suddenDeathBuild }
}

function getLatestShareSnapshot(player: SharePlayerData): SharePlayerSnapshot | null {
  return player.snapshots[player.snapshots.length - 1] ?? null
}

function getRoundTiming(player: SharePlayerData, selectedRound: string): 'before' | 'last' | 'after' {
  const latestSnapshot = getLatestShareSnapshot(player)
  const round = parseShareRoundValue(selectedRound)
  if (!latestSnapshot || !round) return 'after'

  const order = compareShareRounds(round, latestSnapshot)
  if (order === 0) return 'last'
  return order < 0 ? 'before' : 'after'
}

// The latest round is the last the sharer played.
function endedOnLatestRound(data: ShareGameResponse, player: SharePlayerData, selectedRound: string): boolean {
  if (getRoundTiming(player, selectedRound) !== 'last') return false

  const sharer = data.players.find((candidate) => candidate.name === data.owner_name)
  return !sharer || getRoundTiming(sharer, selectedRound) !== 'before'
}

// A row shows what each player took into the round until their game has ended: from the round after their last, or on
// that last round where it's a finished game's last step.
// Games saved before final state was recorded have no final treasures, so they keep showing the last snapshot.
function getShareFinalStateForRound(
  data: ShareGameResponse,
  player: SharePlayerData,
  selectedRound: string,
): { poison: number; treasures: number } | null {
  if (player.final_treasures === null) return null

  const showsHowItEnded = getRoundTiming(player, selectedRound) === 'after'
    || (!data.in_progress && endedOnLatestRound(data, player, selectedRound))
  return showsHowItEnded ? { poison: player.final_poison, treasures: player.final_treasures } : null
}

// A past round ranks players as they stood. The latest round shows where they finished.
function getSharePlacementForRound(data: ShareGameResponse, player: SharePlayerData, selectedRound: string): number {
  // While the game goes on, a player without final treasures finished after every round the page lists.
  if (player.final_placement === null || (data.in_progress && player.final_treasures === null)) return 0

  if (getRoundTiming(player, selectedRound) === 'after') return player.final_placement
  return endedOnLatestRound(data, player, selectedRound) ? player.final_placement : 0
}

// A Sudden Death entry counts everyone who played its round, because a player who survived that round stays in the
// game while the two at lethal fight it out.
function playedShareRound(
  player: SharePlayerData,
  selectedRound: string,
): boolean {
  const round = parseShareRoundValue(selectedRound)
  if (!round) return false

  return player.snapshots.some((snapshot) =>
    snapshot.stage === round.stage && snapshot.round === round.round,
  )
}

export function getSharePlayerSnapshotForRound(
  player: SharePlayerData,
  selectedRound: string,
): SharePlayerSnapshot | null {
  const round = parseShareRoundValue(selectedRound)
  if (!round) return getLatestShareSnapshot(player)

  let bestSnapshot: SharePlayerSnapshot | null = null
  for (const snapshot of player.snapshots) {
    if (compareShareRounds(snapshot, round) > 0) continue
    if (!bestSnapshot || compareShareRounds(snapshot, bestSnapshot) > 0) {
      bestSnapshot = snapshot
    }
  }

  return bestSnapshot
}

function isOutInShareRound(player: SharePlayerData, selectedRound: string): boolean {
  return player.final_treasures !== null && getRoundTiming(player, selectedRound) !== 'before'
    ? player.final_placement !== 1
    : !playedShareRound(player, selectedRound)
}

/** The build a round's board shows: the player's own from that round, or their last once they are out. */
export function getShareBoardSnapshot(player: SharePlayerData, selectedRound: string): SharePlayerSnapshot | null {
  const ownBuild = player.snapshots.find((snapshot) => getShareRoundValue(snapshot) === selectedRound)
  if (ownBuild) return ownBuild

  const isAfterTheirLast = getRoundTiming(player, selectedRound) === 'after'
  return isAfterTheirLast && isOutInShareRound(player, selectedRound) ? getLatestShareSnapshot(player) : null
}

export function getSharePlayerRowBadge(
  player: SharePlayerData,
  selectedPlayer: string,
  selectedRound: string,
): SharePlayerRowBadge {
  if (isOutInShareRound(player, selectedRound)) return 'dead'
  return player.name === selectedPlayer ? 'viewing' : 'alive'
}

export function buildSharePlayerViews(
  data: ShareGameResponse | null,
  selectedRound: string,
): PlayerView[] {
  if (!data) return []

  return data.players.map((player) => {
    const snapshot = getSharePlayerSnapshotForRound(player, selectedRound)
    const latestSnapshot = getLatestShareSnapshot(player)
    const displaySnapshot = snapshot ?? latestSnapshot
    const finalState = getShareFinalStateForRound(data, player, selectedRound)

    return {
      name: player.name,
      treasures: finalState?.treasures ?? displaySnapshot?.treasures ?? 0,
      poison: finalState?.poison ?? displaySnapshot?.poison ?? player.final_poison,
      phase: 'game_over',
      round: displaySnapshot?.round ?? 0,
      stage: displaySnapshot?.stage ?? 0,
      vanquishers: 0,
      is_ghost: false,
      is_puppet: player.is_puppet,
      time_of_death: null,
      hand_count: displaySnapshot?.hand.length ?? 0,
      sideboard_count: displaySnapshot?.sideboard.length ?? 0,
      hand_size: displaySnapshot?.hand.length ?? 0,
      is_stage_increasing: false,
      upgrades: displaySnapshot ? getShareUpgrades(displaySnapshot) : [],
      vanguard: displaySnapshot?.vanguard ?? null,
      chosen_basics: displaySnapshot?.basic_lands ?? [],
      most_recently_revealed_cards: [],
      last_result: null,
      pairing_probability: null,
      is_most_recent_ghost: false,
      full_sideboard: [],
      command_zone: displaySnapshot?.command_zone ?? [],
      placement: getSharePlacementForRound(data, player, selectedRound),
      in_sudden_death: false,
      build_ready: false,
    }
  })
}

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
    poison: target.final_poison,
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
    upgrades: getShareUpgrades(lastSnap),
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
      treasures: p.final_treasures ?? snap?.treasures ?? 0,
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
      upgrades: snap ? getShareUpgrades(snap) : [],
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
