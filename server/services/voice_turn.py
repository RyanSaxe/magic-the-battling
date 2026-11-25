"""Cloudflare Calls TURN credential fetching with in-memory caching and STUN fallback."""

import logging
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from time import monotonic

import httpx

from server import runtime_config

logger = logging.getLogger(__name__)

type IceServer = dict[str, str | list[str]]

DEFAULT_ICE_SERVERS: list[IceServer] = [
    {"urls": "stun:stun.l.google.com:19302"},
    {"urls": "stun:stun1.l.google.com:19302"},
]

CLOUDFLARE_TURN_URL_TEMPLATE = "https://rtc.live.cloudflare.com/v1/turn/keys/{key_id}/credentials/generate-ice-servers"
CLOUDFLARE_REQUEST_TIMEOUT_SECONDS = 5.0
MAX_CACHE_TTL_SECONDS = 3600


@dataclass(frozen=True)
class _CachedIceServers:
    cache_key: tuple[str, int]
    ice_servers: tuple[IceServer, ...]
    expires_at: float


class IceServerCache:
    def __init__(self) -> None:
        self._entry: _CachedIceServers | None = None

    def get(self, cache_key: tuple[str, int], *, now: float) -> list[IceServer] | None:
        entry = self._entry
        if entry is None or entry.cache_key != cache_key or entry.expires_at <= now:
            return None
        return _copy_ice_servers(entry.ice_servers)

    def set(self, cache_key: tuple[str, int], ice_servers: Sequence[IceServer], *, expires_at: float) -> None:
        self._entry = _CachedIceServers(
            cache_key=cache_key,
            ice_servers=tuple(_copy_ice_servers(ice_servers)),
            expires_at=expires_at,
        )

    def clear(self) -> None:
        self._entry = None


ice_server_cache = IceServerCache()


def _copy_ice_servers(servers: Sequence[IceServer]) -> list[IceServer]:
    copied: list[IceServer] = []
    for server in servers:
        urls = server["urls"]
        entry: IceServer = {"urls": list(urls) if isinstance(urls, list) else urls}
        if "username" in server:
            entry["username"] = server["username"]
        if "credential" in server:
            entry["credential"] = server["credential"]
        copied.append(entry)
    return copied


def _parse_urls(raw_urls: object) -> str | list[str] | None:
    if isinstance(raw_urls, str) and raw_urls:
        return raw_urls
    if isinstance(raw_urls, list):
        urls = [item for item in raw_urls if isinstance(item, str) and item]
        if urls and len(urls) == len(raw_urls):
            return urls
    return None


def _parse_ice_server_entry(item: object) -> IceServer | None:
    if not isinstance(item, dict):
        return None
    urls = _parse_urls(item.get("urls"))
    if urls is None:
        return None
    entry: IceServer = {"urls": urls}
    username = item.get("username")
    if isinstance(username, str) and username:
        entry["username"] = username
    credential = item.get("credential")
    if isinstance(credential, str) and credential:
        entry["credential"] = credential
    return entry


def _parse_ice_servers(payload: object) -> list[IceServer] | None:
    if not isinstance(payload, dict):
        return None
    raw = payload.get("iceServers")
    if isinstance(raw, dict):
        items: list[object] = [raw]
    elif isinstance(raw, list):
        items = raw
    else:
        return None

    parsed = [entry for item in items if (entry := _parse_ice_server_entry(item)) is not None]
    return parsed or None


async def _post_cloudflare_turn(
    url: str,
    *,
    api_token: str,
    ttl_seconds: int,
    client: httpx.AsyncClient | None,
    transport: httpx.AsyncBaseTransport | None,
) -> httpx.Response:
    headers = {"Authorization": f"Bearer {api_token}"}
    body = {"ttl": ttl_seconds}
    if client is not None:
        return await client.post(
            url,
            headers=headers,
            json=body,
            timeout=CLOUDFLARE_REQUEST_TIMEOUT_SECONDS,
        )
    async with httpx.AsyncClient(
        transport=transport,
        timeout=CLOUDFLARE_REQUEST_TIMEOUT_SECONDS,
    ) as http_client:
        return await http_client.post(url, headers=headers, json=body)


async def fetch_ice_servers(
    *,
    key_id: str | None = None,
    api_token: str | None = None,
    ttl_seconds: int | None = None,
    client: httpx.AsyncClient | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
    now: Callable[[], float] = monotonic,
    cache: IceServerCache = ice_server_cache,
) -> list[IceServer]:
    resolved_key_id = runtime_config.CLOUDFLARE_TURN_KEY_ID if key_id is None else key_id
    resolved_api_token = runtime_config.CLOUDFLARE_TURN_API_TOKEN if api_token is None else api_token
    resolved_ttl = runtime_config.CLOUDFLARE_TURN_TTL_SECONDS if ttl_seconds is None else ttl_seconds

    if not resolved_key_id or not resolved_api_token:
        return _copy_ice_servers(DEFAULT_ICE_SERVERS)

    cache_key = (resolved_key_id, resolved_ttl)
    cached = cache.get(cache_key, now=now())
    if cached is not None:
        return cached

    url = CLOUDFLARE_TURN_URL_TEMPLATE.format(key_id=resolved_key_id)
    try:
        response = await _post_cloudflare_turn(
            url,
            api_token=resolved_api_token,
            ttl_seconds=resolved_ttl,
            client=client,
            transport=transport,
        )
        response.raise_for_status()
        payload: object = response.json()
    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Cloudflare TURN request failed with HTTP status %d; falling back to default STUN servers",
            exc.response.status_code,
        )
        return _copy_ice_servers(DEFAULT_ICE_SERVERS)
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(
            "Cloudflare TURN request failed (%s); falling back to default STUN servers",
            type(exc).__name__,
        )
        return _copy_ice_servers(DEFAULT_ICE_SERVERS)

    parsed = _parse_ice_servers(payload)
    if parsed is None:
        logger.warning("Cloudflare TURN response contained no valid ICE servers; falling back to default STUN servers")
        return _copy_ice_servers(DEFAULT_ICE_SERVERS)

    cache_ttl = min(resolved_ttl // 2, MAX_CACHE_TTL_SECONDS)
    if cache_ttl > 0:
        cache.set(cache_key, parsed, expires_at=now() + cache_ttl)
    return _copy_ice_servers(parsed)
