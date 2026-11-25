/**
 * Connection, identity, phase-action, and pointer-hover synchronization hooks for `Game.tsx`.
 */
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { findBattleCard, type HoveredBattleCard } from "../pages/gameHotkeys";
import type { PhaseActionEvent } from "../pages/pendingPhaseAction";
import type { BattleView } from "../types";
import type { AppError } from "../utils/appError";
import { rememberPlayerForGame } from "../utils/deviceIdentity";
import { skipNextEnter } from "../utils/enterKey";
import type { TabSession } from "../utils/tabSession";
import type { ConnectionStatus } from "./useWebSocket";

interface UseGameSessionSyncOptions {
  gameId: string;
  session: TabSession | null;
  status: ConnectionStatus;
  isSpectator: boolean;
  isConnected: boolean;
  selfPlayerName: string | undefined;
  selfPhase: string | undefined;
  selfBuildReady: boolean;
  connectionOpened: (sessionId: string) => void;
  connectionEnded: (sessionId: string, error: AppError) => void;
  spectatorConnectionEnded: (error: AppError) => void;
  dispatchPhaseAction: (event: PhaseActionEvent) => void;
}

export function useGameSessionSync({
  gameId,
  session,
  status,
  isSpectator,
  isConnected,
  selfPlayerName,
  selfPhase,
  selfBuildReady,
  connectionOpened,
  connectionEnded,
  spectatorConnectionEnded,
  dispatchPhaseAction,
}: UseGameSessionSyncOptions): void {
  const notifyOpened = useEffectEvent((sessionId: string) => {
    connectionOpened(sessionId);
  });
  const notifyEnded = useEffectEvent((sessionId: string, error: AppError) => {
    connectionEnded(sessionId, error);
  });
  const notifySpectatorEnded = useEffectEvent((error: AppError) => {
    spectatorConnectionEnded(error);
  });
  const syncPhaseAction = useEffectEvent(
    (phase: string | null, buildReady: boolean, connected: boolean) => {
      dispatchPhaseAction({
        type: "server_state",
        server: { phase, buildReady, connected },
      });
    },
  );

  useEffect(() => {
    if (!session || isSpectator) return;
    if (status.kind === "open") notifyOpened(session.sessionId);
    if (status.kind === "ended") notifyEnded(session.sessionId, status.error);
  }, [status, session, isSpectator]);

  useEffect(() => {
    if (isSpectator && status.kind === "ended") {
      notifySpectatorEnded(status.error);
    }
  }, [status, isSpectator]);

  useEffect(() => {
    if (!gameId || !selfPlayerName || isSpectator) return;
    rememberPlayerForGame(gameId, selfPlayerName);
  }, [gameId, selfPlayerName, isSpectator]);

  useEffect(() => {
    syncPhaseAction(selfPhase ?? null, selfBuildReady, isConnected);
  }, [selfPhase, selfBuildReady, isConnected]);
}

export function useGamePointerHover(
  currentBattle: BattleView | null | undefined,
  selfPhase: string | undefined,
) {
  const [hoveredCard, setHoveredCard] = useState<HoveredBattleCard | null>(
    null,
  );
  const [lastPhase, setLastPhase] = useState(selfPhase);
  if (lastPhase !== selfPhase) {
    setLastPhase(selfPhase);
    setHoveredCard(null);
  }

  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const trackPointer = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    const forgetPointer = () => {
      pointerRef.current = null;
    };
    window.addEventListener("mousemove", trackPointer);
    document.documentElement.addEventListener("mouseleave", forgetPointer);
    return () => {
      window.removeEventListener("mousemove", trackPointer);
      document.documentElement.removeEventListener("mouseleave", forgetPointer);
    };
  }, []);

  useEffect(() => {
    const pointer = pointerRef.current;
    if (!currentBattle || !pointer) return;
    // A card that slides under a resting pointer gets no mouseenter; re-read on the next frame.
    const frameId = requestAnimationFrame(() => {
      const cardId = document
        .elementFromPoint(pointer.x, pointer.y)
        ?.closest("[data-guide-card-id]")
        ?.getAttribute("data-guide-card-id");
      const card = cardId ? findBattleCard(currentBattle, cardId) : null;
      setHoveredCard(card);
    });
    return () => cancelAnimationFrame(frameId);
  }, [currentBattle]);

  return { hoveredCard, setHoveredCard };
}

export function useRollExhaustedEnterGuard(
  canRoll: boolean,
  selfPhase: string | undefined,
): void {
  const couldRollRef = useRef(canRoll);
  useEffect(() => {
    const rolledOut = couldRollRef.current && !canRoll && selfPhase === "draft";
    couldRollRef.current = canRoll;
    // Players press Enter on Roll until it turns off, so the Enter after that is likely meant for Roll.
    if (rolledOut) return skipNextEnter();
  }, [canRoll, selfPhase]);
}
