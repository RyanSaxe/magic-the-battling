import os
import sys


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _env_int(name: str, default: int, *, min_value: int = 1) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        parsed = int(raw)
    except ValueError:
        return default
    return max(parsed, min_value)


def _env_float(name: str, default: float, *, min_value: float = 0.0) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        parsed = float(raw)
    except ValueError:
        return default
    return max(parsed, min_value)


def _env_str(name: str, default: str = "") -> str:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip()


def _is_local_dev() -> bool:
    if os.getenv("MTB_LOCAL_DEV") is not None:
        return _env_bool("MTB_LOCAL_DEV", False)

    env_name = _env_str("MTB_ENV").lower()
    if env_name in {"dev", "development", "local", "test"}:
        return True
    if env_name in {"prod", "production", "staging"}:
        return False

    return "pytest" in sys.modules


_DEFAULT_AUTH_SECRET_KEY = "local-dev-secret-key-change-before-production"
_BLOCKED_PRODUCTION_AUTH_SECRETS = {
    "dev-secret-change-in-production",
    _DEFAULT_AUTH_SECRET_KEY,
}


def _resolve_auth_secret_key() -> str:
    configured = _env_str("MTB_AUTH_SECRET_KEY")
    if configured:
        if not IS_LOCAL_DEV and configured in _BLOCKED_PRODUCTION_AUTH_SECRETS:
            raise RuntimeError("MTB_AUTH_SECRET_KEY must be set to a deployment-specific secret outside local dev")
        return configured

    if IS_LOCAL_DEV:
        return _DEFAULT_AUTH_SECRET_KEY

    raise RuntimeError("MTB_AUTH_SECRET_KEY must be set outside local development")


SNAPSHOT_INTERVAL_SEC = _env_float("MTB_SNAPSHOT_INTERVAL_SEC", 5.0, min_value=1.0)
IDLE_EVICT_MINUTES = _env_int("MTB_IDLE_EVICT_MINUTES", 20, min_value=1)
HOT_ACTION_WINDOW_MINUTES = _env_int("MTB_HOT_ACTION_WINDOW_MINUTES", 20, min_value=1)

MAX_HOT_GAMES = _env_int("MTB_MAX_HOT_GAMES", 250, min_value=1)
MAX_TOTAL_LOADED_GAMES_HARD = _env_int("MTB_MAX_TOTAL_LOADED_GAMES_HARD", 900, min_value=1)
MAX_PENDING_GAMES = _env_int("MTB_MAX_PENDING_GAMES", 400, min_value=1)
MAX_WS_CONNECTIONS = _env_int("MTB_MAX_WS_CONNECTIONS", 1800, min_value=1)
MAX_GAME_STARTS_IN_FLIGHT = _env_int("MTB_MAX_GAME_STARTS_IN_FLIGHT", 100, min_value=1)
MAX_GAME_START_QUEUE = _env_int("MTB_MAX_GAME_START_QUEUE", 2000, min_value=1)
MAX_BATTLER_PRELOADS_IN_FLIGHT = _env_int("MTB_MAX_BATTLER_PRELOADS_IN_FLIGHT", 12, min_value=1)

MAX_SESSIONS_TOTAL = _env_int("MTB_MAX_SESSIONS_TOTAL", 50_000, min_value=100)
SESSION_TTL_MINUTES = _env_int("MTB_SESSION_TTL_MINUTES", 24 * 60, min_value=1)

MAX_SPECTATE_REQUESTS_TOTAL = _env_int("MTB_MAX_SPECTATE_REQUESTS_TOTAL", 5_000, min_value=100)
SPECTATE_REQUEST_TTL_MINUTES = _env_int("MTB_SPECTATE_REQUEST_TTL_MINUTES", 30, min_value=1)

STALE_GAME_CLEANUP_HOURS = _env_int("MTB_STALE_GAME_CLEANUP_HOURS", 48, min_value=1)

OPS_API_TOKEN = os.getenv("MTB_OPS_TOKEN", "")
RESTORE_ACTIVE_GAME_SNAPSHOTS = _env_bool("MTB_RESTORE_ACTIVE_GAME_SNAPSHOTS", True)

IS_LOCAL_DEV = _is_local_dev()
AUTH_SECRET_KEY = _resolve_auth_secret_key()
AUTH_COOKIE_SECURE = not IS_LOCAL_DEV
AUTH_TOKEN_EXPIRE_HOURS = _env_int("MTB_AUTH_TOKEN_EXPIRE_HOURS", 168, min_value=1)
