/**
 * Unified Battle (Fight) layout solver built on fitCards. Computes the 6-row
 * board geometry (opponent hand, opponent lands/nonlands, player nonlands/lands,
 * player hand) while honoring the short-screen rule (cards may shrink under 40px
 * rather than scrolling or hiding the opponent's hand).
 */
import { cardHeight, fitCards } from "./cardFit";
import { CARD_ASPECT_RATIO } from "./types";

const BATTLE_NUM_ROWS = 6;
const HAND_ROW_PADDING = 48; // 32px from .hand-zone CSS + 16px from px-2 container
const HAND_MAX_OVERLAP_RATIO = 0.2;

export const BATTLEFIELD_INSET = 20; // 16px from p-2 + 4px from the .zone border

export interface BattleCardDimensions {
  width: number;
  height: number;
}

export interface BattleZoneConfig {
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

export type ResolvedBattleZoneConfig = Required<BattleZoneConfig>;

export interface BattleZoneDims {
  rowHeight: number;
  playerHandGap: number;
  opponentHandGap: number;
  playerHand: BattleCardDimensions;
  opponentHand: BattleCardDimensions;
  playerLands: BattleCardDimensions;
  playerNonlands: BattleCardDimensions;
  opponentLands: BattleCardDimensions;
  opponentNonlands: BattleCardDimensions;
}

function emptyRowCard(rowH: number, maxWidth: number): BattleCardDimensions {
  const width = Math.min(Math.floor(rowH / CARD_ASPECT_RATIO), maxWidth);
  return { width, height: cardHeight(width) };
}

interface BattleRowFitOptions {
  count: number;
  rowH: number;
  availableWidth: number;
  gap: number;
  maxWidth: number;
}

function fitBattlefieldRow({
  count,
  rowH,
  availableWidth,
  gap,
  maxWidth,
}: BattleRowFitOptions): BattleCardDimensions {
  if (count <= 0) return emptyRowCard(rowH, maxWidth);
  const fit = fitCards({
    count,
    availableWidth,
    availableHeight: rowH,
    gap,
    minCardWidth: 1,
    maxCardWidth: maxWidth,
    fixedRows: 1,
  });
  return { width: fit.width, height: fit.height };
}

function fitBattleHandRow({
  count,
  rowH,
  availableWidth,
  gap,
  maxWidth,
}: BattleRowFitOptions): BattleCardDimensions & { gap: number } {
  if (count <= 0) return { ...emptyRowCard(rowH, maxWidth), gap };
  const fit = fitCards({
    count,
    availableWidth,
    availableHeight: rowH,
    gap,
    minCardWidth: 1,
    maxCardWidth: maxWidth,
    maxOverlapRatio: HAND_MAX_OVERLAP_RATIO,
  });
  return { width: fit.width, height: fit.height, gap: fit.gap };
}

export function resolveBattleConfig(
  config: BattleZoneConfig,
): ResolvedBattleZoneConfig {
  return {
    playerHandCount: config.playerHandCount,
    opponentHandCount: config.opponentHandCount,
    playerLandCount: config.playerLandCount,
    playerNonlandCount: config.playerNonlandCount,
    opponentLandCount: config.opponentLandCount,
    opponentNonlandCount: config.opponentNonlandCount,
    handGap: config.handGap ?? 6,
    battlefieldGap: config.battlefieldGap ?? 6,
    fixedHeight: config.fixedHeight ?? 0,
    handMaxWidth: config.handMaxWidth ?? 400,
    battlefieldMaxWidth: config.battlefieldMaxWidth ?? 300,
    zoneColumnWidth: config.zoneColumnWidth ?? 0,
  };
}

export function makeInitialBattleDims(
  handGap: number,
  handMaxWidth: number,
  battlefieldMaxWidth: number,
): BattleZoneDims {
  const hand: BattleCardDimensions = {
    width: handMaxWidth,
    height: cardHeight(handMaxWidth),
  };
  const battlefield: BattleCardDimensions = {
    width: battlefieldMaxWidth,
    height: cardHeight(battlefieldMaxWidth),
  };
  return {
    rowHeight: 0,
    playerHandGap: handGap,
    opponentHandGap: handGap,
    playerHand: hand,
    opponentHand: hand,
    playerLands: battlefield,
    playerNonlands: battlefield,
    opponentLands: battlefield,
    opponentNonlands: battlefield,
  };
}

export function computeBattleZones(
  containerWidth: number,
  containerHeight: number,
  config: ResolvedBattleZoneConfig,
): BattleZoneDims {
  const availH = containerHeight - config.fixedHeight;
  if (availH <= 0 || containerWidth <= 0) {
    const fallback: BattleCardDimensions = { width: 100, height: 140 };
    return {
      rowHeight: 0,
      playerHandGap: config.handGap,
      opponentHandGap: config.handGap,
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
  const rowH = availH / BATTLE_NUM_ROWS;
  const boardW = containerWidth - config.zoneColumnWidth;
  const handAvailW = boardW - HAND_ROW_PADDING;
  const bfAvailW = boardW - BATTLEFIELD_INSET;

  const handBase = {
    rowH,
    availableWidth: handAvailW,
    gap: config.handGap,
    maxWidth: config.handMaxWidth,
  };
  const bfBase = {
    rowH,
    availableWidth: bfAvailW,
    gap: config.battlefieldGap,
    maxWidth: config.battlefieldMaxWidth,
  };

  const playerHand = fitBattleHandRow({
    ...handBase,
    count: config.playerHandCount,
  });
  const opponentHand = fitBattleHandRow({
    ...handBase,
    count: config.opponentHandCount,
  });

  return {
    rowHeight: rowH,
    playerHandGap: playerHand.gap,
    opponentHandGap: opponentHand.gap,
    playerHand: { width: playerHand.width, height: playerHand.height },
    opponentHand: { width: opponentHand.width, height: opponentHand.height },
    playerLands: fitBattlefieldRow({
      ...bfBase,
      count: config.playerLandCount,
    }),
    playerNonlands: fitBattlefieldRow({
      ...bfBase,
      count: config.playerNonlandCount,
    }),
    opponentLands: fitBattlefieldRow({
      ...bfBase,
      count: config.opponentLandCount,
    }),
    opponentNonlands: fitBattlefieldRow({
      ...bfBase,
      count: config.opponentNonlandCount,
    }),
  };
}

function cardsEqual(a: BattleCardDimensions, b: BattleCardDimensions): boolean {
  return a.width === b.width && a.height === b.height;
}

export function battleDimsEqual(a: BattleZoneDims, b: BattleZoneDims): boolean {
  return (
    a.rowHeight === b.rowHeight &&
    a.playerHandGap === b.playerHandGap &&
    a.opponentHandGap === b.opponentHandGap &&
    cardsEqual(a.playerHand, b.playerHand) &&
    cardsEqual(a.opponentHand, b.opponentHand) &&
    cardsEqual(a.playerLands, b.playerLands) &&
    cardsEqual(a.playerNonlands, b.playerNonlands) &&
    cardsEqual(a.opponentLands, b.opponentLands) &&
    cardsEqual(a.opponentNonlands, b.opponentNonlands)
  );
}
