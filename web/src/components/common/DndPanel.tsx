import { useState, useCallback, useRef, type ReactElement } from "react";
import {
  bestFit,
  MIN_CARD_WIDTH,
  type ZoneDims,
} from "../../hooks/cardSizeUtils";
import { DroppableZone } from "../../dnd";
import { useGameDnd } from "../../dnd/useGameDnd";
import { useGameShellMode } from "../../hooks/useGameShellMode";
import type { ZoneName } from "../../types";
import { makeZoneId, type ZoneOwner } from "../../dnd/types";
import {
  PANEL_GAP,
  PANEL_MAX_WIDTH,
  resolveBattlePanelLayout,
} from "./DndPanelLayout";
import { SidePanel } from "./SidePanel";

interface DndPanelProps {
  open: boolean;
  title: string;
  count: number;
  onClose: () => void;
  children: (dims: { width: number; height: number }) => React.ReactNode;
  zone?: ZoneName;
  zoneOwner?: ZoneOwner;
  validFromZones?: ZoneName[];
  /** A Fight's panels lay their cards out in a scrolling grid. */
  tone?: "default" | "battle";
  headerActions?: React.ReactNode;
  /** A click on the panel that misses its cards and buttons, which moves a selected card into this zone. */
  onEmptyClick?: () => void;
}

const DEFAULT_DIMS: ZoneDims = { width: 80, height: 112, rows: 1, columns: 1 };

function contentBoxSize(node: HTMLElement): { width: number; height: number } {
  const cs = getComputedStyle(node);
  return {
    width:
      node.clientWidth -
      parseFloat(cs.paddingLeft) -
      parseFloat(cs.paddingRight),
    height:
      node.clientHeight -
      parseFloat(cs.paddingTop) -
      parseFloat(cs.paddingBottom),
  };
}

interface DndPanelContentProps {
  zone?: ZoneName;
  zoneOwner?: ZoneOwner;
  validFromZones?: ZoneName[];
  steppedAside: boolean;
  isBattleTone: boolean;
  count: number;
  title: string;
  battleGridStyle: React.CSSProperties;
  panelChildren: React.ReactNode;
}

function DndPanelContent({
  zone,
  zoneOwner,
  validFromZones,
  steppedAside,
  isBattleTone,
  count,
  title,
  battleGridStyle,
  panelChildren,
}: DndPanelContentProps): ReactElement {
  if (zone) {
    let zoneBody: React.ReactNode = panelChildren;
    if (count === 0) {
      zoneBody = (
        <p className="h-full flex items-center justify-center text-sm text-[var(--ivory-muted)]">
          {title} is empty
        </p>
      );
    } else if (isBattleTone) {
      zoneBody = (
        <div
          className="grid gap-1.5 justify-center content-start min-h-full"
          style={battleGridStyle}
        >
          {panelChildren}
        </div>
      );
    }
    return (
      <DroppableZone
        zone={zone}
        zoneOwner={zoneOwner}
        validFromZones={validFromZones}
        idPrefix="panel"
        disabled={steppedAside}
        // The zone's border sits in the padding, so the cards get all the room they were sized for.
        className={`w-full h-full shrink-0 box-content ${isBattleTone ? "overflow-auto" : "flex flex-wrap gap-1.5 justify-center content-center"}`}
      >
        {zoneBody}
      </DroppableZone>
    );
  }

  if (isBattleTone) {
    return (
      <div
        className="grid gap-1.5 justify-center content-start w-full h-full overflow-auto"
        style={battleGridStyle}
      >
        {panelChildren}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 justify-center content-center">
      {panelChildren}
    </div>
  );
}

/** A zone's cards in a side panel, sized to fit it, and a drop target for that zone. */
export function DndPanel({
  open,
  title,
  count,
  onClose,
  children,
  zone,
  zoneOwner,
  validFromZones,
  tone = "default",
  headerActions,
  onEmptyClick,
}: DndPanelProps): ReactElement {
  const [dims, setDims] = useState<ZoneDims>(DEFAULT_DIMS);
  const observerRef = useRef<ResizeObserver | null>(null);
  const isBattleTone = tone === "battle";
  const { activeFromZoneId } = useGameDnd();
  // On a phone the panel covers the whole board, so it steps aside while a card is dragged out of it.
  const steppedAside =
    useGameShellMode() === "mobile" &&
    !!zone &&
    activeFromZoneId === makeZoneId(zone, zoneOwner);

  const bodyRef = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      if (!node) return;

      const measure = (w: number, h: number): void => {
        const next = isBattleTone
          ? resolveBattlePanelLayout(count, w, h)
          : bestFit({
              count,
              availWidth: w,
              availHeight: h,
              gap: PANEL_GAP,
              maxWidth: PANEL_MAX_WIDTH,
              minWidth: MIN_CARD_WIDTH,
            });
        setDims((prev) =>
          prev.width === next.width &&
          prev.height === next.height &&
          prev.rows === next.rows &&
          prev.columns === next.columns
            ? prev
            : next,
        );
      };

      const initial = contentBoxSize(node);
      measure(initial.width, initial.height);

      const observer = new ResizeObserver(() => {
        const next = contentBoxSize(node);
        measure(next.width, next.height);
      });

      observer.observe(node);
      observerRef.current = observer;
    },
    [count, isBattleTone],
  );

  const panelChildren = children({ width: dims.width, height: dims.height });
  const battleGridStyle = {
    gridTemplateColumns: `repeat(${Math.max(1, dims.columns)}, ${dims.width}px)`,
    gridAutoRows: `${dims.height}px`,
  };

  return (
    <SidePanel
      open={open}
      title={title}
      count={count}
      onClose={onClose}
      headerActions={headerActions}
      steppedAside={steppedAside}
    >
      <div
        role="presentation"
        ref={bodyRef}
        className="flex-1 min-h-0 p-2 flex items-center justify-center"
        onClick={
          onEmptyClick &&
          ((event): void => {
            if (
              event.target instanceof Element &&
              !event.target.closest(".card, button")
            ) {
              onEmptyClick();
            }
          })
        }
      >
        <DndPanelContent
          zone={zone}
          zoneOwner={zoneOwner}
          validFromZones={validFromZones}
          steppedAside={steppedAside}
          isBattleTone={isBattleTone}
          count={count}
          title={title}
          battleGridStyle={battleGridStyle}
          panelChildren={panelChildren}
        />
      </div>
    </SidePanel>
  );
}
