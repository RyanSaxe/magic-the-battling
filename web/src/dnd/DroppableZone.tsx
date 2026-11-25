import { useDroppable } from "@dnd-kit/core";
import type { ReactElement, ReactNode } from "react";
import type { ZoneName } from "../types";
import { useGameDnd } from "./useGameDnd";
import { makeZoneId, parseZoneId, type ZoneOwner } from "./types";

interface DroppableZoneProps {
  zone: ZoneName;
  zoneOwner?: ZoneOwner;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  validFromZones?: ZoneName[];
  disabled?: boolean;
  idPrefix?: string;
}

function getDropStateClass(state: {
  isOver: boolean;
  activeFromZone: ZoneName | null;
  isSameZone: boolean;
  validFromZones?: ZoneName[];
}): string {
  if (!state.isOver || state.activeFromZone === null || state.isSameZone) {
    return "";
  }
  const isValid =
    !state.validFromZones ||
    state.validFromZones.includes(state.activeFromZone);
  return isValid ? "drop-valid" : "drop-invalid";
}

export function DroppableZone({
  zone,
  zoneOwner = "player",
  children,
  className = "",
  style,
  validFromZones,
  disabled = false,
  idPrefix,
}: DroppableZoneProps): ReactElement {
  const { activeFromZone, activeFromZoneId } = useGameDnd();

  const zoneId = makeZoneId(zone, zoneOwner, idPrefix);
  const baseZoneId = makeZoneId(zone, zoneOwner);
  const { setNodeRef, isOver } = useDroppable({
    id: zoneId,
    disabled,
  });

  const activeBaseZoneId = activeFromZoneId
    ? makeZoneId(
        parseZoneId(activeFromZoneId).zone,
        parseZoneId(activeFromZoneId).owner,
      )
    : null;
  const dropStateClass = getDropStateClass({
    isOver,
    activeFromZone,
    isSameZone: activeBaseZoneId === baseZoneId,
    validFromZones,
  });

  return (
    <div
      ref={setNodeRef}
      className={`zone ${dropStateClass} ${className}`}
      style={style}
      data-zone={zone}
      data-zone-owner={zoneOwner}
    >
      {children}
    </div>
  );
}
