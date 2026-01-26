from collections import defaultdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

import server.db.database as db
from server.services.game_manager import game_manager
from server.services.session_manager import session_manager

router = APIRouter()

ACTION_REQUIRED_PHASES: dict[str, str] = {
    "draft_swap": "draft",
    "draft_roll": "draft",
    "draft_done": "draft",
    "build_move": "build",
    "build_swap": "build",
    "build_ready": "build",
    "build_unready": "build",
    "build_apply_upgrade": "build",
    "battle_move": "battle",
    "battle_submit_result": "battle",
    "battle_update_card_state": "battle",
    "battle_update_life": "battle",
    "reward_pick_upgrade": "reward",
    "reward_apply_upgrade": "reward",
    "reward_done": "reward",
}


class ConnectionManager:
    def __init__(self):
        self._connections: dict[str, dict[str, WebSocket]] = defaultdict(dict)

    async def connect(self, game_id: str, player_id: str, websocket: WebSocket):
        await websocket.accept()
        self._connections[game_id][player_id] = websocket

    def disconnect(self, game_id: str, player_id: str):
        if game_id in self._connections:
            self._connections[game_id].pop(player_id, None)
            if not self._connections[game_id]:
                del self._connections[game_id]

    async def broadcast_game_state(self, game_id: str):
        if game_id not in self._connections:
            return

        for player_id, websocket in list(self._connections[game_id].items()):
            state = game_manager.get_game_state(game_id, player_id)
            if state:
                try:
                    await websocket.send_json(
                        {
                            "type": "game_state",
                            "payload": state.model_dump(),
                        }
                    )
                except Exception:
                    self.disconnect(game_id, player_id)

    async def broadcast_lobby_state(self, game_id: str):
        if game_id not in self._connections:
            return

        lobby = game_manager.get_lobby_state(game_id)
        if not lobby:
            return

        for player_id, websocket in list(self._connections[game_id].items()):
            try:
                await websocket.send_json(
                    {
                        "type": "lobby_state",
                        "payload": lobby.model_dump(),
                    }
                )
            except Exception:
                self.disconnect(game_id, player_id)

    async def send_error(self, websocket: WebSocket, message: str):
        await websocket.send_json(
            {
                "type": "error",
                "payload": {"message": message},
            }
        )

    async def broadcast_game_over(self, game_id: str, winner_name: str | None):
        if game_id not in self._connections:
            return

        for player_id, websocket in list(self._connections[game_id].items()):
            state = game_manager.get_game_state(game_id, player_id)
            if state:
                try:
                    await websocket.send_json(
                        {
                            "type": "game_over",
                            "payload": {"winner_name": winner_name},
                        }
                    )
                    await websocket.send_json(
                        {
                            "type": "game_state",
                            "payload": state.model_dump(),
                        }
                    )
                except Exception:
                    self.disconnect(game_id, player_id)


connection_manager = ConnectionManager()


@router.websocket("/ws/{game_id}")
async def websocket_endpoint(websocket: WebSocket, game_id: str, session_id: str):
    session = session_manager.get_session(session_id)
    if not session:
        await websocket.close(code=4001, reason="Invalid session")
        return

    player_id = session.player_id

    pending = game_manager.get_pending_game(game_id)
    game = game_manager.get_game(game_id)

    if not pending and not game:
        await websocket.close(code=4004, reason="Game not found")
        return

    await connection_manager.connect(game_id, player_id, websocket)

    try:
        if pending and not pending.is_started:
            await connection_manager.broadcast_lobby_state(game_id)
        elif game:
            state = game_manager.get_game_state(game_id, player_id)
            if state:
                await websocket.send_json(
                    {
                        "type": "game_state",
                        "payload": state.model_dump(),
                    }
                )

        while True:
            data = await websocket.receive_json()
            await handle_message(game_id, player_id, data, websocket)

    except WebSocketDisconnect:
        connection_manager.disconnect(game_id, player_id)
        await connection_manager.broadcast_lobby_state(game_id)


def _validate_action_phase(action: str, player) -> str | None:
    """Returns error message if action invalid for player's phase, None if valid."""
    required_phase = ACTION_REQUIRED_PHASES.get(action)
    if required_phase is None:
        return None
    if player.phase != required_phase:
        return f"Cannot {action}: player is in {player.phase} phase, requires {required_phase}"
    return None


