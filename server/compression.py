import asyncio
import gzip
import json
import logging
import os

from fastapi import WebSocket

logger = logging.getLogger(__name__)

WS_COMPRESSION_ENABLED = os.environ.get("MTB_COMPRESS_WS", "1") == "1"


class RoundEgressTracker:
    def __init__(self):
        self._data: dict[tuple[str, str], dict[str, int]] = {}

    def record(self, game_id: str, player_name: str, phase: str, raw_bytes: int, *, spectator: bool = False):
        key = (game_id, player_name)
        if key not in self._data:
            self._data[key] = {"draft": 0, "build": 0, "battle": 0, "spectate": 0}
        if spectator:
            self._data[key]["spectate"] += raw_bytes
        elif phase in ("draft", "build", "battle"):
            self._data[key][phase] += raw_bytes

    def flush(self, game_id: str, player_name: str, stage: int, round_num: int):
        key = (game_id, player_name)
        data = self._data.pop(key, None)
        if not data:
            return
        logger.info(
            "Round egress: game=%s player=%s stage=%d round=%d draft=%d KB build=%d KB battle=%d KB spectate=%d KB",
            game_id,
            player_name,
            stage,
            round_num,
            data["draft"] // 1024,
            data["build"] // 1024,
            data["battle"] // 1024,
            data["spectate"] // 1024,
        )


round_egress_tracker = RoundEgressTracker()


async def send_ws(ws: WebSocket, message: dict, *, spectator: bool = False) -> None:
    raw = json.dumps(message).encode()
    raw_size = len(raw)
    if WS_COMPRESSION_ENABLED:
        compressed = await asyncio.to_thread(gzip.compress, raw)
        await ws.send_bytes(compressed)
    else:
        await ws.send_json(message)

    if message.get("type") == "game_state":
        payload = message.get("payload", {})
        game_id = payload.get("game_id", "")
        self_player = payload.get("self_player", {})
        player_name = self_player.get("name", "")
        phase = self_player.get("phase", "")

        if phase == "reward" and not spectator:
            round_egress_tracker.flush(
                game_id,
                player_name,
                self_player.get("stage", 0),
                self_player.get("round", 0),
            )
        else:
            round_egress_tracker.record(game_id, player_name, phase, raw_size, spectator=spectator)
