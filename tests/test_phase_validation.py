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
            "battle_submit_result",
            "battle_update_card_state",
            "battle_update_life",
            "reward_pick_upgrade",
            "reward_apply_upgrade",
            "reward_done",
        }
        assert set(ACTION_REQUIRED_PHASES.keys()) == expected_actions


class TestPhaseValidationIntegration:
    def test_build_action_during_build_phase_succeeds(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws.receive_json()
            assert state["type"] == "game_state"
            assert state["payload"]["phase"] == "build"

            card = state["payload"]["self_player"]["hand"][0]
            ws.send_json(
                {
                    "action": "build_move",
                    "payload": {"card_id": card["id"], "source": "hand", "destination": "sideboard"},
                }
            )

            msg = ws.receive_json()
            assert msg["type"] == "game_state"

    def test_draft_action_during_build_phase_rejected(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws.receive_json()
            assert state["type"] == "game_state"
            assert state["payload"]["phase"] == "build"

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

            msg = ws.receive_json()
            assert msg["type"] == "error"
            assert "draft" in msg["payload"]["message"]
            assert "build" in msg["payload"]["message"]

    def test_battle_action_during_build_phase_rejected(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws.receive_json()
            assert state["payload"]["phase"] == "build"

            ws.send_json(
                {
                    "action": "battle_move",
                    "payload": {"card_id": "fake", "from_zone": "hand", "to_zone": "battlefield"},
                }
            )

            msg = ws.receive_json()
            assert msg["type"] == "error"
            assert "battle" in msg["payload"]["message"]
            assert "build" in msg["payload"]["message"]

    def test_reward_action_during_build_phase_rejected(self, client, game_with_players):
        game_id = game_with_players["game_id"]
        session_id = game_with_players["alice"]["session_id"]
        client.post(f"/api/games/{game_id}/start")

        with client.websocket_connect(f"/ws/{game_id}?session_id={session_id}") as ws:
            state = ws.receive_json()
            assert state["payload"]["phase"] == "build"

            ws.send_json(
                {
                    "action": "reward_pick_upgrade",
                    "payload": {"upgrade_id": "fake"},
                }
            )

            msg = ws.receive_json()
            assert msg["type"] == "error"
            assert "reward" in msg["payload"]["message"]
            assert "build" in msg["payload"]["message"]
