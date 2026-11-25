import asyncio
import gzip
import json
import time
from typing import Any

import pytest

from pitfight.models.card_registry import register_card_data
from pitfight.models.cards import Card
from pitfight.models.game import create_game
from pitfight.phases import battle
from server import compression
from server.services.connection_manager import ConnectionManager
from server.services.game.view_builder import build_game_state
from server.services.game_manager import GameManager
from server.services.game_serialization import build_catalog_from_state_refs


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


class _FakeWebSocket:
    def __init__(self, *, fail_on_send: bool = False) -> None:
        self.sent: list[dict[str, Any]] = []
        self.raw_frames: list[bytes] = []
        self.closed: int | None = None
        self.accepted = False
        self.fail_on_send = fail_on_send
        self.send_gate = asyncio.Event()
        self.send_gate.set()

    async def accept(self) -> None:
        self.accepted = True

    async def send_bytes(self, data: bytes) -> None:
        await self.send_gate.wait()
        if self.fail_on_send:
            msg = "socket broken"
            raise RuntimeError(msg)
        self.raw_frames.append(data)
        self.sent.append(json.loads(gzip.decompress(data)))

    async def send_json(self, message: dict[str, Any]) -> None:
        await self.send_gate.wait()
        if self.fail_on_send:
            msg = "socket broken"
            raise RuntimeError(msg)
        self.sent.append(message)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        _ = reason
        self.closed = code


def _enable_counting_compression(monkeypatch: pytest.MonkeyPatch, *, slow_first_seconds: float = 0.0) -> list[int]:
    # ast-grep-ignore: python.question-monkeypatch -- module-level compression flag toggled in conftest
    monkeypatch.setattr(compression, "WS_COMPRESSION_ENABLED", True)
    calls: list[int] = []
    real_compress = gzip.compress

    def counting_compress(raw: bytes) -> bytes:
        calls.append(len(raw))
        if slow_first_seconds > 0 and len(calls) == 1:
            time.sleep(slow_first_seconds)
        return real_compress(raw)

    # ast-grep-ignore: python.question-monkeypatch -- observe stdlib gzip.compress calls on module boundary
    monkeypatch.setattr(compression.gzip, "compress", counting_compress)
    return calls


def _count_state_builds(monkeypatch: pytest.MonkeyPatch, manager: GameManager) -> list[str]:
    calls: list[str] = []
    real_get_game_state = manager.get_game_state

    def counting_get_game_state(gid: str, pid: str) -> Any:  # noqa: ANN401 -- mirrors GameManager method
        calls.append(pid)
        return real_get_game_state(gid, pid)

    # ast-grep-ignore: python.question-monkeypatch -- instrument real GameManager view builder calls
    monkeypatch.setattr(manager, "get_game_state", counting_get_game_state)
    return calls


async def _no_broadcast() -> None:
    pass


async def _start_two_player_game(mock_cube_data: None, *, test_db: None) -> tuple[GameManager, str, str, str]:
    _ = (mock_cube_data, test_db)
    manager = GameManager()
    pending = manager.create_game("Alice", "pid-a", cube_id="test", target_player_count=2)
    manager.join_game(pending.join_code, "Bob", player_id="pid-b")
    game_id = pending.game_id
    for player_id in pending.player_ids:
        ready, error = manager.set_player_ready(game_id, player_id, is_ready=True)
        assert ready, error
    await manager.start_lobby(game_id, pending.host_player_id, db=None, on_change=_no_broadcast)
    return manager, game_id, "pid-a", "pid-b"


