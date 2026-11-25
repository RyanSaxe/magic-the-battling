/**
 * Lobby lookup and started-game redirect for LobbySeatNotice.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getLobby } from "../../api/client";
import type { LobbyState } from "../../types";

export function useLobbyJoin(gameId: string): LobbyState | "missing" | null {
  const navigate = useNavigate();
  const [lobby, setLobby] = useState<LobbyState | "missing" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLobby(gameId)
      .then((state) => {
        if (!cancelled) setLobby(state);
      })
      .catch(() => {
        if (!cancelled) setLobby("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [gameId]);

  useEffect(() => {
    // A link to a lobby whose game has started belongs on the game page, which offers to watch or reconnect.
    if (lobby === "missing") {
      navigate(`/game/${gameId}/play`, { replace: true });
    }
  }, [lobby, gameId, navigate]);

  return lobby;
}
