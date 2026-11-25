"""How each in-game WebSocket action maps onto the game manager: its required phase and the call it makes.

The tables take the manager as part of each request rather than importing one, so the router decides which
manager runs the action.
"""

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

import server.db.database as db
from mtb.models.game import Game, Player
from server.services.game.manager import GameManager

type ActionResult = bool | str | None

ACTION_REQUIRED_PHASES: dict[str, str] = {
    "draft_swap": "draft",
    "draft_roll": "draft",
    "draft_done": "draft",
    "build_move": "build",
    "build_swap": "build",
    "build_set_basics": "build",
    "build_ready": "build",
    "build_unready": "build",
    "build_apply_upgrade": "build",
    "build_set_companion": "build",
    "build_remove_companion": "build",
    "battle_move": "battle",
    "battle_reveal_upgrade": "battle",
    "battle_submit_result": "battle",
    "battle_update_card_state": "battle",
    "battle_update_life": "battle",
    "battle_pass_turn": "battle",
    "reward_apply_upgrade": "reward",
    "reward_done": "reward",
}


@dataclass(frozen=True)
class GameActionRequest:
    manager: GameManager
    game: Game
    player: Player
    payload: dict[str, Any]
    game_id: str


def validate_action_phase(action: str, player: Player) -> str | None:
    required_phase = ACTION_REQUIRED_PHASES.get(action)
    if required_phase is None:
        return None
    if player.phase != required_phase:
        return f"Cannot {action}: player is in {player.phase} phase, requires {required_phase}"
    return None


def _with_db_session(run: Callable[[Session], ActionResult]) -> ActionResult:
    db_session = db.SessionLocal()
    try:
        return run(db_session)
    finally:
        db_session.close()


_GAME_ACTIONS: dict[str, Callable[[GameActionRequest], ActionResult]] = {
    "draft_swap": lambda r: r.manager.handle_draft_swap(
        r.game,
        r.player,
        pack_card_id=r.payload["pack_card_id"],
        player_card_id=r.payload["player_card_id"],
        destination=r.payload["destination"],
    ),
    "draft_roll": lambda r: r.manager.handle_draft_roll(r.game, r.player),
    "draft_done": lambda r: r.manager.handle_draft_done(r.game, r.player),
    "build_move": lambda r: r.manager.handle_build_move(
        r.player,
        r.payload["card_id"],
        source=r.payload["source"],
        destination=r.payload["destination"],
        slot=r.payload.get("slot"),
    ),
    "build_swap": lambda r: r.manager.handle_build_swap(
        r.player,
        r.payload["card_a_id"],
        source_a=r.payload["source_a"],
        card_b_id=r.payload["card_b_id"],
        source_b=r.payload["source_b"],
    ),
    "build_set_basics": lambda r: r.manager.handle_build_set_basics(r.game, r.player, basics=r.payload["basics"]),
    "build_ready": lambda r: _with_db_session(
        lambda db_session: r.manager.handle_build_ready(
            r.game,
            r.player,
            basics=r.payload["basics"],
            game_id=r.game_id,
            db=db_session,
            play_draw_preference=r.payload.get("play_draw_preference", "play"),
            hand_order=r.payload.get("hand_order"),
        )
    ),
    "build_unready": lambda r: r.manager.handle_build_unready(r.player),
    "build_apply_upgrade": lambda r: r.manager.handle_build_apply_upgrade(
        r.player, r.payload["upgrade_id"], target_card_id=r.payload["target_card_id"]
    ),
    "build_set_companion": lambda r: r.manager.handle_build_set_companion(r.player, r.payload["card_id"]),
    "build_remove_companion": lambda r: r.manager.handle_build_remove_companion(r.player),
    "battle_move": lambda r: r.manager.handle_battle_move(
        r.game,
        r.player,
        card_id=r.payload["card_id"],
        from_zone=r.payload["from_zone"],
        to_zone=r.payload["to_zone"],
        from_owner=r.payload.get("from_owner", "player"),
        to_owner=r.payload.get("to_owner", "player"),
    ),
    "battle_reveal_upgrade": lambda r: r.manager.handle_battle_reveal_upgrade(
        r.game, r.player, upgrade_id=r.payload["upgrade_id"]
    ),
    "battle_submit_result": lambda r: _with_db_session(
        lambda db_session: r.manager.handle_battle_submit_result(
            r.game, r.player, result=r.payload["result"], game_id=r.game_id, db=db_session
        )
    ),
    "battle_update_card_state": lambda r: r.manager.handle_battle_update_card_state(
        r.game, r.player, action_type=r.payload["action_type"], card_id=r.payload["card_id"], data=r.payload.get("data")
    ),
    "battle_update_life": lambda r: r.manager.handle_battle_update_life(
        r.game, r.player, target=r.payload["target"], life=r.payload["life"]
    ),
    "battle_pass_turn": lambda r: r.manager.handle_battle_pass_turn(r.game, r.player),
    "reward_apply_upgrade": lambda r: r.manager.handle_reward_apply_upgrade(
        r.player, r.payload["upgrade_id"], target_card_id=r.payload["target_card_id"]
    ),
    "reward_done": lambda r: _with_db_session(
        lambda db_session: r.manager.handle_reward_done(
            r.game, r.player, upgrade_id=r.payload.get("upgrade_id"), game_id=r.game_id, db=db_session
        )
    ),
}


def dispatch_game_action(action: str, request: GameActionRequest) -> ActionResult:
    run = _GAME_ACTIONS.get(action)
    if run is None:
        return False
    return run(request)
