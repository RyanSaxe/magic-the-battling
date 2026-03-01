import json
import logging
import math
import os
import threading
from collections import Counter
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

OBSERVABILITY_LOGGER_NAME = "server.observability"
_TEXT_LOG_FORMAT = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"


class JsonLineFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname.lower(),
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=True)


def _resolve_log_directory() -> Path:
    if db_path := os.getenv("DATABASE_PATH"):
        return Path(db_path).parent / "logs"
    return Path(__file__).resolve().parent.parent / "data" / "logs"


def configure_logging() -> None:
    if getattr(configure_logging, "_configured", False):
        return

    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers.clear()

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(logging.INFO)
    stream_handler.setFormatter(logging.Formatter(_TEXT_LOG_FORMAT))
    root.addHandler(stream_handler)

    log_dir = _resolve_log_directory()
    log_dir.mkdir(parents=True, exist_ok=True)
    file_handler = RotatingFileHandler(
        log_dir / "server.jsonl",
        maxBytes=20 * 1024 * 1024,
        backupCount=5,
    )
    file_handler.setLevel(logging.INFO)
    file_handler.setFormatter(JsonLineFormatter())
    root.addHandler(file_handler)

    configure_logging._configured = True  # type: ignore[attr-defined]
    logging.getLogger(OBSERVABILITY_LOGGER_NAME).info(
        "Configured logging with persistent JSON logs at %s", log_dir / "server.jsonl"
    )


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = max(0, min(len(ordered) - 1, math.ceil((percentile / 100.0) * len(ordered)) - 1))
    return round(ordered[idx], 2)


def _summarize_samples(samples: list[dict[str, Any]], bucket_field: str | None = None) -> dict[str, Any]:
    durations = [float(sample["duration_ms"]) for sample in samples]
    summary: dict[str, Any] = {
        "count": len(durations),
        "avg_ms": round(sum(durations) / len(durations), 2) if durations else None,
        "p50_ms": _percentile(durations, 50),
        "p95_ms": _percentile(durations, 95),
        "p99_ms": _percentile(durations, 99),
        "max_ms": round(max(durations), 2) if durations else None,
    }
    if bucket_field:
        bucket_counts = Counter(str(sample.get(bucket_field, "unknown")) for sample in samples)
        summary["top_buckets"] = dict(bucket_counts.most_common(8))
    return summary


class LatencyRecorder:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._http_samples: list[dict[str, Any]] = []
        self._ws_action_samples: list[dict[str, Any]] = []
        self._ws_broadcast_samples: list[dict[str, Any]] = []

    def record_http(self, method: str, path: str, status: int, duration_ms: float) -> None:
        with self._lock:
            self._http_samples.append(
                {
                    "method": method,
                    "path": path,
                    "status": status,
                    "duration_ms": round(duration_ms, 2),
                    "bucket": f"{method} {path} {status}",
                }
            )

    def record_ws_action(self, action: str, game_id: str, duration_ms: float) -> None:
        with self._lock:
            self._ws_action_samples.append(
                {
                    "action": action,
                    "game_id": game_id,
                    "duration_ms": round(duration_ms, 2),
                }
            )

    def record_ws_broadcast(
        self,
        kind: str,
        game_id: str,
        duration_ms: float,
        recipients: int,
        spectators: int,
    ) -> None:
        with self._lock:
            self._ws_broadcast_samples.append(
                {
                    "kind": kind,
                    "game_id": game_id,
                    "duration_ms": round(duration_ms, 2),
                    "recipients": recipients,
                    "spectators": spectators,
                }
            )

    def flush(self) -> dict[str, Any]:
        with self._lock:
            http = self._http_samples
            ws_action = self._ws_action_samples
            ws_broadcast = self._ws_broadcast_samples
            self._http_samples = []
            self._ws_action_samples = []
            self._ws_broadcast_samples = []

        return {
            "http": _summarize_samples(http, bucket_field="bucket"),
            "ws_action": _summarize_samples(ws_action, bucket_field="action"),
            "ws_broadcast": _summarize_samples(ws_broadcast, bucket_field="kind"),
            "ws_broadcast_recipients_total": sum(int(sample["recipients"]) for sample in ws_broadcast),
            "ws_broadcast_spectators_total": sum(int(sample["spectators"]) for sample in ws_broadcast),
        }


_latency_recorder = LatencyRecorder()


def record_http_latency(method: str, path: str, status: int, duration_ms: float) -> None:
    _latency_recorder.record_http(method, path, status, duration_ms)


def record_ws_action_latency(action: str, game_id: str, duration_ms: float) -> None:
    _latency_recorder.record_ws_action(action, game_id, duration_ms)


def record_ws_broadcast_latency(
    kind: str,
    game_id: str,
    duration_ms: float,
    recipients: int,
    spectators: int,
) -> None:
    _latency_recorder.record_ws_broadcast(kind, game_id, duration_ms, recipients, spectators)


def flush_latency_metrics() -> dict[str, Any]:
    return _latency_recorder.flush()
