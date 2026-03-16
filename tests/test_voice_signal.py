"""Tests for voice signal relay — routing, bot filtering, and no-battle rejection."""

from unittest.mock import AsyncMock, patch

import pytest

from mtb.models.cards import Battler, Card
from mtb.models.game import StaticOpponent, create_game, set_battler
from mtb.phases import battle
from server.routers.ws import _handle_voice_signal
from server.services.game_manager import GameManager


@pytest.fixture
def anyio_backend():
    return "asyncio"


def _make_battler() -> Battler:
    cards = [Card(name=f"c{i}", image_url="img", id=f"c{i}", type_line="Creature") for i in range(80)]
    return Battler(cards=cards, upgrades=[], vanguards=[])


@pytest.fixture
def gm():
    return GameManager()


@pytest.fixture
def pvp_battle(gm):
    game = create_game(["Alice", "Bob"], num_players=2)
    set_battler(game, _make_battler())
    alice, bob = game.players
    alice.phase = "battle"
    bob.phase = "battle"
    alice.chosen_basics = ["Plains", "Island", "Mountain"]
    bob.chosen_basics = ["Plains", "Island", "Mountain"]
    battle.start(game, alice, bob)

    game_id = "test-game"
    gm._active_games[game_id] = game
    gm._player_id_to_name["alice-id"] = "Alice"
    gm._player_id_to_name["bob-id"] = "Bob"
    gm._player_to_game["alice-id"] = game_id
    gm._player_to_game["bob-id"] = game_id
    return game_id


@pytest.fixture
def bot_battle(gm):
    game = create_game(["Alice"], num_players=1)
    set_battler(game, _make_battler())
    alice = game.players[0]
    alice.phase = "battle"
    alice.chosen_basics = ["Plains", "Island", "Mountain"]

    static_opp = StaticOpponent(
        name="Bot",
        hand=[],
        chosen_basics=["Plains", "Island", "Mountain"],
        hand_revealed=True,
        is_ghost=False,
    )
    battle.start(game, alice, static_opp)

    game_id = "test-bot-game"
    gm._active_games[game_id] = game
    gm._player_id_to_name["alice-id"] = "Alice"
    gm._player_to_game["alice-id"] = game_id
    return game_id


class TestGetBattleOpponentName:
    def test_pvp_returns_opponent_for_player(self, gm, pvp_battle):
        assert gm.get_battle_opponent_name(pvp_battle, "alice-id") == "Bob"

    def test_pvp_returns_opponent_for_other_player(self, gm, pvp_battle):
        assert gm.get_battle_opponent_name(pvp_battle, "bob-id") == "Alice"

    def test_bot_battle_returns_none(self, gm, bot_battle):
        assert gm.get_battle_opponent_name(bot_battle, "alice-id") is None

    def test_no_battle_returns_none(self, gm):
        game = create_game(["Alice"], num_players=1)
        gm._active_games["idle-game"] = game
        gm._player_id_to_name["alice-id"] = "Alice"
        gm._player_to_game["alice-id"] = "idle-game"
        assert gm.get_battle_opponent_name("idle-game", "alice-id") is None

    def test_unknown_player_returns_none(self, gm, pvp_battle):
        assert gm.get_battle_opponent_name(pvp_battle, "unknown-id") is None

    def test_unknown_game_returns_none(self, gm):
        assert gm.get_battle_opponent_name("no-such-game", "alice-id") is None


class TestHandleVoiceSignal:
    @pytest.mark.anyio
    async def test_relays_signal_to_opponent(self, gm, pvp_battle):
        mock_cm = AsyncMock()
        with (
            patch("server.routers.ws.game_manager", gm),
            patch("server.routers.ws.connection_manager", mock_cm),
        ):
            await _handle_voice_signal(
                pvp_battle,
                "alice-id",
                {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                },
            )

        mock_cm.send_to_player.assert_awaited_once_with(
            pvp_battle,
            "bob-id",
            {
                "type": "voice_signal",
                "payload": {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                    "from_player": "Alice",
                },
            },
        )

    @pytest.mark.anyio
    async def test_drops_signal_for_bot_battle(self, gm, bot_battle):
        mock_cm = AsyncMock()
        with (
            patch("server.routers.ws.game_manager", gm),
            patch("server.routers.ws.connection_manager", mock_cm),
        ):
            await _handle_voice_signal(
                bot_battle,
                "alice-id",
                {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                },
            )

        mock_cm.send_to_player.assert_not_awaited()

    @pytest.mark.anyio
    async def test_drops_signal_when_not_in_battle(self, gm):
        game = create_game(["Alice", "Bob"], num_players=2)
        gm._active_games["idle-game"] = game
        gm._player_id_to_name["alice-id"] = "Alice"
        gm._player_to_game["alice-id"] = "idle-game"

        mock_cm = AsyncMock()
        with (
            patch("server.routers.ws.game_manager", gm),
            patch("server.routers.ws.connection_manager", mock_cm),
        ):
            await _handle_voice_signal(
                "idle-game",
                "alice-id",
                {
                    "signal_type": "offer",
                    "data": {"sdp": "..."},
                },
            )

        mock_cm.send_to_player.assert_not_awaited()
