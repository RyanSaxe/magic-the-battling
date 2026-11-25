import { useLocation } from "react-router-dom";
import type { PlayMode } from "../../types";

export type LoadingStep =
  | "Load cube"
  | "Load deck"
  | "Deal cards"
  | "Open board"
  | "Open lobby";

/** Handed on when a loading screen moves to the next page, so that page keeps the same steps. */
export interface LoadingRouteState {
  loadingSteps?: LoadingStep[];
}

/** Constructed loads each player's deck where limited loads one cube. */
export function loadStep(playMode: PlayMode): LoadingStep {
  return playMode === "constructed" ? "Load deck" : "Load cube";
}

export function goldfishSteps(playMode: PlayMode): LoadingStep[] {
  return [loadStep(playMode), "Deal cards", "Open board"];
}

export function newLobbySteps(playMode: PlayMode): LoadingStep[] {
  return [loadStep(playMode), "Open lobby"];
}

export const START_STEPS: LoadingStep[] = ["Deal cards", "Open board"];

const VALID_LOADING_STEPS: ReadonlySet<string> = new Set<LoadingStep>([
  "Load cube",
  "Load deck",
  "Deal cards",
  "Open board",
  "Open lobby",
]);

function isLoadingStep(value: unknown): value is LoadingStep {
  return typeof value === "string" && VALID_LOADING_STEPS.has(value);
}

function readLoadingSteps(state: unknown): LoadingStep[] | null {
  if (
    typeof state !== "object" ||
    state === null ||
    !("loadingSteps" in state)
  ) {
    return null;
  }
  const { loadingSteps } = state;
  if (!Array.isArray(loadingSteps)) return null;
  return loadingSteps.every(isLoadingStep) ? loadingSteps : null;
}

/** The steps the page before handed on, or `otherwise` on a page opened by a link or a reload. */
export function useHandedOnSteps(otherwise: LoadingStep[]): LoadingStep[] {
  const locationState: unknown = useLocation().state;
  return readLoadingSteps(locationState) ?? otherwise;
}