async def _handle_lobby_action(action: str, payload: dict, game_id: str, player_id: str, websocket: WebSocket) -> bool:
    if action == "set_ready":
        is_ready = payload.get("is_ready", True)
        if game_manager.set_player_ready(game_id, player_id, is_ready):
            await connection_manager.broadcast_lobby_state(game_id)
        else:
            await connection_manager.send_error(websocket, "Failed to set ready state")
        return True

    if action == "start_game":
        can_start, error = game_manager.can_start_game(game_id, player_id)
        if not can_start:
            await connection_manager.send_error(websocket, error or "Cannot start game")
            return True

        db_session = db.SessionLocal()
        try:
            result = await game_manager.start_game_async(game_id, db_session)
        finally:
            db_session.close()

        if result:
            await connection_manager.broadcast_game_state(game_id)
        else:
            await connection_manager.send_error(websocket, "Failed to start game")
        return True

    return False


def _dispatch_game_action(action: str, payload: dict, game, player, game_id: str) -> bool | str | None:  # noqa: PLR0912
    match action:
        case "draft_swap":
            return game_manager.handle_draft_swap(
                game, player, payload["pack_card_id"], payload["player_card_id"], payload["destination"]
            )
        case "draft_roll":
            return game_manager.handle_draft_roll(game, player)
        case "draft_done":
            return game_manager.handle_draft_done(game, player)
        case "build_move":
            return game_manager.handle_build_move(player, payload["card_id"], payload["source"], payload["destination"])
        case "build_swap":
            return game_manager.handle_build_swap(
                player,
                payload["card_a_id"],
                payload["source_a"],
                payload["card_b_id"],
                payload["source_b"],
            )
        case "build_ready":
            db_session = db.SessionLocal()
            try:
                return game_manager.handle_build_ready(game, player, payload["basics"], game_id, db_session)
            finally:
                db_session.close()
        case "build_unready":
            return game_manager.handle_build_unready(player)
        case "build_apply_upgrade":
            return game_manager.handle_build_apply_upgrade(player, payload["upgrade_id"], payload["target_card_id"])
        case "battle_move":
            return game_manager.handle_battle_move(
                game, player, payload["card_id"], payload["from_zone"], payload["to_zone"]
            )
        case "battle_submit_result":
            db_session = db.SessionLocal()
            try:
                return game_manager.handle_battle_submit_result(game, player, payload["result"], game_id, db_session)
            finally:
                db_session.close()
        case "battle_update_card_state":
            return game_manager.handle_battle_update_card_state(
                game, player, payload["action_type"], payload["card_id"], payload.get("data")
            )
        case "battle_update_life":
            return game_manager.handle_battle_update_life(game, player, payload["target"], payload["life"])
        case "reward_pick_upgrade":
            return game_manager.handle_reward_pick_upgrade(game, player, payload["upgrade_id"])
        case "reward_apply_upgrade":
            return game_manager.handle_reward_apply_upgrade(player, payload["upgrade_id"], payload["target_card_id"])
        case "reward_done":
            db_session = db.SessionLocal()
            try:
                return game_manager.handle_reward_done(game, player, payload.get("upgrade_id"), game_id, db_session)
            finally:
                db_session.close()
        case _:
            return False


async def handle_message(game_id: str, player_id: str, data: dict, websocket: WebSocket):
    action = data.get("action", "")
    payload = data.get("payload", {})

    if await _handle_lobby_action(action, payload, game_id, player_id, websocket):
        return

    game = game_manager.get_game(game_id)
    if not game:
        await connection_manager.send_error(websocket, "Game not started")
        return

    player = game_manager.get_player(game, player_id)
    if not player:
        await connection_manager.send_error(websocket, "Player not found in game")
        return

    phase_error = _validate_action_phase(action, player)
    if phase_error:
        await connection_manager.send_error(websocket, phase_error)
        return

    result = _dispatch_game_action(action, payload, game, player, game_id)

    if result is False:
        await connection_manager.send_error(websocket, f"Unknown action: {action}")
    elif result == "game_over":
        winners = [p for p in game.players if p.phase == "winner"]
        winner_name = winners[0].name if winners else None
        await connection_manager.broadcast_game_over(game_id, winner_name)
    elif result is True or result is None:
        await connection_manager.broadcast_game_state(game_id)
    elif isinstance(result, str):
        await connection_manager.send_error(websocket, result)
    else:
        await connection_manager.send_error(websocket, f"Failed to execute action: {action}")
