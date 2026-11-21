from collections.abc import Callable
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, inspect, text

import server.db.database as db_module
import server.routers.share_preview as share_preview_module
import server.routers.ws as ws_module
from mtb.models.game import Battle, BattleSnapshotData, Game, Player
from mtb.phases import reward
from server.db.models import Base, BattleSnapshot, GameRecord, PlayerGameHistory
from server.routers.share_preview import RATE_LIMIT_MAX, RATE_LIMIT_WINDOW, SlidingWindowRateLimiter
from server.services.game_manager import GameManager

BASICS = ["Plains", "Island", "Swamp"]


def _start_game(client, start_lobby, player_names: list[str]) -> tuple[str, Game]:
    created = client.post(
        "/api/games",
        json={"player_name": player_names[0], "cube_id": "test", "target_player_count": len(player_names)},
    ).json()
    for name in player_names[1:]:
        client.post("/api/games/join", json={"join_code": created["join_code"], "player_name": name})
    game_id = created["game_id"]
    assert start_lobby(game_id, created["session_id"]).status_code == 200
    game = ws_module.game_manager.get_game(game_id)
    assert game is not None
    return game_id, game


def _ready_all(gm: GameManager, game: Game, game_id: str, players: list[Player]) -> None:
    db = db_module.SessionLocal()
    try:
        for p in players:
            if not p.hand:
                p.hand, p.sideboard = p.sideboard[:3], p.sideboard[3:]
            assert gm.handle_build_ready(game, p, BASICS, game_id, db) is None
    finally:
        db.close()


def _submit(gm: GameManager, game: Game, game_id: str, players: list[Player], result: str) -> None:
    db = db_module.SessionLocal()
    try:
        for p in players:
            assert gm.handle_battle_submit_result(game, p, result, game_id, db)
    finally:
        db.close()


def _finish_rewards(gm: GameManager, game: Game, game_id: str, players: list[Player]) -> None:
    db = db_module.SessionLocal()
    try:
        for p in players:
            if p.phase == "reward":
                assert gm.handle_reward_done(game, p, None, game_id, db) in (None, "game_over", "sudden_death")
    finally:
        db.close()


def _play_round(gm: GameManager, game: Game, game_id: str, winner_of: Callable[[Battle], str]) -> None:
    for p in game.players:
        if p.phase == "draft":
            gm.handle_draft_done(game, p)
        if p.phase == "build" and p.hand:
            missing = p.hand_size - len(p.hand)
            p.hand, p.sideboard = p.hand + p.sideboard[:missing], p.sideboard[missing:]
    _ready_all(gm, game, game_id, [p for p in game.players if p.phase == "build"])
    for b in list(game.active_battles):
        pair = [p for p in game.players if p.phase != "eliminated" and p.name in (b.player.name, b.opponent.name)]
        _submit(gm, game, game_id, pair, winner_of(b))
    db = db_module.SessionLocal()
    try:
        for p in game.players:
            if p.phase == "reward":
                upgrade_id = game.available_upgrades[0].id if reward.is_stage_increasing(p) else None
                assert gm.handle_reward_done(game, p, upgrade_id, game_id, db) in (None, "game_over", "sudden_death")
    finally:
        db.close()


def _alice_wins(b: Battle) -> str:
    return "Alice" if "Alice" in (b.player.name, b.opponent.name) else b.opponent.name


def _play_until_alice_wins(gm: GameManager, game: Game, game_id: str) -> None:
    for p in game.players:
        if p.name != "Alice" and p.phase != "eliminated":
            p.poison = 9
    for _ in range(10):
        if any(p.phase == "winner" for p in game.players):
            return
        _play_round(gm, game, game_id, _alice_wins)
    raise AssertionError("the game did not end within 10 rounds")


def _share_rows(client, game_id: str, owner: str) -> dict[str, dict]:
    response = client.get(f"/api/games/{game_id}/share/{owner}")
    assert response.status_code == 200
    return {p["name"]: p for p in response.json()["players"]}


