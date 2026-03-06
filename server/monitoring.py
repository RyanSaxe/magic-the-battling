import asyncio
import json
import logging
import resource
import sys

from server.observability import flush_latency_metrics
from server.routers.ws import connection_manager
from server.runtime_config import MAX_SESSIONS_TOTAL, SESSION_TTL_MINUTES
from server.services.game_manager import game_manager
from server.services.ops_manager import ops_manager
from server.services.session_manager import session_manager

logger = logging.getLogger(__name__)

_task: asyncio.Task | None = None

INTERVAL_SECONDS = 60


async def _monitor_loop() -> None:
    while True:
        await asyncio.sleep(INTERVAL_SECONDS)

        games = len(game_manager._active_games)
        hot_games = game_manager.hot_games_count()
        pending = len(game_manager._pending_games)
        connections = sum(len(v) for v in connection_manager._connections.values())
        spectators = sum(
            len(ws_list) for targets in connection_manager._spectators.values() for ws_list in targets.values()
        )
        sessions = session_manager.size()
        rss = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        mem_mb = rss // (1024 * 1024) if sys.platform == "darwin" else rss // 1024
        mode = ops_manager.get_snapshot().mode
        removed_sessions = session_manager.cleanup(SESSION_TTL_MINUTES, MAX_SESSIONS_TOTAL)

        logger.info(
            (
                "Server status: mode=%s games=%d hot_games=%d pending=%d "
                "connections=%d spectators=%d sessions=%d memory=%d MB cleaned_sessions=%d"
            ),
            mode,
            games,
            hot_games,
            pending,
            connections,
            spectators,
            sessions,
            mem_mb,
            removed_sessions,
        )

        latency = flush_latency_metrics()
        logger.info("Latency summary: %s", json.dumps(latency, sort_keys=True))


def start_monitoring() -> None:
    global _task
    _task = asyncio.create_task(_monitor_loop())
    logger.info("Started periodic monitoring (every %ds)", INTERVAL_SECONDS)


def stop_monitoring() -> None:
    global _task
    if _task is not None:
        _task.cancel()
        _task = None
