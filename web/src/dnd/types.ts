import type { Card, ZoneName } from "../types";

export type ZoneOwner = "player" | "opponent";

export function makeZoneId(
  zone: ZoneName,
  owner: ZoneOwner = "player",
  prefix?: string,
): string {
  const base = `${owner}-${zone}`;
  return prefix ? `${prefix}:${base}` : base;
}

export function makeDraggableId({
  zone,
  owner,
  cardId,
  instanceKey,
}: {
  zone: ZoneName;
  owner: ZoneOwner;
  cardId: string;
  instanceKey?: string;
}): string {
  const base = `${makeZoneId(zone, owner)}-${cardId}`;
  return instanceKey ? `${instanceKey}:${base}` : base;
}

const ZONE_NAMES = new Map<string, ZoneName>([
  ["battlefield", "battlefield"],
  ["graveyard", "graveyard"],
  ["exile", "exile"],
  ["hand", "hand"],
  ["sideboard", "sideboard"],
  ["upgrades", "upgrades"],
  ["command_zone", "command_zone"],
  ["library", "library"],
]);

export function parseZoneId(zoneId: string): {
  zone: ZoneName;
  owner: ZoneOwner;
} {
  const raw = zoneId.includes(":") ? zoneId.split(":")[1] : zoneId;
  const [ownerPart, ...zoneParts] = raw.split("-");
  const owner: ZoneOwner = ownerPart === "opponent" ? "opponent" : "player";
  const zone: ZoneName = ZONE_NAMES.get(zoneParts.join("-")) ?? "hand";
  return { owner, zone };
}

export interface DragData {
  card: Card;
  fromZone: ZoneName;
  fromZoneId: string;
  isOpponent?: boolean;
  faceDown?: boolean;
}

export interface DropData {
  zone: ZoneName;
}
