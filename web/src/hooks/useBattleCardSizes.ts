import { useState, useCallback, useRef, useLayoutEffect } from "react";
import type { CardDimensions } from "./useViewportCardSizes";

const CARD_ASPECT_RATIO = 7 / 5;
const NUM_ROWS = 6;
export const BATTLEFIELD_INSET = 20; // 16px from p-2 + 4px from the .zone border

interface BattleZoneConfig {
  playerHandCount: number;
  opponentHandCount: number;
  playerLandCount: number;
  playerNonlandCount: number;
  opponentLandCount: number;
  opponentNonlandCount: number;
  handGap?: number;
  battlefieldGap?: number;
  fixedHeight?: number;
  handMaxWidth?: number;
  battlefieldMaxWidth?: number;
  zoneColumnWidth?: number;
}

interface BattleZoneDims {
  rowHeight: number;
  playerHandGap: number;
  opponentHandGap: number;
  playerHand: CardDimensions;
  opponentHand: CardDimensions;
  playerLands: CardDimensions;
  playerNonlands: CardDimensions;
  opponentLands: CardDimensions;
  opponentNonlands: CardDimensions;
}

interface ZoneCardsInput {
  count: number;
  rowH: number;
  containerW: number;
  gap: number;
  maxWidth: number;
  padding: number;
}

function computeZoneCards({
  count,
  rowH,
  containerW,
  gap,
  maxWidth,
  padding,
}: ZoneCardsInput): CardDimensions {
  const baseCardW = Math.floor(rowH / CARD_ASPECT_RATIO);

  if (count === 0) {
    const w = Math.min(baseCardW, maxWidth);
    return { width: w, height: Math.round(w * CARD_ASPECT_RATIO) };
  }

  const horizontalCap = Math.floor(
    (containerW - padding - (count - 1) * gap) / count,
  );
  const cardW = Math.max(1, Math.min(baseCardW, horizontalCap, maxWidth));
  return { width: cardW, height: Math.round(cardW * CARD_ASPECT_RATIO) };
}

function computeHandCards({
  count,
  rowH,
  containerW,
  gap: defaultGap,
  maxWidth,
  padding,
}: ZoneCardsInput): CardDimensions & { gap: number } {
  const baseCardW = Math.floor(rowH / CARD_ASPECT_RATIO);
  const idealW = Math.min(baseCardW, maxWidth);

  if (count <= 1) {
    return {
      width: idealW,
      height: Math.round(idealW * CARD_ASPECT_RATIO),
      gap: defaultGap,
    };
  }

  const spaceNeeded = count * idealW + (count - 1) * defaultGap + padding;
  if (spaceNeeded <= containerW) {
    return {
      width: idealW,
      height: Math.round(idealW * CARD_ASPECT_RATIO),
      gap: defaultGap,
    };
  }

  const neededGap = Math.floor(
    (containerW - padding - count * idealW) / (count - 1),
  );
  const minGap = -Math.floor(idealW * 0.2);

  if (neededGap >= minGap) {
    return {
      width: idealW,
      height: Math.round(idealW * CARD_ASPECT_RATIO),
      gap: neededGap,
    };
  }

  const cardW = Math.max(
    1,
    Math.floor((containerW - padding - (count - 1) * minGap) / count),
  );
  return {
    width: cardW,
    height: Math.round(cardW * CARD_ASPECT_RATIO),
    gap: minGap,
  };
}

export function computeBattleZones(
  containerWidth: number,
  containerHeight: number,
  config: Required<
    Pick<
      BattleZoneConfig,
      | "playerHandCount"
      | "opponentHandCount"
      | "playerLandCount"
      | "playerNonlandCount"
      | "opponentLandCount"
      | "opponentNonlandCount"
      | "handGap"
      | "battlefieldGap"
      | "fixedHeight"
      | "handMaxWidth"
      | "battlefieldMaxWidth"
      | "zoneColumnWidth"
    >
  >,
): BattleZoneDims {
  const {
    playerHandCount,
    opponentHandCount,
    playerLandCount,
    playerNonlandCount,
    opponentLandCount,
    opponentNonlandCount,
    handGap,
    battlefieldGap,
    fixedHeight,
    handMaxWidth,
    battlefieldMaxWidth,
    zoneColumnWidth,
  } = config;

  const availH = containerHeight - fixedHeight;
  if (availH <= 0 || containerWidth <= 0) {
    const fallback: CardDimensions = { width: 100, height: 140 };
    return {
      rowHeight: 0,
      playerHandGap: handGap,
      opponentHandGap: handGap,
      playerHand: fallback,
      opponentHand: fallback,
      playerLands: fallback,
      playerNonlands: fallback,
      opponentLands: fallback,
      opponentNonlands: fallback,
    };
  }

  // Keep fractional row height so zone rows consume the full available height
  // and avoid leaving a visible remainder strip at the bottom.
  const rowH = availH / NUM_ROWS;
  const handPadding = 48; // 32px from .hand-zone CSS + 16px from px-2 container
  const bfWidth = containerWidth - zoneColumnWidth;
  const handWidth = containerWidth - zoneColumnWidth;

  const playerHandResult = computeHandCards({
    count: playerHandCount,
    rowH,
    containerW: handWidth,
    gap: handGap,
    maxWidth: handMaxWidth,
    padding: handPadding,
  });
  const opponentHandResult = computeHandCards({
    count: opponentHandCount,
    rowH,
    containerW: handWidth,
    gap: handGap,
    maxWidth: handMaxWidth,
    padding: handPadding,
  });

  const bfBase = {
    rowH,
    containerW: bfWidth,
    gap: battlefieldGap,
    maxWidth: battlefieldMaxWidth,
    padding: BATTLEFIELD_INSET,
  };

  return {
    rowHeight: rowH,
    playerHandGap: playerHandResult.gap,
    opponentHandGap: opponentHandResult.gap,
    playerHand: {
      width: playerHandResult.width,
      height: playerHandResult.height,
    },
    opponentHand: {
      width: opponentHandResult.width,
      height: opponentHandResult.height,
    },
    playerLands: computeZoneCards({ ...bfBase, count: playerLandCount }),
    playerNonlands: computeZoneCards({ ...bfBase, count: playerNonlandCount }),
    opponentLands: computeZoneCards({ ...bfBase, count: opponentLandCount }),
    opponentNonlands: computeZoneCards({
      ...bfBase,
      count: opponentNonlandCount,
    }),
  };
}

