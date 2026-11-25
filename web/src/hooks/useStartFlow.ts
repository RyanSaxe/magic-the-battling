/**
 * Explicit start-flow state machine and hook for `Play.tsx`.
 *
 * Replaces `useSoloLobbyWatcher`, `soloStartEnded`, and effect-time transition bounces
 * with a discriminated `StartFlowState` union (`idle | creating | waiting_for_start | failed`).
 */
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useNavigate } from "react-router-dom";
import { createGame, warmCubeCache } from "../api/client";
import {
  goldfishSteps,
  newLobbySteps,
  type LoadingRouteState,
} from "../components/common/loadingSteps";
import type { LobbyState, PlayMode } from "../types";
import {
  getAppErrorMessage,
  unknownToAppError,
  type AppError,
} from "../utils/appError";
import {
  getRememberedGuestName,
  getRememberedSeat,
  rememberGuestName,
  rememberPlayerForGame,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";
import { abandonSeat } from "../utils/endSeat";
import { getLegendaryName } from "../utils/prefetchName";
import { saveTabSession } from "../utils/tabSession";
import { useGame } from "./useGame";

export type OpponentCount = 1 | 3 | 5 | 7;
export type StartFlowMode = "solo" | "friends";
export type WaitingStep = "loading_cube" | "readying" | "starting";

export type StartFlowState =
  | { kind: "idle" }
  | {
      kind: "creating";
      mode: StartFlowMode;
      playMode: PlayMode;
      attempt: number;
      opponents: OpponentCount;
    }
  | {
      kind: "waiting_for_start";
      mode: StartFlowMode;
      playMode: PlayMode;
      gameId: string;
      sessionId: string;
      opponents: OpponentCount;
      step: WaitingStep;
    }
  | {
      kind: "failed";
      reason: "not_enough_puppets" | "error";
      mode: StartFlowMode;
      message: string;
      gameId: string | null;
      availablePuppets: number | null;
    };

export type StartFlowEvent =
  | {
      type: "begin_create";
      mode: StartFlowMode;
      playMode: PlayMode;
      attempt: number;
      opponents: OpponentCount;
    }
  | {
      type: "created";
      attempt: number;
      gameId: string;
      sessionId: string;
    }
  | { type: "create_failed"; attempt: number; message: string }
  | { type: "lobby_updated"; lobby: LobbyState }
  | { type: "game_started"; gameId: string }
  | { type: "connection_failed"; error: AppError }
  | { type: "server_error"; error: AppError }
  | { type: "cancel" };

export type StartFlowEffect =
  | { type: "set_ready"; ready: boolean }
  | { type: "start_game" }
  | { type: "abandon"; gameId: string }
  | { type: "toast"; message: string }
  | { type: "navigate"; path: string; routeState: LoadingRouteState };

export interface StartFlowTransition {
  state: StartFlowState;
  effects: readonly StartFlowEffect[];
}

export const IDLE_START_FLOW: StartFlowState = { kind: "idle" };

export function transitionStartFlow(
  state: StartFlowState,
  event: StartFlowEvent,
): StartFlowTransition {
  switch (event.type) {
    case "begin_create": {
      const effects: StartFlowEffect[] = [];
      if (state.kind === "failed" && state.gameId) {
        effects.push({ type: "abandon", gameId: state.gameId });
      } else if (state.kind === "waiting_for_start") {
        effects.push({ type: "abandon", gameId: state.gameId });
      }
      return {
        state: {
          kind: "creating",
          mode: event.mode,
          playMode: event.playMode,
          attempt: event.attempt,
          opponents: event.opponents,
        },
        effects,
      };
    }

    case "created": {
      if (state.kind !== "creating" || state.attempt !== event.attempt) {
        return { state, effects: [] };
      }
      return {
        state: {
          kind: "waiting_for_start",
          mode: state.mode,
          playMode: state.playMode,
          gameId: event.gameId,
          sessionId: event.sessionId,
          opponents: state.opponents,
          step: "loading_cube",
        },
        effects: [],
      };
    }

    case "create_failed": {
      if (state.kind !== "creating" || state.attempt !== event.attempt) {
        return { state, effects: [] };
      }
      return {
        state: IDLE_START_FLOW,
        effects: [{ type: "toast", message: event.message }],
      };
    }

    case "lobby_updated": {
      if (
        state.kind !== "waiting_for_start" ||
        event.lobby.game_id !== state.gameId
      ) {
        return { state, effects: [] };
      }

      if (event.lobby.cube_loading_status === "error") {
        const message =
          event.lobby.cube_loading_error ?? "Failed to load the cube.";
        return {
          state: IDLE_START_FLOW,
          effects: [
            { type: "toast", message },
            { type: "abandon", gameId: state.gameId },
          ],
        };
      }

      if (
        state.mode === "friends" &&
        event.lobby.cube_loading_status === "ready"
      ) {
        return {
          state: IDLE_START_FLOW,
          effects: [
            {
              type: "navigate",
              path: `/game/${state.gameId}/lobby`,
              routeState: { loadingSteps: newLobbySteps(state.playMode) },
            },
          ],
        };
      }

      if (state.mode === "solo") {
        if (
          state.step === "loading_cube" &&
          event.lobby.cube_loading_status === "ready"
        ) {
          const available = event.lobby.available_puppet_count ?? 0;
          if (available >= event.lobby.puppet_count) {
            return {
              state: { ...state, step: "readying" },
              effects: [{ type: "set_ready", ready: true }],
            };
          }
          return {
            state: {
              kind: "failed",
              reason: "not_enough_puppets",
              mode: "solo",
              message: "Not enough puppet data",
              gameId: state.gameId,
              availablePuppets: available,
            },
            effects: [],
          };
        }

        if (state.step === "readying" && event.lobby.can_start) {
          return {
            state: { ...state, step: "starting" },
            effects: [{ type: "start_game" }],
          };
        }
      }

      return { state, effects: [] };
    }

    case "game_started": {
      if (state.kind !== "waiting_for_start" || state.gameId !== event.gameId) {
        return { state, effects: [] };
      }
      return {
        state: IDLE_START_FLOW,
        effects: [
          {
            type: "navigate",
            path: `/game/${state.gameId}/play`,
            routeState: { loadingSteps: goldfishSteps(state.playMode) },
          },
        ],
      };
    }

    case "connection_failed": {
      if (state.kind !== "waiting_for_start") return { state, effects: [] };
      const message = getAppErrorMessage(
        event.error,
        "play-connection",
        "That game is no longer available. Please start a new one.",
      );
      const effects: StartFlowEffect[] = [{ type: "toast", message }];
      // A seat that moved is still the player's, in the tab or on the device that took it.
      if (event.error.code !== "SEAT_MOVED") {
        effects.push({ type: "abandon", gameId: state.gameId });
      }
      return { state: IDLE_START_FLOW, effects };
    }

    case "server_error": {
      const message = getAppErrorMessage(
        event.error,
        "play-connection",
        "Something went wrong.",
      );
      if (state.kind === "waiting_for_start" && state.step === "starting") {
        return {
          state: IDLE_START_FLOW,
          effects: [
            { type: "toast", message },
            { type: "abandon", gameId: state.gameId },
          ],
        };
      }
      return { state, effects: [{ type: "toast", message }] };
    }

    case "cancel": {
      if (state.kind === "idle") return { state, effects: [] };
      const gameId =
        state.kind === "waiting_for_start"
          ? state.gameId
          : state.kind === "failed"
            ? state.gameId
            : null;
      return {
        state: IDLE_START_FLOW,
        effects: gameId ? [{ type: "abandon", gameId }] : [],
      };
    }
  }
}

function abandonStart(gameId: string): void {
  const seat = getRememberedSeat(gameId);
  if (seat?.seatToken) void abandonSeat(gameId, seat.name, seat.seatToken);
}

interface StartGameParams {
  mode: StartFlowMode;
  playerName: string;
  cubeId: string;
  playMode: PlayMode;
  useUpgrades: boolean;
  opponents: OpponentCount;
  autoApproveSpectators: boolean;
  isGuidedMode: boolean;
  isAuthenticated: boolean;
}

export function useStartFlow(
  addToast: (message: string, type?: "error" | "info" | "warning") => void,
) {
  const navigate = useNavigate();
  const [state, setState] = useState<StartFlowState>(IDLE_START_FLOW);
  const attemptRef = useRef(0);
  const unfinishedGameIdRef = useRef<string | null>(null);

  const pendingGameId =
    state.kind === "waiting_for_start" ? state.gameId : null;
  const pendingSessionId =
    state.kind === "waiting_for_start" ? state.sessionId : null;

  const [incomingServerError, setIncomingServerError] = useState<{
    error: AppError;
    nonce: number;
  } | null>(null);
  const errorNonceRef = useRef(0);

  const handleServerError = useCallback((error: AppError) => {
    errorNonceRef.current += 1;
    setIncomingServerError({ error, nonce: errorNonceRef.current });
  }, []);

  const { lobbyState, gameState, actions, connectionError } = useGame(
    pendingGameId,
    pendingSessionId,
    null,
    handleServerError,
  );

  const executeEffects = useCallback(
    (effects: readonly StartFlowEffect[]) => {
      for (const effect of effects) {
        switch (effect.type) {
          case "set_ready":
            actions.setReady(effect.ready);
            break;
          case "start_game":
            actions.startGame();
            break;
          case "abandon":
            unfinishedGameIdRef.current = null;
            abandonStart(effect.gameId);
            break;
          case "toast":
            addToast(effect.message, "error");
            break;
          case "navigate":
            unfinishedGameIdRef.current = null;
            navigate(effect.path, { state: effect.routeState });
            break;
        }
      }
    },
    [actions, addToast, navigate],
  );

  useEffect(() => {
    unfinishedGameIdRef.current =
      state.kind === "waiting_for_start"
        ? state.gameId
        : state.kind === "failed"
          ? state.gameId
          : null;
  }, [state]);

  // Leaving Play gives up an unfinished start as Cancel does. A reload or closed tab never unmounts it.
  useEffect(
    () => () => {
      attemptRef.current += 1;
      if (unfinishedGameIdRef.current) {
        abandonStart(unfinishedGameIdRef.current);
      }
    },
    [],
  );

  const applyServerTransition = useEffectEvent((event: StartFlowEvent) => {
    const result = transitionStartFlow(state, event);
    if (result.state !== state) {
      setState(result.state);
    }
    executeEffects(result.effects);
  });

  useEffect(() => {
    if (!lobbyState) return;
    applyServerTransition({ type: "lobby_updated", lobby: lobbyState });
  }, [lobbyState]);

  useEffect(() => {
    if (!gameState?.game_id) return;
    applyServerTransition({ type: "game_started", gameId: gameState.game_id });
  }, [gameState?.game_id]);

  useEffect(() => {
    if (!connectionError) return;
    applyServerTransition({
      type: "connection_failed",
      error: connectionError,
    });
  }, [connectionError]);

  useEffect(() => {
    if (!incomingServerError) return;
    applyServerTransition({
      type: "server_error",
      error: incomingServerError.error,
    });
  }, [incomingServerError]);

  const start = useCallback(
    async (params: StartGameParams) => {
      const name = params.playerName.trim();
      if (!name) {
        addToast("Please enter your name", "error");
        return;
      }
      const submittedCubeId = params.cubeId.trim();
      if (params.playMode === "constructed" && !submittedCubeId) {
        addToast("Please enter a CubeCobra ID", "error");
        return;
      }

      const attempt = ++attemptRef.current;
      const begin = transitionStartFlow(state, {
        type: "begin_create",
        mode: params.mode,
        playMode: params.playMode,
        attempt,
        opponents: params.opponents,
      });
      setState(begin.state);
      executeEffects(begin.effects);

      const requestOptions =
        params.mode === "solo"
          ? {
              cubeId: submittedCubeId || "auto",
              useUpgrades: params.useUpgrades,
              targetPlayerCount: params.opponents + 1,
              puppetCount: params.opponents,
              guidedModeDefault: params.isGuidedMode,
              playMode: params.playMode,
            }
          : {
              cubeId: submittedCubeId || "auto",
              useUpgrades: params.useUpgrades,
              autoApproveSpectators: params.autoApproveSpectators,
              guidedModeDefault: params.isGuidedMode,
              playMode: params.playMode,
            };

      createGame(name, requestOptions).then(
        (response) => {
          if (attempt !== attemptRef.current) {
            void abandonSeat(response.game_id, name, response.seat_token);
            return;
          }
          saveTabSession(response.game_id, {
            sessionId: response.session_id,
            playerId: response.player_id,
          });
          if (!params.isAuthenticated) rememberGuestName(name);
          rememberPlayerForGame(response.game_id, name, {
            seatToken: response.seat_token,
            joinCode: response.join_code,
          });
          setNewPlayerPreferenceForGame(
            response.game_id,
            params.isGuidedMode,
            response.player_id,
          );
          setState(
            (current) =>
              transitionStartFlow(current, {
                type: "created",
                attempt,
                gameId: response.game_id,
                sessionId: response.session_id,
              }).state,
          );
        },
        (error: unknown) => {
          if (attempt !== attemptRef.current) return;
          const message = unknownToAppError(
            error,
            "create-game",
            "Failed to create game",
          ).message;
          setState(
            (current) =>
              transitionStartFlow(current, {
                type: "create_failed",
                attempt,
                message,
              }).state,
          );
          addToast(message, "error");
        },
      );
    },
    [addToast, executeEffects, state],
  );

  const cancel = useCallback(() => {
    attemptRef.current += 1;
    const result = transitionStartFlow(state, { type: "cancel" });
    setState(result.state);
    executeEffects(result.effects);
  }, [executeEffects, state]);

  return { state, start, cancel };
}

export function useGuestName(): [string, (v: string) => void, boolean] {
  const [rememberedName] = useState(getRememberedGuestName);
  const [name, setName] = useState(rememberedName ?? "");
  const [loading, setLoading] = useState(rememberedName === null);

  useEffect(() => {
    if (rememberedName !== null) return;
    let cancelled = false;
    getLegendaryName().then((generated) => {
      if (!cancelled) {
        setName(generated);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rememberedName]);

  return [name, setName, loading];
}

export function usePlayCubeWarmup(cubeId: string): void {
  useEffect(() => {
    if (!cubeId) return;
    const timer = window.setTimeout(() => warmCubeCache(cubeId), 2000);
    return () => window.clearTimeout(timer);
  }, [cubeId]);
}

export function useRestoreButtonFocus(
  buttonRef: RefObject<HTMLButtonElement | null>,
  shouldRestoreRef: RefObject<boolean>,
  view: string,
  bannerCubeId: string,
): void {
  useEffect(() => {
    if (!shouldRestoreRef.current) return;
    shouldRestoreRef.current = false;
    buttonRef.current?.focus({ preventScroll: true });
  }, [bannerCubeId, buttonRef, shouldRestoreRef, view]);
}