def test_share_page_shows_state_after_the_final_battle(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob"])
    gm = ws_module.game_manager
    alice, bob = game.players
    bob.poison = 9

    _ready_all(gm, game, game_id, [alice, bob])
    _submit(gm, game, game_id, [alice, bob], "Alice")

    assert bob.phase == "eliminated"
    rows = _share_rows(client, game_id, "Alice")
    assert rows["Bob"]["final_poison"] == bob.poison
    assert rows["Bob"]["final_treasures"] == bob.treasures
    assert rows["Alice"]["final_poison"] == alice.poison
    assert rows["Alice"]["final_treasures"] == alice.treasures


def test_share_page_shows_final_state_of_player_eliminated_mid_game(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager
    dave = next(p for p in game.players if p.name == "Dave")
    dave.poison = 9

    _ready_all(gm, game, game_id, game.players)
    dave_opponent = next(
        b.player if b.opponent.name == "Dave" else b.opponent
        for b in game.active_battles
        if "Dave" in (b.player.name, b.opponent.name)
    )
    for b in list(game.active_battles):
        pair = [p for p in game.players if p.name in (b.player.name, b.opponent.name)]
        _submit(gm, game, game_id, pair, dave_opponent.name if dave in pair else pair[0].name)
    _finish_rewards(gm, game, game_id, game.players)

    assert dave.phase == "eliminated"
    assert any(p.phase != "eliminated" and p.placement == 0 for p in game.players)
    dave_at_elimination = {"final_poison": dave.poison, "final_treasures": dave.treasures}
    mid_game = _share_rows(client, game_id, "Dave")
    assert {key: mid_game["Dave"][key] for key in dave_at_elimination} == dave_at_elimination
    assert mid_game["Alice"]["final_treasures"] is None

    _play_until_alice_wins(gm, game, game_id)

    rows = _share_rows(client, game_id, "Dave")
    assert {key: rows["Dave"][key] for key in dave_at_elimination} == dave_at_elimination


def test_share_page_shows_how_sudden_death_ended(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob"])
    gm = ws_module.game_manager
    alice, bob = game.players
    alice.poison = 9
    bob.poison = 9

    _ready_all(gm, game, game_id, [alice, bob])
    _submit(gm, game, game_id, [alice, bob], "draw")
    _finish_rewards(gm, game, game_id, [alice, bob])
    assert alice.in_sudden_death
    assert bob.in_sudden_death
    _ready_all(gm, game, game_id, [alice, bob])
    _submit(gm, game, game_id, [alice, bob], "Alice")

    assert bob.phase == "eliminated"
    rows = _share_rows(client, game_id, "Bob")
    assert rows["Bob"]["final_poison"] == bob.poison
    assert rows["Bob"]["final_placement"] == 2
    assert rows["Alice"]["final_poison"] == alice.poison
    assert rows["Alice"]["final_placement"] == 1


def test_share_page_for_game_without_final_record_uses_last_snapshot(client):
    db = db_module.SessionLocal()
    try:
        db.add(GameRecord(id="old-game", ended_at=datetime.now(UTC)))
        history = PlayerGameHistory(
            game_id="old-game", player_name="Alice", battler_elo=1200, max_stage=3, max_round=2, final_placement=2
        )
        db.add(history)
        db.flush()
        snapshot_data = BattleSnapshotData(
            hand=[], vanguard=None, basic_lands=BASICS, applied_upgrades=[], treasures=6, poison=8
        )
        db.add(
            BattleSnapshot(
                player_history_id=history.id,
                stage=3,
                round=2,
                hand_json="[]",
                basic_lands_json="[]",
                applied_upgrades_json="[]",
                treasures=6,
                poison=8,
                full_state_json=snapshot_data.model_dump_json(),
            )
        )
        db.commit()
    finally:
        db.close()

    rows = _share_rows(client, "old-game", "Alice")

    assert rows["Alice"]["final_poison"] == 8
    assert rows["Alice"]["final_treasures"] is None


def test_init_db_adds_final_state_columns_to_an_existing_database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE player_game_history DROP COLUMN final_poison"))
        conn.execute(text("ALTER TABLE player_game_history DROP COLUMN final_treasures"))
        conn.execute(
            text(
                "INSERT INTO player_game_history (game_id, player_name, battler_elo, max_stage, max_round) "
                "VALUES ('g', 'Alice', 1200, 3, 1)"
            )
        )
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()
    db_module.init_db()

    columns = {c["name"] for c in inspect(engine).get_columns("player_game_history")}
    assert {"final_poison", "final_treasures"} <= columns
    with engine.connect() as conn:
        row = conn.execute(text("SELECT player_name, final_poison, final_treasures FROM player_game_history")).one()
    assert tuple(row) == ("Alice", None, None)


def _odds_seen_by(game_id: str, viewer: str) -> dict[str, float | None]:
    gm = ws_module.game_manager
    player_id = gm.get_player_id_by_name(game_id, viewer)
    assert player_id is not None
    state = gm.get_game_state(game_id, player_id)
    assert state is not None
    return {p.name: p.pairing_probability for p in state.players if p.name != viewer}


def test_eliminated_player_sees_no_next_opponent_odds(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager
    dave = next(p for p in game.players if p.name == "Dave")
    dave.poison = 9

    _ready_all(gm, game, game_id, game.players)
    dave_opponent = next(
        b.player if b.opponent.name == "Dave" else b.opponent
        for b in game.active_battles
        if "Dave" in (b.player.name, b.opponent.name)
    )
    for b in list(game.active_battles):
        pair = [p for p in game.players if p.name in (b.player.name, b.opponent.name)]
        _submit(gm, game, game_id, pair, dave_opponent.name if dave in pair else pair[0].name)
    _finish_rewards(gm, game, game_id, game.players)

    assert dave.phase == "eliminated"
    assert set(_odds_seen_by(game_id, "Dave").values()) == {None}
    assert None not in _odds_seen_by(game_id, "Alice").values()


def test_no_next_opponent_odds_after_the_game_ends(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob"])
    gm = ws_module.game_manager
    alice, bob = game.players
    bob.poison = 9

    _ready_all(gm, game, game_id, [alice, bob])
    _submit(gm, game, game_id, [alice, bob], "Alice")

    assert alice.phase == "winner"
    assert _odds_seen_by(game_id, "Alice") == {"Bob": None}
    assert _odds_seen_by(game_id, "Bob") == {"Alice": None}


def _give_every_zone_a_card(player: Player, card_factory, upgrade_factory) -> None:
    applied = upgrade_factory(f"{player.name} applied upgrade")
    applied.upgrade_target = player.hand[0] if player.hand else player.sideboard[0]
    player.upgrades = [applied, upgrade_factory(f"{player.name} spare upgrade")]
    player.command_zone = [card_factory(f"{player.name} companion")]
    player.vanguard = card_factory(f"{player.name} vanguard", type_line="Vanguard")


@pytest.fixture
def dave_shares_mid_game(client, start_lobby, card_factory, upgrade_factory, monkeypatch):
    """Dave survives 3-1 and goes out in 3-2, Carol goes out in 3-3, and Dave shares; then the game ends."""
    monkeypatch.setattr(
        share_preview_module,
        "_preview_rate_limiter",
        SlidingWindowRateLimiter(window_seconds=RATE_LIMIT_WINDOW, max_requests=RATE_LIMIT_MAX),
    )
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager
    dave = next(p for p in game.players if p.name == "Dave")
    for p in game.players:
        _give_every_zone_a_card(p, card_factory, upgrade_factory)

    _play_round(gm, game, game_id, lambda b: b.player.name)
    dave.poison = 9
    _give_every_zone_a_card(dave, card_factory, upgrade_factory)
    _play_round(gm, game, game_id, lambda b: b.opponent.name if b.player.name == "Dave" else b.player.name)
    assert dave.phase == "eliminated"
    carol = next(p for p in game.players if p.name == "Carol")
    carol.poison = 9
    _play_round(gm, game, game_id, lambda b: b.opponent.name if b.player.name == "Carol" else b.player.name)
    assert carol.phase == "eliminated"
    assert sum(p.phase != "eliminated" for p in game.players) == 2

    mid_game = client.get(f"/api/games/{game_id}/share/Dave")
    assert mid_game.status_code == 200, mid_game.text
    mid_game_preview = client.get(f"/game/{game_id}/share/Dave/preview.png")
    alice_mid_game = client.get(f"/api/games/{game_id}/share/Alice")

    _play_until_alice_wins(gm, game, game_id)
    after = client.get(f"/api/games/{game_id}/share/Dave")
    assert after.status_code == 200, after.text

    return {
        "mid_game": mid_game.json(),
        "mid_game_preview_status": mid_game_preview.status_code,
        "alice_mid_game": alice_mid_game,
        "after": after.json(),
    }


def _player(share: dict, name: str) -> dict:
    return next(p for p in share["players"] if p["name"] == name)


def _rounds(player: dict) -> list[tuple[int, int]]:
    return [(s["stage"], s["round"]) for s in player["snapshots"]]


def test_a_player_still_in_the_game_cannot_share_it(dave_shares_mid_game):
    response = dave_shares_mid_game["alice_mid_game"]

    assert response.status_code == 404
    assert response.json()["code"] == "GAME_IN_PROGRESS"


def test_mid_game_share_lists_only_the_sharers_rounds(dave_shares_mid_game):
    mid_game, after = dave_shares_mid_game["mid_game"], dave_shares_mid_game["after"]
    dave_rounds = _rounds(_player(mid_game, "Dave"))

    assert mid_game["in_progress"] is True
    assert dave_rounds == [(3, 1), (3, 2)]
    assert (3, 3) in _rounds(_player(after, "Alice"))
    for player in mid_game["players"]:
        assert set(_rounds(player)) <= set(dave_rounds)


def test_mid_game_share_shows_the_sharers_earlier_rounds_in_full(dave_shares_mid_game):
    mid_game, after = dave_shares_mid_game["mid_game"], dave_shares_mid_game["after"]

    assert _player(mid_game, "Dave")["snapshots"][0] == _player(after, "Dave")["snapshots"][0]


@pytest.mark.parametrize("zone", ["hand", "applied_upgrades", "upgrades"])
def test_mid_game_share_hides_the_zones_of_the_sharers_last_build(dave_shares_mid_game, zone):
    mid_game, after = dave_shares_mid_game["mid_game"], dave_shares_mid_game["after"]
    last_round = _player(mid_game, "Dave")["snapshots"][-1]

    assert _player(after, "Dave")["snapshots"][-1][zone]
    assert last_round[zone] == []
    assert last_round["visibility"] == "hand_hidden"
    assert last_round["sideboard"] == _player(after, "Dave")["snapshots"][-1]["sideboard"]


@pytest.mark.parametrize("zone", ["hand", "sideboard", "basic_lands", "applied_upgrades", "upgrades", "command_zone"])
def test_mid_game_share_hides_every_zone_of_the_other_players(dave_shares_mid_game, zone):
    mid_game, after = dave_shares_mid_game["mid_game"], dave_shares_mid_game["after"]

    for name in ("Alice", "Bob", "Carol"):
        assert _player(after, name)["snapshots"][0][zone]
        for snapshot in _player(mid_game, name)["snapshots"]:
            assert snapshot[zone] == []
            assert snapshot["visibility"] == "hidden"


def test_mid_game_share_shows_the_other_players_poison_and_treasures(dave_shares_mid_game):
    mid_game, after = dave_shares_mid_game["mid_game"], dave_shares_mid_game["after"]

    for name in ("Alice", "Bob", "Carol"):
        later = {(s["stage"], s["round"]): s for s in _player(after, name)["snapshots"]}
        for snapshot in _player(mid_game, name)["snapshots"]:
            assert snapshot["vanguard"] is None
            full = later[(snapshot["stage"], snapshot["round"])]
            assert (snapshot["poison"], snapshot["treasures"]) == (full["poison"], full["treasures"])


def test_mid_game_share_hides_the_standing_of_players_still_in(dave_shares_mid_game):
    mid_game = dave_shares_mid_game["mid_game"]

    assert _player(mid_game, "Dave")["final_placement"] == 4
    for name in ("Alice", "Bob"):
        assert _player(mid_game, name)["final_placement"] is None
        assert _player(mid_game, name)["final_treasures"] is None


def test_mid_game_share_shows_a_player_who_went_out_later_as_they_were_in_the_sharers_rounds(dave_shares_mid_game):
    carol = _player(dave_shares_mid_game["mid_game"], "Carol")

    assert carol["final_placement"] == 3
    assert carol["final_treasures"] is None
    assert carol["final_poison"] == carol["snapshots"][-1]["poison"]


def test_mid_game_share_has_no_link_preview(dave_shares_mid_game):
    assert dave_shares_mid_game["mid_game_preview_status"] == 404


def test_share_shows_every_player_in_full_once_the_game_ends(dave_shares_mid_game):
    after = dave_shares_mid_game["after"]

    assert after["in_progress"] is False
    assert all(s["visibility"] == "full" for p in after["players"] for s in p["snapshots"])
    assert _player(after, "Alice")["final_placement"] == 1
