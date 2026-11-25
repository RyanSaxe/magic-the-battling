import type { ZoneOwner } from "../dnd/types";
import type { ZoneName } from "../types";

interface BattleInteractionOptions {
  owner: ZoneOwner;
  zone: ZoneName;
  canManipulateOpponent: boolean;
}

interface BattleCardInteractionOptions extends BattleInteractionOptions {
  isFaceDown: boolean;
}

export function canInteractWithBattleZone({
  owner,
  zone,
  canManipulateOpponent,
}: BattleInteractionOptions): boolean {
  if (owner === "player") return true;
  if (zone === "hand") return canManipulateOpponent;
  return true;
}

export function canInteractWithBattleCard({
  owner,
  zone,
  canManipulateOpponent,
  isFaceDown,
}: BattleCardInteractionOptions): boolean {
  if (owner === "player") return true;
  if (canManipulateOpponent) return true;
  if (zone === "hand" || zone === "library") return false;
  return !isFaceDown;
}

export function canUseBattleFaceDownAction(
  owner: ZoneOwner,
  canManipulateOpponent: boolean,
): boolean {
  return owner === "player" || canManipulateOpponent;
}

export function canUseBattleFlipAction(
  owner: ZoneOwner,
  isFaceDown: boolean,
  canManipulateOpponent: boolean,
): boolean {
  if (owner === "player" || canManipulateOpponent) return true;
  return !isFaceDown;
}

interface BattleResultConflictOptions {
  mySubmission: string | undefined;
  opponentSubmission: string | undefined;
  isResolved: boolean;
}

// The end-of-battle overlay shows the battle as last seen, whose submissions can predate the change that settled them.
export function hasBattleResultConflict({
  mySubmission,
  opponentSubmission,
  isResolved,
}: BattleResultConflictOptions): boolean {
  if (isResolved) return false;
  return (
    !!mySubmission &&
    !!opponentSubmission &&
    mySubmission !== opponentSubmission
  );
}
