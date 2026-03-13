export function shouldBlockGuidesForBattleResolution(options: {
  activeBattleResolutionId: string | null;
  battleResolutionId: string | null | undefined;
  hasCachedBattle: boolean;
  selfPhase: string | undefined;
  shownResolutionIds: Set<string>;
}): boolean {
  const {
    activeBattleResolutionId,
    battleResolutionId,
    hasCachedBattle,
    selfPhase,
    shownResolutionIds,
  } = options;

  if (!battleResolutionId || !selfPhase || selfPhase === "battle") {
    return false;
  }

  if (activeBattleResolutionId === battleResolutionId) {
    return true;
  }

  return hasCachedBattle && !shownResolutionIds.has(battleResolutionId);
}
