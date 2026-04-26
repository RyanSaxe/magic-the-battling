export type AppErrorCode =
  | 'UNKNOWN'
  | 'USER_MESSAGE'
  | 'INVALID_REQUEST'
  | 'NOT_AUTHENTICATED'
  | 'INVALID_SESSION'
  | 'GAME_NOT_FOUND'
  | 'SPECTATE_TARGET_NOT_FOUND'
  | 'SPECTATE_REQUEST_NOT_FOUND'
  | 'PLAYER_NOT_IN_GAME'
  | 'PLAYER_ALREADY_CONNECTED'
  | 'PLAYER_NAME_TAKEN'
  | 'INVALID_JOIN_CODE'
  | 'LOBBY_FULL'
  | 'GAME_ALREADY_STARTED'
  | 'SERVER_UPDATING'
  | 'SERVER_CAPACITY'
  | 'WS_CAPACITY'
  | 'RUNTIME_RESET'
  | 'KICKED'
  | 'BATTLER_NOT_FOUND'
  | 'FOLLOW_NOT_FOUND'
  | 'ALREADY_FOLLOWING'
  | 'USERNAME_TAKEN'
  | 'EMAIL_IN_USE'
  | 'INVALID_CREDENTIALS'
  | 'CARD_POOL_NOT_AVAILABLE'
  | 'SHARE_DATA_NOT_FOUND'
  | 'UNKNOWN_ACTION'
  | 'SERVER_MAINTENANCE'

export type AppErrorContext =
  | 'default'
  | 'create-game'
  | 'join-game'
  | 'rejoin-game'
  | 'game-status'
  | 'spectate-request'
  | 'spectate-status'
  | 'share-game'
  | 'login'
  | 'register'
  | 'follow-cube'
  | 'unfollow-cube'
  | 'create-battler'
  | 'update-battler'
  | 'delete-battler'
  | 'game-action'
  | 'lobby-action'
  | 'game-connection'
  | 'lobby-connection'
  | 'play-connection'

interface AppErrorInit {
  code?: string | null
  detail?: string | null
  status?: number
  message: string
  retryAfterSeconds?: number | null
}

interface AppErrorResponse {
  code?: string
  detail?: string
  message?: string
}

interface CreateAppErrorOptions {
  code?: string | null
  detail?: string | null
  status?: number
  context: AppErrorContext
  fallbackMessage: string
  retryAfterSeconds?: number | null
}

const KNOWN_CODES = new Set<AppErrorCode>([
  'UNKNOWN',
  'USER_MESSAGE',
  'INVALID_REQUEST',
  'NOT_AUTHENTICATED',
  'INVALID_SESSION',
  'GAME_NOT_FOUND',
  'SPECTATE_TARGET_NOT_FOUND',
  'SPECTATE_REQUEST_NOT_FOUND',
  'PLAYER_NOT_IN_GAME',
  'PLAYER_ALREADY_CONNECTED',
  'PLAYER_NAME_TAKEN',
  'INVALID_JOIN_CODE',
  'LOBBY_FULL',
  'GAME_ALREADY_STARTED',
  'SERVER_UPDATING',
  'SERVER_CAPACITY',
  'WS_CAPACITY',
  'RUNTIME_RESET',
  'KICKED',
  'BATTLER_NOT_FOUND',
  'FOLLOW_NOT_FOUND',
  'ALREADY_FOLLOWING',
  'USERNAME_TAKEN',
  'EMAIL_IN_USE',
  'INVALID_CREDENTIALS',
  'CARD_POOL_NOT_AVAILABLE',
  'SHARE_DATA_NOT_FOUND',
  'UNKNOWN_ACTION',
  'SERVER_MAINTENANCE',
])

export class AppError extends Error {
  code: AppErrorCode
  detail: string | null
  status?: number
  retryAfterSeconds?: number | null

