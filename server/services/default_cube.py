"""Background preloading and caching of the default cube."""

import logging
import threading
from time import perf_counter

from pitfight.models.cards import DEFAULT_BATTLER_ID, DEFAULT_UPGRADES_ID, build_battler

logger = logging.getLogger(__name__)


def start_loading_default_cube() -> threading.Thread:
    # A daemon thread rather than the loop's executor, whose shutdown waits for a fetch that's hanging.
    thread = threading.Thread(target=_load_default_cube, name="default-cube", daemon=True)
    thread.start()
    return thread


def _load_default_cube() -> None:
    start = perf_counter()
    try:
        build_battler(DEFAULT_BATTLER_ID, DEFAULT_UPGRADES_ID)
    except Exception as exc:  # noqa: BLE001 -- broad boundary catch
        logger.warning("Could not load the default cube at startup, so the first game will load it: %r", exc)
        return
    logger.info("Loaded the default cube at startup in %.1fs", perf_counter() - start)
