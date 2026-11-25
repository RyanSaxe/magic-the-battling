export type AppErrorCode =
  | "UNKNOWN"
  | "USER_MESSAGE"
  | "INVALID_REQUEST"
  | "NOT_AUTHENTICATED"
  | "INVALID_SESSION"
  | "GAME_NOT_FOUND"
  | "GAME_IN_PROGRESS"
  | "SPECTATE_TARGET_NOT_FOUND"
  | "SPECTATE_REQUEST_NOT_FOUND"
  | "PLAYER_NOT_IN_GAME"
  | "PLAYER_ALREADY_CONNECTED"
  | "SEAT_CLAIM_REQUIRED"
  | "SEAT_MOVED"
  | "PLAYER_NAME_TAKEN"
  | "INVALID_JOIN_CODE"
  | "LOBBY_FULL"
  | "GAME_ALREADY_STARTED"
  | "SERVER_UPDATING"
  | "SERVER_CAPACITY"
  | "WS_CAPACITY"
  | "RUNTIME_RESET"
  | "KICKED"
  | "BATTLER_NOT_FOUND"
  | "CUBE_NOT_FOUND"
  | "FOLLOW_NOT_FOUND"
  | "ALREADY_FOLLOWING"
  | "USERNAME_TAKEN"
  | "EMAIL_IN_USE"
  | "INVALID_CREDENTIALS"
  | "CARD_POOL_NOT_AVAILABLE"
  | "SHARE_DATA_NOT_FOUND"
  | "UNKNOWN_ACTION"
  | "SERVER_MAINTENANCE";

export type AppErrorContext =
  | "default"
  | "create-game"
  | "join-game"
  | "rejoin-game"
  | "game-status"
  | "spectate-request"
  | "spectate-status"
  | "share-game"
  | "login"
  | "register"
  | "follow-cube"
  | "unfollow-cube"
  | "create-battler"
  | "update-battler"
  | "delete-battler"
  | "game-action"
  | "lobby-action"
  | "game-connection"
  | "lobby-connection"
  | "play-connection";

interface AppErrorInit {
  code?: string | null;
  detail?: string | null;
  status?: number;
  message: string;
  retryAfterSeconds?: number | null;
}

interface AppErrorResponse {
  code?: string;
  detail?: string;
  message?: string;
}

interface CreateAppErrorOptions {
  code?: string | null;
  detail?: string | null;
  status?: number;
  context: AppErrorContext;
  fallbackMessage: string;
  retryAfterSeconds?: number | null;
}

const KNOWN_CODE_LIST: readonly AppErrorCode[] = [
  "UNKNOWN",
  "USER_MESSAGE",
  "INVALID_REQUEST",
  "NOT_AUTHENTICATED",
  "INVALID_SESSION",
  "GAME_NOT_FOUND",
  "GAME_IN_PROGRESS",
  "SPECTATE_TARGET_NOT_FOUND",
  "SPECTATE_REQUEST_NOT_FOUND",
  "PLAYER_NOT_IN_GAME",
  "PLAYER_ALREADY_CONNECTED",
  "SEAT_CLAIM_REQUIRED",
  "SEAT_MOVED",
  "PLAYER_NAME_TAKEN",
  "INVALID_JOIN_CODE",
  "LOBBY_FULL",
  "GAME_ALREADY_STARTED",
  "SERVER_UPDATING",
  "SERVER_CAPACITY",
  "WS_CAPACITY",
  "RUNTIME_RESET",
  "KICKED",
  "BATTLER_NOT_FOUND",
  "CUBE_NOT_FOUND",
  "FOLLOW_NOT_FOUND",
  "ALREADY_FOLLOWING",
  "USERNAME_TAKEN",
  "EMAIL_IN_USE",
  "INVALID_CREDENTIALS",
  "CARD_POOL_NOT_AVAILABLE",
  "SHARE_DATA_NOT_FOUND",
  "UNKNOWN_ACTION",
  "SERVER_MAINTENANCE",
];

const KNOWN_CODES = new Map<string, AppErrorCode>(
  KNOWN_CODE_LIST.map((code) => [code, code]),
);