@pytest.mark.anyio
async def test_spectators_watching_same_target_share_view_build_and_compression(
    mock_cube_data: None,
    *,
    test_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager, game_id, alice_id, bob_id = await _start_two_player_game(mock_cube_data, test_db=test_db)
    state_calls = _count_state_builds(monkeypatch, manager)
    compress_calls = _enable_counting_compression(monkeypatch)

    cm = ConnectionManager(manager)
    alice_ws = _FakeWebSocket()
    bob_ws = _FakeWebSocket()
    alice_specs = [_FakeWebSocket() for _ in range(4)]
    bob_specs = [_FakeWebSocket() for _ in range(2)]

    await cm.connect(game_id, alice_id, websocket=alice_ws)
    await cm.connect(game_id, bob_id, websocket=bob_ws)
    for ws in alice_specs:
        assert await cm.connect_spectator(game_id, "Alice", websocket=ws)
    for ws in bob_specs:
        assert await cm.connect_spectator(game_id, "Bob", websocket=ws)

    await cm.broadcast_game_state(game_id)
    for ws in (alice_ws, bob_ws, *alice_specs, *bob_specs):
        await cm.wait_until_sent(ws)

    assert state_calls == [alice_id, bob_id]
    assert len(compress_calls) == 2

    for spec in alice_specs:
        assert spec.sent == alice_ws.sent
        assert spec.raw_frames[0] is alice_ws.raw_frames[0]
    for spec in bob_specs:
        assert spec.sent == bob_ws.sent
        assert spec.raw_frames[0] is bob_ws.raw_frames[0]
    assert alice_ws.sent[0]["payload"]["self_player"]["name"] == "Alice"
    assert bob_ws.sent[0]["payload"]["self_player"]["name"] == "Bob"


@pytest.mark.anyio
async def test_spectators_only_broadcast_builds_and_compresses_once_per_target(
    mock_cube_data: None,
    *,
    test_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager, game_id, alice_id, _ = await _start_two_player_game(mock_cube_data, test_db=test_db)
    state_calls = _count_state_builds(monkeypatch, manager)
    compress_calls = _enable_counting_compression(monkeypatch)

    cm = ConnectionManager(manager)
    specs = [_FakeWebSocket() for _ in range(3)]
    for ws in specs:
        assert await cm.connect_spectator(game_id, "Alice", websocket=ws)

    await cm.broadcast_game_state(game_id)
    for ws in specs:
        await cm.wait_until_sent(ws)

    assert state_calls == [alice_id]
    assert len(compress_calls) == 1
    assert all(ws.sent == specs[0].sent for ws in specs[1:])
    assert all(ws.raw_frames[0] is specs[0].raw_frames[0] for ws in specs[1:])


@pytest.mark.anyio
async def test_lobby_state_broadcast_compresses_once_for_all_players(
    mock_cube_data: None,
    *,
    test_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = (mock_cube_data, test_db)
    manager = GameManager()
    pending = manager.create_game("Alice", "pid-1", cube_id="test", target_player_count=4)
    for idx in range(2, 5):
        manager.join_game(pending.join_code, f"P{idx}", player_id=f"pid-{idx}")

    compress_calls = _enable_counting_compression(monkeypatch)

    cm = ConnectionManager(manager)
    sockets = [_FakeWebSocket() for _ in range(4)]
    for idx, ws in enumerate(sockets, start=1):
        await cm.connect(pending.game_id, f"pid-{idx}", websocket=ws)

    await cm.broadcast_lobby_state(pending.game_id)
    for ws in sockets:
        await cm.wait_until_sent(ws)

    assert len(compress_calls) == 1
    assert all(ws.sent == sockets[0].sent for ws in sockets[1:])
    assert all(ws.raw_frames[0] is sockets[0].raw_frames[0] for ws in sockets[1:])


@pytest.mark.anyio
async def test_game_over_broadcast_shares_game_over_and_state_frames(
    mock_cube_data: None,
    *,
    test_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager, game_id, alice_id, bob_id = await _start_two_player_game(mock_cube_data, test_db=test_db)
    state_calls = _count_state_builds(monkeypatch, manager)
    compress_calls = _enable_counting_compression(monkeypatch)

    cm = ConnectionManager(manager)
    alice_ws = _FakeWebSocket()
    bob_ws = _FakeWebSocket()
    alice_specs = [_FakeWebSocket() for _ in range(3)]
    await cm.connect(game_id, alice_id, websocket=alice_ws)
    await cm.connect(game_id, bob_id, websocket=bob_ws)
    for ws in alice_specs:
        assert await cm.connect_spectator(game_id, "Alice", websocket=ws)

    await cm.broadcast_game_over(game_id, "Alice")
    for ws in (alice_ws, bob_ws, *alice_specs):
        await cm.wait_until_sent(ws)

    assert state_calls == [alice_id, bob_id]
    # One shared game_over frame + one Alice game_state + one Bob game_state.
    assert len(compress_calls) == 3

    for ws in (alice_ws, bob_ws, *alice_specs):
        assert [msg["type"] for msg in ws.sent] == ["game_over", "game_state"]
        assert ws.sent[0]["payload"]["winner_name"] == "Alice"
        assert ws.raw_frames[0] is alice_ws.raw_frames[0]
    for spec in alice_specs:
        assert spec.raw_frames[1] is alice_ws.raw_frames[1]


@pytest.mark.anyio
async def test_slow_and_failing_sockets_do_not_block_others_and_clean_up(
    mock_cube_data: None,
    *,
    test_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager, game_id, alice_id, bob_id = await _start_two_player_game(mock_cube_data, test_db=test_db)
    _enable_counting_compression(monkeypatch)

    cm = ConnectionManager(manager)
    stalled_alice = _FakeWebSocket()
    stalled_alice.send_gate.clear()
    failing_bob = _FakeWebSocket(fail_on_send=True)
    failing_spec = _FakeWebSocket(fail_on_send=True)
    healthy_specs = [_FakeWebSocket() for _ in range(2)]

    await cm.connect(game_id, alice_id, websocket=stalled_alice)
    await cm.connect(game_id, bob_id, websocket=failing_bob)
    assert await cm.connect_spectator(game_id, "Alice", websocket=failing_spec)
    for ws in healthy_specs:
        assert await cm.connect_spectator(game_id, "Alice", websocket=ws)

    await cm.broadcast_game_state(game_id)

    for ws in (failing_bob, failing_spec, *healthy_specs):
        await asyncio.wait_for(cm.wait_until_sent(ws), timeout=1.0)

    assert len(stalled_alice.sent) == 0
    for ws in healthy_specs:
        assert len(ws.sent) == 1
        assert ws.sent[0]["payload"]["self_player"]["name"] == "Alice"

    assert bob_id not in cm.connections.get(game_id, {})
    assert alice_id in cm.connections.get(game_id, {})
    assert failing_spec not in cm.spectators.get(game_id, {}).get("Alice", [])
    assert cm.spectators[game_id]["Alice"] == healthy_specs

    stalled_alice.send_gate.set()
    await asyncio.wait_for(cm.wait_until_sent(stalled_alice), timeout=1.0)
    assert len(stalled_alice.sent) == 1
    assert stalled_alice.raw_frames[0] is healthy_specs[0].raw_frames[0]


@pytest.mark.anyio
async def test_concurrent_broadcasts_preserve_per_socket_order_with_slow_first_compression(
    mock_cube_data: None,
    *,
    test_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    manager, game_id, alice_id, _ = await _start_two_player_game(mock_cube_data, test_db=test_db)
    _enable_counting_compression(monkeypatch, slow_first_seconds=0.05)

    game = manager.get_game(game_id)
    assert game is not None
    alice = game.players[0]

    cm = ConnectionManager(manager)
    alice_ws = _FakeWebSocket()
    spec_ws = _FakeWebSocket()
    await cm.connect(game_id, alice_id, websocket=alice_ws)
    assert await cm.connect_spectator(game_id, "Alice", websocket=spec_ws)

    alice.treasures = 1
    await cm.broadcast_game_state(game_id)
    alice.treasures = 2
    await cm.broadcast_game_state(game_id)

    await cm.wait_until_sent(alice_ws)
    await cm.wait_until_sent(spec_ws)

    assert [m["payload"]["self_player"]["treasures"] for m in alice_ws.sent] == [1, 2]
    assert [m["payload"]["self_player"]["treasures"] for m in spec_ws.sent] == [1, 2]


def test_build_game_state_catalog_delta_matches_reference_serializer() -> None:
    register_card_data(
        "sf-token",
        {
            "name": "Goblin Token",
            "image_url": "https://example.com/token.jpg",
            "type_line": "Token Creature — Goblin",
        },
    )
    register_card_data(
        "sf-maker",
        {
            "name": "Goblin Maker",
            "image_url": "https://example.com/maker.jpg",
            "type_line": "Creature — Goblin",
            "token_scryfall_ids": ["sf-token"],
        },
    )
    register_card_data(
        "sf-upgrade",
        {
            "name": "Power Up",
            "image_url": "https://example.com/up.jpg",
            "type_line": "Conspiracy",
        },
    )

    game = create_game(["Alice", "Bob"], num_players=2)
    alice, bob = game.players
    for player in (alice, bob):
        player.phase = "battle"
        player.hand = [
            Card(id=f"{player.name}-m", scryfall_id="sf-maker", name="Goblin Maker", image_url="", type_line=""),
            Card(id=f"{player.name}-t", scryfall_id="treasure", name="Treasure", image_url="", type_line=""),
            Card(id=f"{player.name}-p", scryfall_id="basic-plains", name="Plains", image_url="", type_line=""),
        ]
        player.upgrades = [
            Card(id=f"{player.name}-u", scryfall_id="sf-upgrade", name="Power Up", image_url="", type_line="Conspiracy")
        ]

    active_battle = battle.start(game, alice, opponent=bob)
    bob_card = bob.hand[0]
    battle.move_zone(active_battle, bob, card=bob_card, from_zone="hand", to_zone="battlefield")
    battle.update_card_state(active_battle, bob, action_type="face_down", card_id=bob_card.id)

    state = build_game_state(game, alice, game_id="g1")
    expected_catalog = build_catalog_from_state_refs(state)

    assert state.catalog_delta == expected_catalog
    assert {"sf-maker", "sf-token", "sf-upgrade", "treasure", "basic-plains", "__scrubbed__"} <= set(
        state.catalog_delta
    )
