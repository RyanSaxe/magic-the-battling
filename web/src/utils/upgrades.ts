import type { Card } from "../types";

export type UpgradeDisplayScope = "all_applied" | "revealed_applied";

export function isAppliedUpgrade(upgrade: Card): boolean {
  return upgrade.upgrade_target !== null;
}

export function isRevealedAppliedUpgrade(upgrade: Card): boolean {
  return isAppliedUpgrade(upgrade) && upgrade.is_revealed !== false;
}

export function getAppliedUpgrades(upgrades: Card[]): Card[] {
  return upgrades.filter(isAppliedUpgrade);
}

export function getRevealedAppliedUpgrades(upgrades: Card[]): Card[] {
  return upgrades.filter(isRevealedAppliedUpgrade);
}

export function getUnrevealedAppliedUpgrades(upgrades: Card[]): Card[] {
  return upgrades.filter((upgrade) => isAppliedUpgrade(upgrade) && upgrade.is_revealed === false);
}

export function getUnappliedUpgrades(upgrades: Card[]): Card[] {
  return upgrades.filter((upgrade) => !isAppliedUpgrade(upgrade));
}

export function getDisplayedAppliedUpgrades(
  upgrades: Card[],
  scope: UpgradeDisplayScope = "revealed_applied",
): Card[] {
  return scope === "all_applied"
    ? getAppliedUpgrades(upgrades)
    : getRevealedAppliedUpgrades(upgrades);
}

export function getUpgradeDisplayScope(isOwner: boolean, phase?: string | null): UpgradeDisplayScope {
  return isOwner && phase !== "battle" ? "all_applied" : "revealed_applied";
}

export function buildAppliedUpgradeMap(
  upgrades: Card[],
  scope: UpgradeDisplayScope = "revealed_applied",
): {
  upgradedCardIds: Set<string>;
  appliedUpgradesByCardId: Map<string, Card[]>;
} {
  const upgradedCardIds = new Set<string>();
  const appliedUpgradesByCardId = new Map<string, Card[]>();

  getDisplayedAppliedUpgrades(upgrades, scope).forEach((upgrade) => {
    const target = upgrade.upgrade_target;
    if (!target) return;

    upgradedCardIds.add(target.id);
    const existing = appliedUpgradesByCardId.get(target.id) ?? [];
    existing.push(upgrade);
    appliedUpgradesByCardId.set(target.id, existing);
  });

  return { upgradedCardIds, appliedUpgradesByCardId };
}

export function buildHiddenAppliedUpgradeMap(
  upgrades: Card[],
): Map<string, Card[]> {
  const hiddenUpgradesByCardId = new Map<string, Card[]>();

  getUnrevealedAppliedUpgrades(upgrades).forEach((upgrade) => {
    const target = upgrade.upgrade_target;
    if (!target) return;

    const existing = hiddenUpgradesByCardId.get(target.id) ?? [];
    existing.push(upgrade);
    hiddenUpgradesByCardId.set(target.id, existing);
  });

  return hiddenUpgradesByCardId;
}
