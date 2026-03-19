"""Tests for phase validation in WebSocket message handling."""

import pytest

from mtb.models.game import Player
from server.routers.ws import ACTION_REQUIRED_PHASES, _validate_action_phase


class TestValidateActionPhase:
    @pytest.fixture
    def player(self):
        return Player(name="TestPlayer", phase="build")

    @pytest.mark.parametrize(
        ("action", "phase"),
        [
            ("draft_swap", "draft"),
            ("draft_roll", "draft"),
            ("draft_done", "draft"),
            ("build_move", "build"),
            ("build_swap", "build"),
            ("build_ready", "build"),
            ("build_unready", "build"),
            ("build_apply_upgrade", "build"),
            ("battle_move", "battle"),
            ("battle_reveal_upgrade", "battle"),
            ("battle_submit_result", "battle"),
            ("battle_update_card_state", "battle"),
            ("battle_update_life", "battle"),
            ("reward_pick_upgrade", "reward"),
            ("reward_apply_upgrade", "reward"),
            ("reward_done", "reward"),
        ],
    )
    def test_action_accepts_correct_phase(self, action, phase):
        player = Player(name="Test", phase=phase)
        assert _validate_action_phase(action, player) is None

    @pytest.mark.parametrize(
        ("action", "required_phase", "wrong_phase"),
        [
            ("draft_swap", "draft", "build"),
            ("draft_roll", "draft", "battle"),
            ("draft_done", "draft", "reward"),
            ("build_move", "build", "draft"),
            ("build_swap", "build", "battle"),
            ("build_ready", "build", "draft"),
            ("build_apply_upgrade", "build", "battle"),
            ("battle_move", "battle", "build"),
            ("battle_reveal_upgrade", "battle", "build"),
            ("battle_submit_result", "battle", "draft"),
            ("reward_pick_upgrade", "reward", "build"),
            ("reward_done", "reward", "draft"),
        ],
    )
    def test_action_rejects_wrong_phase(self, action, required_phase, wrong_phase):
        player = Player(name="Test", phase=wrong_phase)
        error = _validate_action_phase(action, player)
        assert error is not None
        assert required_phase in error
        assert wrong_phase in error
        assert action in error

    def test_unknown_action_returns_none(self, player):
        assert _validate_action_phase("unknown_action", player) is None
        assert _validate_action_phase("set_ready", player) is None
        assert _validate_action_phase("start_game", player) is None

    def test_action_required_phases_covers_all_game_actions(self):
        expected_actions = {
            "draft_swap",
            "draft_roll",
            "draft_done",
            "build_move",
            "build_swap",
            "build_ready",
            "build_unready",
            "build_apply_upgrade",
            "build_set_companion",
            "build_remove_companion",
            "battle_move",
            "battle_reveal_upgrade",
            "battle_submit_result",
            "battle_update_card_state",
            "battle_update_life",
            "battle_pass_turn",
            "reward_pick_upgrade",
            "reward_apply_upgrade",
            "reward_done",
        }
        assert set(ACTION_REQUIRED_PHASES.keys()) == expected_actions


