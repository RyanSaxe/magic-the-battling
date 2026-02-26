import gzip
import json
import logging
import os
import time

from fastapi import WebSocket

logger = logging.getLogger(__name__)

WS_COMPRESSION_ENABLED = os.environ.get("MTB_COMPRESS_WS", "1") == "1"


class EgressTracker:
    def __init__(self, interval: float = 60.0):
        self._interval = interval
        self._raw_bytes = 0
        self._sent_bytes = 0
        self._message_count = 0
        self._last_log = time.monotonic()

    def record(self, raw: int, sent: int) -> None:
        self._raw_bytes += raw
        self._sent_bytes += sent
        self._message_count += 1
        now = time.monotonic()
        if now - self._last_log >= self._interval:
            self._flush(now)

    def _flush(self, now: float) -> None:
        if self._message_count == 0:
            self._last_log = now
            return
        saved = self._raw_bytes - self._sent_bytes
        ratio = (saved / self._raw_bytes * 100) if self._raw_bytes else 0
        logger.info(
            "WS egress: %d msgs, raw=%d KB, sent=%d KB, saved=%d KB (%.0f%%)",
            self._message_count,
            self._raw_bytes // 1024,
            self._sent_bytes // 1024,
            saved // 1024,
            ratio,
        )
        self._raw_bytes = 0
        self._sent_bytes = 0
        self._message_count = 0
        self._last_log = now


egress_tracker = EgressTracker()


async def send_ws(ws: WebSocket, message: dict) -> None:
    raw = json.dumps(message).encode()
    raw_size = len(raw)
    if WS_COMPRESSION_ENABLED:
        compressed = gzip.compress(raw)
        await ws.send_bytes(compressed)
        egress_tracker.record(raw_size, len(compressed))
    else:
        await ws.send_json(message)
        egress_tracker.record(raw_size, raw_size)