function cardDimsEqual(a: CardDimensions, b: CardDimensions): boolean {
  return a.width === b.width && a.height === b.height;
}

function dimsEqual(a: BattleZoneDims, b: BattleZoneDims): boolean {
  return (
    a.rowHeight === b.rowHeight &&
    a.playerHandGap === b.playerHandGap &&
    a.opponentHandGap === b.opponentHandGap &&
    cardDimsEqual(a.playerHand, b.playerHand) &&
    cardDimsEqual(a.opponentHand, b.opponentHand) &&
    cardDimsEqual(a.playerLands, b.playerLands) &&
    cardDimsEqual(a.playerNonlands, b.playerNonlands) &&
    cardDimsEqual(a.opponentLands, b.opponentLands) &&
    cardDimsEqual(a.opponentNonlands, b.opponentNonlands)
  );
}

export function useBattleCardSizes(
  config: BattleZoneConfig,
): [React.RefCallback<HTMLElement>, BattleZoneDims] {
  const {
    playerHandCount,
    opponentHandCount,
    playerLandCount,
    playerNonlandCount,
    opponentLandCount,
    opponentNonlandCount,
    handGap = 6,
    battlefieldGap = 6,
    fixedHeight = 0,
    handMaxWidth = 400,
    battlefieldMaxWidth = 300,
    zoneColumnWidth = 0,
  } = config;

  const [dims, setDims] = useState<BattleZoneDims>(() => ({
    rowHeight: 0,
    playerHandGap: handGap,
    opponentHandGap: handGap,
    playerHand: {
      width: handMaxWidth,
      height: Math.round(handMaxWidth * CARD_ASPECT_RATIO),
    },
    opponentHand: {
      width: handMaxWidth,
      height: Math.round(handMaxWidth * CARD_ASPECT_RATIO),
    },
    playerLands: {
      width: battlefieldMaxWidth,
      height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO),
    },
    playerNonlands: {
      width: battlefieldMaxWidth,
      height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO),
    },
    opponentLands: {
      width: battlefieldMaxWidth,
      height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO),
    },
    opponentNonlands: {
      width: battlefieldMaxWidth,
      height: Math.round(battlefieldMaxWidth * CARD_ASPECT_RATIO),
    },
  }));

  const observerRef = useRef<ResizeObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  const compute = useCallback(
    (containerWidth: number, containerHeight: number) =>
      computeBattleZones(containerWidth, containerHeight, {
        playerHandCount,
        opponentHandCount,
        playerLandCount,
        playerNonlandCount,
        opponentLandCount,
        opponentNonlandCount,
        handGap,
        battlefieldGap,
        fixedHeight,
        handMaxWidth,
        battlefieldMaxWidth,
        zoneColumnWidth,
      }),
    [
      playerHandCount,
      opponentHandCount,
      playerLandCount,
      playerNonlandCount,
      opponentLandCount,
      opponentNonlandCount,
      handGap,
      battlefieldGap,
      fixedHeight,
      handMaxWidth,
      battlefieldMaxWidth,
      zoneColumnWidth,
    ],
  );

  const refCallback = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }

      elementRef.current = node;

      if (!node) return;

      const cs = getComputedStyle(node);
      const w =
        node.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const h =
        node.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      const next = compute(w, h);
      setDims((prev) => (dimsEqual(prev, next) ? prev : next));

      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        const resized = compute(width, height);
        setDims((prev) => (dimsEqual(prev, resized) ? prev : resized));
      });

      observer.observe(node);
      observerRef.current = observer;
    },
    [compute],
  );

  useLayoutEffect(() => {
    if (elementRef.current) {
      const cs = getComputedStyle(elementRef.current);
      const w =
        elementRef.current.clientWidth -
        parseFloat(cs.paddingLeft) -
        parseFloat(cs.paddingRight);
      const h =
        elementRef.current.clientHeight -
        parseFloat(cs.paddingTop) -
        parseFloat(cs.paddingBottom);
      const next = compute(w, h);
      setDims((prev) => (dimsEqual(prev, next) ? prev : next));
    }
  }, [compute]);

  return [refCallback, dims];
}