class TestPhaseValidationIntegration:
    def test_build_action_during_build_phase_succeeds(
        self, client, game_with_players, ws_receive_json, ws_receive_json_until
    ):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws_receive_json(ws)
            assert state["type"] == "game_bootstrap"
            assert state["payload"]["state"]["phase"] == "build"

            card = state["payload"]["state"]["self_player"]["sideboard"][0]
            ws.send_json(
                {
                    "action": "build_move",
                    "payload": {"card_id": card["id"], "source": "sideboard", "destination": "hand"},
                }
            )

            msg = ws_receive_json_until(
                ws,
                lambda message: message["type"] == "game_state",
                description="game_state after build action",
            )
            assert msg["type"] == "game_state"

    def test_build_move_rejects_second_rapid_move_when_one_slot_open(
        self, client, game_with_players, ws_receive_json, ws_receive_json_until
    ):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            bootstrap = ws_receive_json(ws)
            assert bootstrap["type"] == "game_bootstrap"
            state = bootstrap["payload"]["state"]
            hand_size = state["self_player"]["hand_size"]

            # Fill to one open hand slot.
            for _ in range(hand_size - 1):
                card = state["self_player"]["sideboard"][0]
                ws.send_json(
                    {
                        "action": "build_move",
                        "payload": {"card_id": card["id"], "source": "sideboard", "destination": "hand"},
                    }
                )
                msg = ws_receive_json_until(
                    ws,
                    lambda message: message["type"] == "game_state",
                    description="game_state after build_move",
                )
                state = msg["payload"]

            sideboard = state["self_player"]["sideboard"]
            assert len(sideboard) >= 2
            first_card_id = sideboard[0]["id"]
            second_card_id = sideboard[1]["id"]
            baseline_sideboard_count = len(sideboard)

            # Send two moves back-to-back with only one open slot remaining.
            ws.send_json(
                {
                    "action": "build_move",
                    "payload": {"card_id": first_card_id, "source": "sideboard", "destination": "hand"},
                }
            )
            ws.send_json(
                {
                    "action": "build_move",
                    "payload": {"card_id": second_card_id, "source": "sideboard", "destination": "hand"},
                }
            )

            saw_game_state = None
            saw_error = None
            for _ in range(4):
                message = ws_receive_json(ws)
                if message["type"] == "game_state":
                    saw_game_state = message
                elif message["type"] == "error":
                    saw_error = message
                if saw_game_state and saw_error:
                    break

            assert saw_game_state is not None
            assert saw_error is not None
            assert "Hand is full" in saw_error["payload"]["message"]

            final_self = saw_game_state["payload"]["self_player"]
            assert len(final_self["hand"]) == hand_size
            assert len(final_self["sideboard"]) == baseline_sideboard_count - 1

    def test_draft_action_during_build_phase_rejected(
        self, client, game_with_players, ws_receive_json, ws_receive_json_until
    ):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws_receive_json(ws)
            assert state["type"] == "game_bootstrap"
            assert state["payload"]["state"]["phase"] == "build"

            ws.send_json(
                {
                    "action": "draft_swap",
                    "payload": {
                        "pack_card_id": "fake",
                        "player_card_id": "fake",
                        "destination": "hand",
                    },
                }
            )

            msg = ws_receive_json_until(
                ws,
                lambda message: message["type"] == "error",
                description="phase validation error for draft action",
            )
            assert msg["type"] == "error"
            assert "draft" in msg["payload"]["message"]
            assert "build" in msg["payload"]["message"]

    def test_battle_action_during_build_phase_rejected(
        self, client, game_with_players, ws_receive_json, ws_receive_json_until
    ):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws_receive_json(ws)
            assert state["payload"]["state"]["phase"] == "build"

            ws.send_json(
                {
                    "action": "battle_move",
                    "payload": {"card_id": "fake", "from_zone": "hand", "to_zone": "battlefield"},
                }
            )

            msg = ws_receive_json_until(
                ws,
                lambda message: message["type"] == "error",
                description="phase validation error for battle action",
            )
            assert msg["type"] == "error"
            assert "battle" in msg["payload"]["message"]
            assert "build" in msg["payload"]["message"]

    def test_reward_action_during_build_phase_rejected(
        self, client, game_with_players, ws_receive_json, ws_receive_json_until
    ):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws_receive_json(ws)
            assert state["payload"]["state"]["phase"] == "build"

            ws.send_json(
                {
                    "action": "reward_pick_upgrade",
                    "payload": {"upgrade_id": "fake"},
                }
            )

            msg = ws_receive_json_until(
                ws,
                lambda message: message["type"] == "error",
                description="phase validation error for reward action",
            )
            assert msg["type"] == "error"
            assert "reward" in msg["payload"]["message"]
            assert "build" in msg["payload"]["message"]