  constructor({ code, detail, status, message, retryAfterSeconds }: AppErrorInit) {
    super(message)
    this.name = 'AppError'
    this.code = normalizeAppErrorCode(code)
    this.detail = detail ?? null
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds ?? null
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

function normalizeAppErrorCode(code?: string | null): AppErrorCode {
  if (code && KNOWN_CODES.has(code as AppErrorCode)) {
    return code as AppErrorCode
  }
  return 'UNKNOWN'
}

function retryAfterToSeconds(value: string | null): number | null {
  if (!value) return null
  const seconds = Number.parseInt(value, 10)
  return Number.isFinite(seconds) ? seconds : null
}

function looksLikeTransportError(detail: string | null): boolean {
  if (!detail) return true
  const normalized = detail.trim().toLowerCase()
  return normalized === 'failed to fetch'
    || normalized.includes('networkerror')
    || normalized.includes('load failed')
}

function serverUpdatingMessage(context: AppErrorContext): string {
  switch (context) {
    case 'create-game':
    case 'join-game':
      return 'New games are temporarily paused for a server update. Try again in about 10-15 minutes.'
    case 'rejoin-game':
    case 'game-connection':
    case 'lobby-connection':
    case 'play-connection':
      return 'The server is updating right now. Reconnect in a few minutes.'
    default:
      return 'The server is updating right now. Please try again shortly.'
  }
}

export function getAppErrorMessage(
  error: AppError | unknown,
  context: AppErrorContext,
  fallbackMessage: string,
): string {
  if (error instanceof AppError) {
    if (error.code === 'USER_MESSAGE' && error.detail) {
      return error.detail
    }

    switch (error.code) {
      case 'GAME_NOT_FOUND':
        if (context === 'lobby-connection') {
          return 'This lobby is no longer available. It may have ended or been cleared during a server restart.'
        }
        if (context === 'play-connection') {
          return 'That game is no longer available. Please start a new one.'
        }
        if (context === 'share-game') {
          return 'This game is no longer available to share.'
        }
        return 'This game is no longer available. It may have ended or been cleared during a server restart.'
      case 'SPECTATE_TARGET_NOT_FOUND':
        return 'That player is no longer available to spectate.'
      case 'SPECTATE_REQUEST_NOT_FOUND':
        return 'That spectate request is no longer available.'
      case 'INVALID_SESSION':
        return 'Your session is no longer valid. Rejoin the game to continue.'
      case 'PLAYER_NOT_IN_GAME':
        if (context === 'rejoin-game') {
          return 'That player slot is no longer available in this game.'
        }
        return 'Your player slot is no longer available in this game.'
      case 'PLAYER_ALREADY_CONNECTED':
        return 'That player is already connected from another window or device.'
      case 'INVALID_JOIN_CODE':
        return 'That join code is not valid.'
      case 'LOBBY_FULL':
        return 'That lobby is full.'
      case 'PLAYER_NAME_TAKEN':
        return 'That player name is already taken in this lobby.'
      case 'GAME_ALREADY_STARTED':
        return context === 'join-game'
          ? 'That game has already started.'
          : 'This game has already started.'
      case 'SERVER_UPDATING':
        return serverUpdatingMessage(context)
      case 'SERVER_CAPACITY':
      case 'WS_CAPACITY':
        return 'The server is busy right now. Please try again shortly.'
      case 'SERVER_MAINTENANCE':
        return 'Server maintenance is in progress. Please reconnect shortly.'
      case 'NOT_AUTHENTICATED':
        if (context === 'login') return 'Please log in to continue.'
        if (context === 'register') return 'Please create an account to continue.'
        return 'Please log in to continue.'
      case 'USERNAME_TAKEN':
        return 'That username is already taken.'
      case 'EMAIL_IN_USE':
        return 'That email is already in use.'
      case 'INVALID_CREDENTIALS':
        return 'Incorrect username or password.'
      case 'BATTLER_NOT_FOUND':
        return 'That battler no longer exists.'
      case 'ALREADY_FOLLOWING':
        return "You're already following this cube."
      case 'FOLLOW_NOT_FOUND':
        return 'That follow entry no longer exists.'
      case 'CARD_POOL_NOT_AVAILABLE':
        return "Card data isn't available for this game yet."
      case 'SHARE_DATA_NOT_FOUND':
        return 'No round data is available for this game.'
      case 'UNKNOWN_ACTION':
        return 'That action is not available right now.'
      case 'INVALID_REQUEST':
        return error.detail ?? fallbackMessage
      case 'KICKED':
        return 'You were removed from the lobby.'
      case 'RUNTIME_RESET':
        return 'The server restarted. Please reconnect.'
      case 'UNKNOWN':
      default:
        return fallbackMessage
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallbackMessage
}

export function createAppError({
  code,
  detail,
  status,
  context,
  fallbackMessage,
  retryAfterSeconds,
}: CreateAppErrorOptions): AppError {
  const normalizedCode = normalizeAppErrorCode(code)
  const appError = new AppError({
    code: normalizedCode,
    detail,
    status,
    message: fallbackMessage,
    retryAfterSeconds,
  })
  appError.message = getAppErrorMessage(appError, context, fallbackMessage)
  return appError
}

async function parseErrorResponse(response: Response): Promise<AppErrorResponse | null> {
  try {
    const data = await response.json() as AppErrorResponse | { detail?: string }
    if (typeof data === 'object' && data !== null) {
      return {
        code: 'code' in data && typeof data.code === 'string' ? data.code : undefined,
        detail:
          'detail' in data && typeof data.detail === 'string'
            ? data.detail
            : 'message' in data && typeof data.message === 'string'
              ? data.message
              : undefined,
        message: 'message' in data && typeof data.message === 'string' ? data.message : undefined,
      }
    }
  } catch {
    return null
  }
  return null
}

export async function responseToAppError(
  response: Response,
  context: AppErrorContext,
  fallbackMessage: string,
): Promise<AppError> {
  const payload = await parseErrorResponse(response)
  return createAppError({
    code: payload?.code,
    detail: payload?.detail ?? payload?.message ?? null,
    status: response.status,
    context,
    fallbackMessage,
    retryAfterSeconds: retryAfterToSeconds(response.headers.get('Retry-After')),
  })
}

export function wsPayloadToAppError(
  payload: unknown,
  context: AppErrorContext,
  fallbackMessage: string,
): AppError {
  const data = typeof payload === 'object' && payload !== null ? payload as AppErrorResponse : null
  return createAppError({
    code: data?.code,
    detail: data?.detail ?? data?.message ?? null,
    context,
    fallbackMessage,
  })
}

export function unknownToAppError(
  error: unknown,
  context: AppErrorContext,
  fallbackMessage: string,
): AppError {
  if (error instanceof AppError) return error
  const detail = error instanceof Error ? error.message : null
  return createAppError({
    code: looksLikeTransportError(detail) ? 'UNKNOWN' : 'USER_MESSAGE',
    detail,
    context,
    fallbackMessage,
  })
}
