/**
 * WebSocket transport and state hydration hook for live game and lobby sessions.
 */
import {
  useState,
  useEffect,
  useEffectEvent,
  useCallback,
  useRef,
} from "react";
import type {
  CardCatalogEntry,
  CompactGameState,
  GameBootstrap,
  GameState,
  LobbyState,
  ServerNoticeStatus,
} from "../types";
import {
  type AppError,
  createAppError,
  wsPayloadToAppError,
} from "../utils/appError";
import { hydrateGameState } from "../utils/catalogHydration";
import { connectionErrorForCloseCode } from "../utils/connectionClose";

/** A request to watch this player, still waiting on their answer. */
export interface SpectateRequest {
  request_id: string;
  spectator_name: string;
}

/**
 * Where the connection for one game and session stands. `ended` is final: the server refused or closed the
 * connection for a reason reconnecting cannot fix, such as an invalid session, a kick or the seat opening elsewhere.
 */
export type ConnectionStatus =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "open" }
  | { kind: "reconnecting" }
  | { kind: "ended"; error: AppError };

interface ConnectionState {
  status: ConnectionStatus;
  gameState: GameState | null;
  lobbyState: LobbyState | null;
  /** Every request waiting on this player's answer, oldest first, exactly as the server last sent them. */
  spectateRequests: SpectateRequest[];
  serverNotice: ServerNoticeStatus | null;
}

interface SpectatorConfig {
  spectatePlayer: string;
  requestId: string;
}

function computeReconnectDelayMs(attempt: number): number {
  const capped = Math.min(500 * 2 ** attempt, 30_000);
  return Math.floor(Math.random() * capped);
}

// StrictMode mounts, cleans up and remounts in one go in development. Starting the connection a
// task later lets that cleanup cancel it before a socket exists, instead of closing a socket
// mid-handshake, which browsers log as a failed connection.
export function connectAfterCurrentTask(connect: () => void): () => void {
  const timeout = setTimeout(connect, 0);
  return () => clearTimeout(timeout);
}

function initialConnectionState(key: string | null): ConnectionState {
  return {
    status: key ? { kind: "connecting" } : { kind: "idle" },
    gameState: null,
    lobbyState: null,
    spectateRequests: [],
    serverNotice: null,
  };
}

const KICKED_ERROR = () =>
  createAppError({
    code: "KICKED",
    detail: "Kicked by host",
    context: "default",
    fallbackMessage: "You were removed from the lobby.",
  });

export interface VoiceSignalPayload {
  signal_type: string;
  data: unknown;
  from_player: string;
}

