/**
 * Lobby synchronization hook encapsulating navigation on game start, seat
 * connection reporting, error/host-change toasts, and guided-mode default persistence.
 */
import { useEffect, useEffectEvent, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  START_STEPS,
  type LoadingRouteState,
} from "../components/common/loadingSteps";
import type { GameState, LobbyState } from "../types";
import type { AppError } from "../utils/appError";
import {
  getDefaultNewPlayerPreference,
  getNewPlayerPreferenceForGame,
  setNewPlayerPreferenceForGame,
} from "../utils/deviceIdentity";
import type { TabSession } from "../utils/tabSession";
import type { ConnectionStatus } from "./useWebSocket";

interface UseLobbySyncOptions {
  gameId: string;
  session: TabSession | null;
  status: ConnectionStatus;
  lobbyState: LobbyState | null;
  gameState: GameState | null;
  battlerError: string | null;
  hostName: string | null;
  selfName: string | null;
  lostHost: boolean;
  gainedHost: boolean;
  connectionOpened: (sessionId: string) => void;
  connectionEnded: (sessionId: string, error: AppError) => void;
  addToast: (message: string, type?: "error" | "info" | "warning") => void;
}

export function useLobbySync({
  gameId,
  session,
  status,
  lobbyState,
  gameState,
  battlerError,
  hostName,
  selfName,
  lostHost,
  gainedHost,
  connectionOpened,
  connectionEnded,
  addToast,
}: UseLobbySyncOptions): void {
  const navigate = useNavigate();
  const lastCubeErrorRef = useRef<string | null>(null);
  const lastBattlerErrorRef = useRef<string | null>(null);
  const previousHostRef = useRef<string | null>(null);

  const notifyToast = useEffectEvent(
    (message: string, type: "error" | "info" | "warning") => {
      addToast(message, type);
    },
  );
  const reportConnectionOpened = useEffectEvent((sessionId: string) => {
    connectionOpened(sessionId);
  });
  const reportConnectionEnded = useEffectEvent(
    (sessionId: string, error: AppError) => {
      connectionEnded(sessionId, error);
    },
  );

  // Persist the default guided-mode preference once per game/player when none is stored yet.
  useEffect(() => {
    if (!gameId) return;
    const existing = getNewPlayerPreferenceForGame(gameId, session?.playerId);
    if (existing === null) {
      setNewPlayerPreferenceForGame(
        gameId,
        getDefaultNewPlayerPreference(),
        session?.playerId,
      );
    }
  }, [gameId, session?.playerId]);

  useEffect(() => {
    const nextError =
      lobbyState?.play_mode === "limited" &&
      lobbyState.cube_loading_status === "error"
        ? lobbyState.cube_loading_error
        : null;
    if (!nextError || nextError === lastCubeErrorRef.current) {
      if (!nextError) lastCubeErrorRef.current = null;
      return;
    }
    lastCubeErrorRef.current = nextError;
    notifyToast(nextError, "error");
  }, [
    lobbyState?.cube_loading_error,
    lobbyState?.cube_loading_status,
    lobbyState?.play_mode,
  ]);

  useEffect(() => {
    if (!battlerError || battlerError === lastBattlerErrorRef.current) {
      if (!battlerError) lastBattlerErrorRef.current = null;
      return;
    }
    lastBattlerErrorRef.current = battlerError;
    notifyToast(battlerError, "error");
  }, [battlerError]);

  useEffect(() => {
    if (!gameState) return;
    const state: LoadingRouteState = { loadingSteps: START_STEPS };
    void navigate(`/game/${gameId}/play`, { state });
  }, [gameState, gameId, navigate]);

  useEffect(() => {
    if (!session) return;
    if (status.kind === "open") reportConnectionOpened(session.sessionId);
    if (status.kind === "ended") {
      reportConnectionEnded(session.sessionId, status.error);
    }
  }, [status, session]);

  useEffect(() => {
    const previousName = previousHostRef.current;
    previousHostRef.current = hostName;
    if (!previousName || !hostName || previousName === hostName) return;
    if (lostHost || gainedHost) return;
    notifyToast(
      hostName === selfName
        ? `You're the host now. ${previousName} left the lobby.`
        : `${hostName} is now the host.`,
      "info",
    );
  }, [hostName, selfName, lostHost, gainedHost]);
}
