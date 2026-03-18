import type { Card } from "../types";

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