const STATIC_ERROR_MESSAGES: Partial<Record<AppErrorCode, string>> = {
  GAME_IN_PROGRESS:
    "This game is still being played. Its review opens when the game ends.",
  SPECTATE_TARGET_NOT_FOUND: "That player is no longer available to spectate.",
  SPECTATE_REQUEST_NOT_FOUND: "That spectate request is no longer available.",
  INVALID_SESSION:
    "Your session is no longer valid. Rejoin the game to continue.",
  PLAYER_ALREADY_CONNECTED:
    "That player is already connected from another window or device.",
  SEAT_CLAIM_REQUIRED:
    "That seat can only be taken back from the browser that joined with it.",
  SEAT_MOVED: "This game is now open somewhere else.",
  INVALID_JOIN_CODE: "That join code is not valid.",
  LOBBY_FULL: "That lobby is full.",
  PLAYER_NAME_TAKEN: "That player name is already taken in this lobby.",
  SERVER_CAPACITY: "The server is busy right now. Please try again shortly.",
  WS_CAPACITY: "The server is busy right now. Please try again shortly.",
  SERVER_MAINTENANCE:
    "Server maintenance is in progress. Please reconnect shortly.",
  USERNAME_TAKEN: "That username is already taken.",
  EMAIL_IN_USE: "That email is already in use.",
  INVALID_CREDENTIALS: "Incorrect username or password.",
  BATTLER_NOT_FOUND: "That preset no longer exists.",
  ALREADY_FOLLOWING: "You're already following this cube.",
  FOLLOW_NOT_FOUND: "That follow entry no longer exists.",
  CARD_POOL_NOT_AVAILABLE: "Card data isn't available for this game yet.",
  SHARE_DATA_NOT_FOUND: "No round data is available for this game.",
  UNKNOWN_ACTION: "That action is not available right now.",
  KICKED: "You were removed from the lobby.",
  RUNTIME_RESET: "The server restarted. Please reconnect.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStringProp(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

export class AppError extends Error {
  code: AppErrorCode;
  detail: string | null;
  status?: number;
  retryAfterSeconds?: number | null;

  constructor({
    code,
    detail,
    status,
    message,
    retryAfterSeconds,
  }: AppErrorInit) {
    super(message);
    this.name = "AppError";
    this.code = normalizeAppErrorCode(code);
    this.detail = detail ?? null;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds ?? null;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function normalizeAppErrorCode(code?: string | null): AppErrorCode {
  if (!code) return "UNKNOWN";
  return KNOWN_CODES.get(code) ?? "UNKNOWN";
}

function retryAfterToSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseInt(value, 10);
  return Number.isFinite(seconds) ? seconds : null;
}

function looksLikeTransportError(detail: string | null): boolean {
  if (!detail) return true;
  const normalized = detail.trim().toLowerCase();
  return (
    normalized === "failed to fetch" ||
    normalized.includes("networkerror") ||
    normalized.includes("load failed")
  );
}

const RECONNECT_UPDATE_CONTEXTS = new Set<AppErrorContext>([
  "rejoin-game",
  "game-connection",
  "lobby-connection",
  "play-connection",
]);

function serverUpdatingMessage(context: AppErrorContext): string {
  if (context === "create-game" || context === "join-game") {
    return "New games are temporarily paused for a server update. Try again in about 10-15 minutes.";
  }
  if (RECONNECT_UPDATE_CONTEXTS.has(context)) {
    return "The server is updating right now. Reconnect in a few minutes.";
  }
  return "The server is updating right now. Please try again shortly.";
}

function gameNotFoundMessage(context: AppErrorContext): string {
  if (context === "lobby-connection") {
    return "This lobby is no longer available. It may have ended or been cleared during a server restart.";
  }
  if (context === "play-connection") {
    return "That game is no longer available. Please start a new one.";
  }
  if (context === "share-game") {
    return "This game is no longer available to share.";
  }
  if (context === "join-game") {
    return "No game found with that join code. Check the code and try again.";
  }
  return "This game is no longer available. It may have ended or been cleared during a server restart.";
}

type DynamicErrorResolver = (
  error: AppError,
  context: AppErrorContext,
  fallbackMessage: string,
) => string;

const DYNAMIC_ERROR_MESSAGES: Partial<
  Record<AppErrorCode, DynamicErrorResolver>
> = {
  GAME_NOT_FOUND: (_error, context) => gameNotFoundMessage(context),
  PLAYER_NOT_IN_GAME: (_error, context) =>
    context === "rejoin-game"
      ? "That player slot is no longer available in this game."
      : "Your player slot is no longer available in this game.",
  GAME_ALREADY_STARTED: (_error, context) =>
    context === "join-game"
      ? "That game has already started."
      : "This game has already started.",
  SERVER_UPDATING: (_error, context) => serverUpdatingMessage(context),
  NOT_AUTHENTICATED: (_error, context) =>
    context === "register"
      ? "Please create an account to continue."
      : "Please log in to continue.",
  CUBE_NOT_FOUND: (error) =>
    error.detail ?? "CubeCobra has no cube with that ID.",
  INVALID_REQUEST: (error, _context, fallbackMessage) =>
    error.detail ?? fallbackMessage,
};

function resolveDynamicAppErrorMessage(
  error: AppError,
  context: AppErrorContext,
  fallbackMessage: string,
): string {
  const resolver = DYNAMIC_ERROR_MESSAGES[error.code];
  return resolver ? resolver(error, context, fallbackMessage) : fallbackMessage;
}

export function getAppErrorMessage(
  error: unknown,
  context: AppErrorContext,
  fallbackMessage: string,
): string {
  if (error instanceof AppError) {
    if (error.code === "USER_MESSAGE" && error.detail) {
      return error.detail;
    }
    const staticMessage = STATIC_ERROR_MESSAGES[error.code];
    if (staticMessage !== undefined) {
      return staticMessage;
    }
    return resolveDynamicAppErrorMessage(error, context, fallbackMessage);
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallbackMessage;
}

export function createAppError({
  code,
  detail,
  status,
  context,
  fallbackMessage,
  retryAfterSeconds,
}: CreateAppErrorOptions): AppError {
  const normalizedCode = normalizeAppErrorCode(code);
  const appError = new AppError({
    code: normalizedCode,
    detail,
    status,
    message: fallbackMessage,
    retryAfterSeconds,
  });
  appError.message = getAppErrorMessage(appError, context, fallbackMessage);
  return appError;
}

async function parseErrorResponse(
  response: Response,
): Promise<AppErrorResponse | null> {
  try {
    const data: unknown = await response.json();
    if (!isRecord(data)) return null;
    const code = getStringProp(data, "code");
    const message = getStringProp(data, "message");
    const detail = getStringProp(data, "detail") ?? message;
    return { code, detail, message };
  } catch {
    return null;
  }
}

export async function responseToAppError(
  response: Response,
  context: AppErrorContext,
  fallbackMessage: string,
): Promise<AppError> {
  const payload = await parseErrorResponse(response);
  return createAppError({
    code: payload?.code,
    detail: payload?.detail ?? payload?.message ?? null,
    status: response.status,
    context,
    fallbackMessage,
    retryAfterSeconds: retryAfterToSeconds(response.headers.get("Retry-After")),
  });
}

export function wsPayloadToAppError(
  payload: unknown,
  context: AppErrorContext,
  fallbackMessage: string,
): AppError {
  const data = isRecord(payload) ? payload : null;
  const code = data ? getStringProp(data, "code") : undefined;
  const detail = data
    ? (getStringProp(data, "detail") ?? getStringProp(data, "message") ?? null)
    : null;
  return createAppError({
    code,
    detail,
    context,
    fallbackMessage,
  });
}

export function unknownToAppError(
  error: unknown,
  context: AppErrorContext,
  fallbackMessage: string,
): AppError {
  if (error instanceof AppError) return error;
  const detail = error instanceof Error ? error.message : null;
  return createAppError({
    code: looksLikeTransportError(detail) ? "UNKNOWN" : "USER_MESSAGE",
    detail,
    context,
    fallbackMessage,
  });
}
