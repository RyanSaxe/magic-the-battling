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

const KICKED_ERROR = (): AppError =>
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

export interface UseWebSocketResult {
  status: ConnectionStatus;
  isConnected: boolean;
  connectionError: AppError | null;
  gameState: GameState | null;
  lobbyState: LobbyState | null;
  spectateRequests: SpectateRequest[];
  serverNotice: ServerNoticeStatus | null;
  send: (action: string, payload?: Record<string, unknown>) => void;
}

type ServerMessage =
  | { type: "game_bootstrap"; payload: GameBootstrap }
  | { type: "game_state"; payload: CompactGameState }
  | { type: "lobby_state"; payload: LobbyState }
  | { type: "error"; payload: unknown }
  | { type: "connection_error"; payload: unknown }
  | { type: "spectate_requests"; payload: { requests: SpectateRequest[] } }
  | { type: "server_notice"; payload: ServerNoticeStatus | null }
  | { type: "kicked"; payload: unknown }
  | { type: "voice_signal"; payload: VoiceSignalPayload };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGameBootstrapPayload(value: unknown): value is GameBootstrap {
  return isRecord(value) && isRecord(value.catalog) && isRecord(value.state);
}

function isCompactGameStatePayload(value: unknown): value is CompactGameState {
  return isRecord(value) && isRecord(value.self_player);
}

function isLobbyStatePayload(value: unknown): value is LobbyState {
  return isRecord(value) && typeof value.game_id === "string";
}

function isSpectateRequestsPayload(
  value: unknown,
): value is { requests: SpectateRequest[] } {
  return isRecord(value) && Array.isArray(value.requests);
}

function isServerNoticePayload(
  value: unknown,
): value is ServerNoticeStatus | null {
  return value === null || isRecord(value);
}

function isVoiceSignalPayload(value: unknown): value is VoiceSignalPayload {
  return (
    isRecord(value) &&
    typeof value.signal_type === "string" &&
    typeof value.from_player === "string"
  );
}

function parseStateMessage(
  type: string,
  payload: unknown,
): ServerMessage | null {
  if (type === "game_bootstrap") {
    return isGameBootstrapPayload(payload) ? { type, payload } : null;
  }
  if (type === "game_state") {
    return isCompactGameStatePayload(payload) ? { type, payload } : null;
  }
  if (type === "lobby_state") {
    return isLobbyStatePayload(payload) ? { type, payload } : null;
  }
  if (type === "spectate_requests") {
    return isSpectateRequestsPayload(payload) ? { type, payload } : null;
  }
  return null;
}

function parseControlMessage(
  type: string,
  payload: unknown,
): ServerMessage | null {
  if (type === "error" || type === "connection_error" || type === "kicked") {
    return { type, payload };
  }
  if (type === "server_notice") {
    return isServerNoticePayload(payload) ? { type, payload } : null;
  }
  if (type === "voice_signal") {
    return isVoiceSignalPayload(payload) ? { type, payload } : null;
  }
  return null;
}

function parseServerMessage(raw: unknown): ServerMessage | null {
  if (!isRecord(raw) || typeof raw.type !== "string") return null;
  return (
    parseStateMessage(raw.type, raw.payload) ??
    parseControlMessage(raw.type, raw.payload)
  );
}

async function decodeBlobMessage(blob: Blob): Promise<unknown> {
  const ds = new DecompressionStream("gzip");
  const decompressed = blob.stream().pipeThrough(ds);
  const text = await new Response(decompressed).text();
  return JSON.parse(text);
}

export interface UseWebSocketOptions {
  gameId: string | null;
  sessionId: string | null;
  spectatorConfig?: SpectatorConfig | null;
  onServerError?: (error: AppError) => void;
  onVoiceSignal?: (payload: VoiceSignalPayload) => void;
}

export function useWebSocket({
  gameId,
  sessionId,
  spectatorConfig,
  onServerError,
  onVoiceSignal,
}: UseWebSocketOptions): UseWebSocketResult {
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
    if (!gameId || !sessionId || !connectionKey) return undefined;

    const update = (
      updater: (state: ConnectionState) => ConnectionState,
    ): void => {
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

    const end = (error: AppError): void => {
      if (ended) return;
      ended = true;
      update((s) => ({ ...s, status: { kind: "ended", error } }));
    };

    const connect = (): void => {
      if (disposed) return;

      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      let url = `${protocol}//${host}/ws/${gameId}?session_id=${sessionId}`;
      if (spectatePlayer && spectateRequestId) {
        url += `&spectate_player=${encodeURIComponent(spectatePlayer)}&request_id=${encodeURIComponent(spectateRequestId)}`;
      }

      const ws = new WebSocket(url);
      wsRef.current = ws;
      const isCurrentSocket = (): boolean => !disposed && wsRef.current === ws;

      ws.addEventListener("open", () => {
        if (!isCurrentSocket() || ended) return;
        reconnectAttempts = 0;
        // The server sends this connection's waiting requests only when there are some.
        update((s) => ({
          ...s,
          status: { kind: "open" },
          spectateRequests: [],
        }));
      });

      const messageQueue: MessageEvent[] = [];
      let processing = false;
      // Followed message by message rather than through rendered state, which can skip "starting" entirely.
      let lobbyStartStatus: LobbyState["start_status"] | null = null;

      const applyGameStateMessage = (
        message: Extract<
          ServerMessage,
          { type: "game_bootstrap" | "game_state" | "lobby_state" }
        >,
      ): void => {
        if (message.type === "game_bootstrap") {
          catalog = {
            ...message.payload.catalog,
            ...message.payload.state.catalog_delta,
          };
          const hydrated = hydrateGameState(message.payload.state, catalog);
          update((s) => ({ ...s, gameState: hydrated, lobbyState: null }));
          return;
        }
        if (message.type === "game_state") {
          const delta = message.payload.catalog_delta;
          if (delta && Object.keys(delta).length > 0) {
            catalog = { ...catalog, ...delta };
          }
          const hydrated = hydrateGameState(message.payload, catalog);
          update((s) => ({ ...s, gameState: hydrated, lobbyState: null }));
          return;
        }
        const lobby = message.payload;
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
      };

      const handleDecodedMessage = (message: ServerMessage): void => {
        if (
          message.type === "game_bootstrap" ||
          message.type === "game_state" ||
          message.type === "lobby_state"
        ) {
          applyGameStateMessage(message);
          return;
        }
        if (message.type === "error") {
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
        } else {
          handleVoiceSignal(message.payload);
        }
      };

      const processNext = async (): Promise<void> => {
        if (!isCurrentSocket()) {
          messageQueue.length = 0;
          processing = false;
          return;
        }
        const ev = messageQueue.shift();
        if (!ev) {
          processing = false;
          return;
        }
        try {
          let decoded: unknown = null;
          if (ev.data instanceof Blob) {
            decoded = await decodeBlobMessage(ev.data);
          } else if (typeof ev.data === "string") {
            decoded = JSON.parse(ev.data);
          }
          const parsed = parseServerMessage(decoded);
          if (parsed) handleDecodedMessage(parsed);
        } catch (err) {
          console.error("Failed to process WebSocket message:", err);
        }
        if (messageQueue.length > 0) {
          await processNext();
        } else {
          processing = false;
        }
      };

      ws.addEventListener("message", (event) => {
        if (!isCurrentSocket()) return;
        messageQueue.push(event);
        if (!processing) {
          processing = true;
          void processNext();
        }
      });

      ws.addEventListener("close", (event) => {
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
      });

      ws.addEventListener("error", () => {});
    };

    const cancelConnect = connectAfterCurrentTask(connect);

    return (): void => {
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