export function useWebSocket(
  gameId: string | null,
  sessionId: string | null,
  spectatorConfig?: SpectatorConfig | null,
  onServerError?: (error: AppError) => void,
  onVoiceSignal?: (payload: VoiceSignalPayload) => void,
) {
  const spectatePlayer = spectatorConfig?.spectatePlayer ?? null;
  const spectateRequestId = spectatorConfig?.requestId ?? null;
  const connectionKey =
    gameId && sessionId
      ? JSON.stringify([gameId, sessionId, spectatePlayer, spectateRequestId])
      : null;

  // State is stamped with the connection it belongs to, so a new game or session starts clean instead of showing
  // the previous connection's game, lobby or error.
  const [stored, setStored] = useState<{
    key: string | null;
    state: ConnectionState;
  }>(() => ({
    key: connectionKey,
    state: initialConnectionState(connectionKey),
  }));
  const state =
    stored.key === connectionKey
      ? stored.state
      : initialConnectionState(connectionKey);

  const wsRef = useRef<WebSocket | null>(null);
  const handleServerError = useEffectEvent((error: AppError) => {
    onServerError?.(error);
  });
  const handleVoiceSignal = useEffectEvent((payload: VoiceSignalPayload) => {
    onVoiceSignal?.(payload);
  });

  useEffect(() => {
    if (!gameId || !sessionId || !connectionKey) return;

    const update = (updater: (state: ConnectionState) => ConnectionState) => {
      setStored((prev) => ({
        key: connectionKey,
        state: updater(
          prev.key === connectionKey
            ? prev.state
            : initialConnectionState(connectionKey),
        ),
      }));
    };

    let disposed = false;
    let ended = false;
    let reconnectAttempts = 0;
    let reconnectTimeout: number | null = null;
    let catalog: Record<string, CardCatalogEntry> = {};

    const end = (error: AppError) => {
      if (ended) return;
      ended = true;
      update((s) => ({ ...s, status: { kind: "ended", error } }));
    };

    const connect = () => {
      if (disposed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      let url = `${protocol}//${host}/ws/${gameId}?session_id=${sessionId}`;
      if (spectatePlayer && spectateRequestId) {
        url += `&spectate_player=${encodeURIComponent(spectatePlayer)}&request_id=${encodeURIComponent(spectateRequestId)}`;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;
      const isCurrentSocket = () => !disposed && wsRef.current === ws;

      ws.onopen = () => {
        if (!isCurrentSocket() || ended) return;
        reconnectAttempts = 0;
        // The server sends this connection's waiting requests only when there are some.
        update((s) => ({
          ...s,
          status: { kind: "open" },
          spectateRequests: [],
        }));
      };

      const messageQueue: MessageEvent[] = [];
      let processing = false;
      // Followed message by message rather than through rendered state, which can skip "starting" entirely.
      let lobbyStartStatus: LobbyState["start_status"] | null = null;

      async function processQueue() {
        if (processing) return;
        processing = true;
        while (messageQueue.length > 0) {
          if (!isCurrentSocket()) {
            messageQueue.length = 0;
            break;
          }
          const ev = messageQueue.shift()!;
          try {
            let message;
            if (ev.data instanceof Blob) {
              const ds = new DecompressionStream("gzip");
              const decompressed = ev.data.stream().pipeThrough(ds);
              const text = await new Response(decompressed).text();
              message = JSON.parse(text);
            } else {
              message = JSON.parse(ev.data);
            }
            if (message.type === "game_bootstrap") {
              const payload = message.payload as GameBootstrap;
              catalog = {
                ...payload.catalog,
                ...(payload.state.catalog_delta ?? {}),
              };
              const hydrated = hydrateGameState(payload.state, catalog);
              update((s) => ({ ...s, gameState: hydrated, lobbyState: null }));
            } else if (message.type === "game_state") {
              const payload = message.payload as CompactGameState;
              if (
                payload.catalog_delta &&
                Object.keys(payload.catalog_delta).length > 0
              ) {
                catalog = { ...catalog, ...payload.catalog_delta };
              }
              const hydrated = hydrateGameState(payload, catalog);
              update((s) => ({ ...s, gameState: hydrated, lobbyState: null }));
            } else if (message.type === "lobby_state") {
              const lobby = message.payload as LobbyState;
              if (
                lobbyStartStatus === "starting" &&
                lobby.start_status === "failed"
              ) {
                handleServerError(
                  createAppError({
                    code: "USER_MESSAGE",
                    detail: lobby.start_error,
                    context: "default",
                    fallbackMessage: "The game could not start.",
                  }),
                );
              }
              lobbyStartStatus = lobby.start_status;
              update((s) => ({ ...s, lobbyState: lobby }));
            } else if (message.type === "error") {
              handleServerError(
                wsPayloadToAppError(
                  message.payload,
                  "default",
                  "That action could not be completed.",
                ),
              );
            } else if (message.type === "connection_error") {
              end(
                wsPayloadToAppError(
                  message.payload,
                  "default",
                  "The connection could not be established.",
                ),
              );
            } else if (message.type === "spectate_requests") {
              update((s) => ({
                ...s,
                spectateRequests: message.payload.requests,
              }));
            } else if (message.type === "server_notice") {
              update((s) => ({ ...s, serverNotice: message.payload }));
            } else if (message.type === "kicked") {
              end(KICKED_ERROR());
            } else if (message.type === "voice_signal") {
              handleVoiceSignal(message.payload);
            }
          } catch (err) {
            console.error("Failed to process WebSocket message:", err);
          }
        }
        processing = false;
      }

      ws.onmessage = (event) => {
        if (!isCurrentSocket()) return;
        messageQueue.push(event);
        processQueue();
      };

      ws.onclose = (event) => {
        if (!isCurrentSocket()) return;
        wsRef.current = null;
        if (ended) return;

        const closeError = connectionErrorForCloseCode(
          event.code,
          event.reason,
        );
        if (closeError) {
          end(closeError);
          return;
        }

        update((s) => ({ ...s, status: { kind: "reconnecting" } }));
        const delay = computeReconnectDelayMs(reconnectAttempts);
        reconnectAttempts++;
        reconnectTimeout = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {};
    };

    const cancelConnect = connectAfterCurrentTask(connect);

    return () => {
      cancelConnect();
      disposed = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [gameId, sessionId, spectatePlayer, spectateRequestId, connectionKey]);

  const send = useCallback(
    (action: string, payload: Record<string, unknown> = {}) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action, payload }));
      }
    },
    [],
  );

  return {
    status: state.status,
    isConnected: state.status.kind === "open",
    connectionError: state.status.kind === "ended" ? state.status.error : null,
    gameState: state.gameState,
    lobbyState: state.lobbyState,
    spectateRequests: state.spectateRequests,
    serverNotice: state.serverNotice,
    send,
  };
}
