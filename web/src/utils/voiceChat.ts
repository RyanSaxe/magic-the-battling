import type { GameState } from "../types";

export function getVoicePeerNames(gameState: GameState | null): string[] {
  if (!gameState) return [];

  const { self_player, current_battle, players } = gameState;
  if (self_player.phase === "battle" && current_battle) {
    if (current_battle.can_manipulate_opponent) {
      return [];
    }

    const opponent = players.find(
      (player) => player.name === current_battle.opponent_name,
    );
    return opponent && !opponent.is_puppet ? [opponent.name] : [];
  }

  return players
    .filter((player) => player.name !== self_player.name && !player.is_puppet)
    .map((player) => player.name);
}
