/** Pure state derivation and hotkey builders for the Lobby route. */
import type { CubeLook } from "../hooks/useCubeLook";
import type { ResumableSeat } from "../hooks/useResumableGames";
import type { LobbyPlayer, LobbyState } from "../types";

export const EVEN_PLAYER_CAP_OPTIONS = [2, 4, 6, 8] as const;

export function cubeCobraUrl(battlerId: string): string {
  return `https://cubecobra.com/cube/overview/${encodeURIComponent(battlerId)}`;
}

function seatAndReadyBlocker(
  players: LobbyPlayer[],
  openSeats: number,
): string {
  const notReady = players.filter((player) => !player.is_ready).length;
  const waitingOn: string[] = [];
  if (openSeats > 0) {
    waitingOn.push(`${openSeats} open ${openSeats === 1 ? "seat" : "seats"}`);
  }
  if (notReady > 0) waitingOn.push(`${notReady} not ready`);
  return waitingOn.join(" · ");
}

function cubeAndPuppetBlocker(lobby: LobbyState): string {
  if (lobby.play_mode === "limited" && lobby.cube_loading_status === "error") {
    return "Couldn't load the cube";
  }
  const { puppet_count: puppets, available_puppet_count: available } = lobby;
  if (puppets <= 0) return "";
  if (available === null) return "Finding puppets";
  return available < puppets ? "Not enough puppets" : "";
}

export function startBlocker(
  lobby: LobbyState,
  openSeats: number,
  needsDeck: boolean,
): string {
  if (needsDeck) return "Submit your deck first";
  return (
    seatAndReadyBlocker(lobby.players, openSeats) || cubeAndPuppetBlocker(lobby)
  );
}

export interface LobbyHostStatus {
  hostName: string | null;
  awayHost: LobbyPlayer | null;
  lostHost: boolean;
  gainedHost: boolean;
  hostPass: string | null;
  hostChange: { name: string; text: string } | null;
}

function resolveHostChangeNotice(options: {
  hostPass: string | null;
  closedHostChange: string | null;
  lostHost: boolean;
  gainedHost: boolean;
  hostName: string | null;
  previousHost: LobbyPlayer | null;
}): { name: string; text: string } | null {
  if (options.hostPass === options.closedHostChange) return null;
  if (options.lostHost && options.hostName) {
    return {
      name: options.hostName,
      text: `You were away, so ${options.hostName} is the host now.`,
    };
  }
  if (
    options.gainedHost &&
    options.previousHost &&
    !options.previousHost.is_connected
  ) {
    return {
      name: options.previousHost.name,
      text: `You're the host now. ${options.previousHost.name} is away.`,
    };
  }
  return null;
}

function findHostPlayers(lobbyState: LobbyState | null): {
  host: LobbyPlayer | null;
  previousHost: LobbyPlayer | null;
} {
  if (!lobbyState) return { host: null, previousHost: null };
  return {
    host: lobbyState.players.find((p) => p.is_host) ?? null,
    previousHost:
      lobbyState.players.find(
        (p) => p.player_id === lobbyState.previous_host_id,
      ) ?? null,
  };
}

export function deriveLobbyHostStatus(options: {
  lobbyState: LobbyState | null;
  sessionPlayerId: string | undefined;
  currentPlayer: LobbyPlayer | undefined;
  closedHostChange: string | null;
}): LobbyHostStatus {
  const { lobbyState, sessionPlayerId, currentPlayer, closedHostChange } =
    options;
  const { host, previousHost } = findHostPlayers(lobbyState);
  const hostName = host?.name ?? null;
  const awayHost = host && !host.is_connected ? host : null;
  const lostHost =
    previousHost !== null && previousHost.player_id === sessionPlayerId;
  const gainedHost = previousHost !== null && Boolean(currentPlayer?.is_host);
  const hostPass =
    previousHost && host ? `${previousHost.player_id}:${host.player_id}` : null;
  const hostChange = resolveHostChangeNotice({
    hostPass,
    closedHostChange,
    lostHost,
    gainedHost,
    hostName,
    previousHost,
  });
  return { hostName, awayHost, lostHost, gainedHost, hostPass, hostChange };
}

export interface PlayerCapStep {
  playerCap: number;
  occupiedSlots: number;
  openSeats: number;
  previousPlayerCap: number | null;
  nextPlayerCap: number | null;
  canDecreasePlayerCap: boolean;
  canIncreasePlayerCap: boolean;
}

export function derivePlayerCapStep(
  lobbyState: LobbyState,
  isHost: boolean,
): PlayerCapStep {
  const playerCap = lobbyState.target_player_count;
  const occupiedSlots = lobbyState.players.length + lobbyState.puppet_count;
  const openSeats = Math.max(0, playerCap - occupiedSlots);
  const playerCapIndex = EVEN_PLAYER_CAP_OPTIONS.findIndex(
    (value) => value === playerCap,
  );
  const previousPlayerCap =
    playerCapIndex > 0 ? EVEN_PLAYER_CAP_OPTIONS[playerCapIndex - 1] : null;
  const nextPlayerCap =
    playerCapIndex >= 0 && playerCapIndex < EVEN_PLAYER_CAP_OPTIONS.length - 1
      ? EVEN_PLAYER_CAP_OPTIONS[playerCapIndex + 1]
      : null;
  const canDecreasePlayerCap =
    isHost && previousPlayerCap !== null && previousPlayerCap >= occupiedSlots;
  const canIncreasePlayerCap = isHost && nextPlayerCap !== null;
  return {
    playerCap,
    occupiedSlots,
    openSeats,
    previousPlayerCap,
    nextPlayerCap,
    canDecreasePlayerCap,
    canIncreasePlayerCap,
  };
}

export function buildLeavingSeat(options: {
  gameId: string;
  lobbyState: LobbyState;
  currentPlayer: LobbyPlayer;
  summaryBattlerId: string | null;
  cubeLook: CubeLook | null;
}): ResumableSeat {
  const { gameId, lobbyState, currentPlayer, summaryBattlerId, cubeLook } =
    options;
  return {
    gameId,
    playerName: currentPlayer.name,
    kind: "lobby",
    lastActiveAt: null,
    joinCode: lobbyState.join_code,
    cubeId: summaryBattlerId ?? lobbyState.cube_id,
    cubeName: cubeLook?.name || null,
    cubeImageUri: cubeLook?.imageUri ?? null,
    playMode: lobbyState.play_mode,
    useUpgrades: lobbyState.use_upgrades,
    playerCount: lobbyState.players.length + lobbyState.puppet_count,
    canClose: true,
    stage: null,
    round: null,
    poison: null,
  };
}

export function buildLobbyHotkeys(options: {
  guideTakesKeys: boolean;
  lobbyState: LobbyState | null;
  currentPlayer: LobbyPlayer | undefined;
  isConstructed: boolean;
  canClickBattler: boolean;
  toggleGuide: () => void;
  toggleReady: () => void;
  onBattlerHotkey: () => void;
  requestStart: () => void;
}): Record<string, () => void> {
  const map: Record<string, () => void> = { "?": options.toggleGuide };
  if (!options.lobbyState || !options.currentPlayer || options.guideTakesKeys) {
    return map;
  }
  const isHost = options.currentPlayer.is_host;
  const canStart = options.lobbyState.can_start;
  map["r"] = options.toggleReady;
  if (options.isConstructed) {
    map["b"] = (): void => {
      if (options.canClickBattler) options.onBattlerHotkey();
    };
  }
  map["Enter"] = (): void => {
    if (isHost && canStart) {
      options.requestStart();
    } else {
      options.toggleReady();
    }
  };
  return map;
}
