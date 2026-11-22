from collections.abc import Callable
from datetime import UTC, datetime
from typing import cast

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

import server.db.database as db_module
import server.routers.share_preview as share_preview_module
import server.routers.ws as ws_module
from mtb.models.game import (
    Battle,
    BattleSnapshotData,
    Game,
    Player,
    Puppet,
    StaticOpponent,
    restore_snapshot_data,
)
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


def test_init_db_adds_the_opponent_and_sudden_death_columns_to_an_existing_database(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE battle_snapshots DROP COLUMN opponent_name"))
        conn.execute(text("ALTER TABLE battle_snapshots DROP COLUMN sudden_death_build"))
        conn.execute(
            text(
                "INSERT INTO battle_snapshots (player_history_id, stage, round, hand_json, basic_lands_json, "
                "applied_upgrades_json, treasures, full_state_json) VALUES (1, 3, 1, '[]', '[]', '[]', 2, '{}')"
            )
        )
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()
    db_module.init_db()

    columns = {c["name"] for c in inspect(engine).get_columns("battle_snapshots")}
    assert {"opponent_name", "sudden_death_build"} <= columns
    with engine.connect() as conn:
        row = conn.execute(text("SELECT treasures, opponent_name, sudden_death_build FROM battle_snapshots")).one()
    assert tuple(row) == (2, None, None)


def _recorded_opponents(game_id: str, stage: int, round_num: int) -> dict[str, str | None]:
    db = db_module.SessionLocal()
    try:
        rows = (
            db.query(PlayerGameHistory.player_name, BattleSnapshot.opponent_name)
            .join(BattleSnapshot, BattleSnapshot.player_history_id == PlayerGameHistory.id)
            .filter(
                PlayerGameHistory.game_id == game_id, BattleSnapshot.stage == stage, BattleSnapshot.round == round_num
            )
            .all()
        )
        return {str(name): opponent for name, opponent in rows}
    finally:
        db.close()


def test_each_fight_records_who_each_player_faced(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager

    _ready_all(gm, game, game_id, game.players)

    faced = {b.player.name: b.opponent.name for b in game.active_battles}
    faced |= {opponent: name for name, opponent in faced.items()}
    assert _recorded_opponents(game_id, 3, 1) == faced


def test_a_fight_against_a_ghost_records_the_ghost(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager
    next(p for p in game.players if p.name == "Dave").poison = 9
    _play_round(gm, game, game_id, lambda b: b.opponent.name if b.player.name == "Dave" else b.player.name)

    for p in game.players:
        if p.phase == "draft":
            gm.handle_draft_done(game, p)
    _ready_all(gm, game, game_id, [p for p in game.players if p.phase == "build"])

    ghost_fight = next(b for b in game.active_battles if b.opponent.name == "Dave")
    assert _recorded_opponents(game_id, 3, 2)[ghost_fight.player.name] == "Dave"


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


def _build_seen_by(gm: GameManager, game_id: str, viewer: str) -> tuple[list[str], list[str]]:
    player_id = gm.get_player_id_by_name(game_id, viewer)
    assert player_id is not None
    state = gm.get_game_state(game_id, player_id)
    assert state is not None
    return [c.id for c in state.self_player.hand], [c.id for c in state.self_player.sideboard]


def _loses(name: str) -> Callable[[Battle], str]:
    return lambda b: b.opponent.name if b.player.name == name else b.player.name


def test_an_eliminated_player_still_sees_their_last_build_after_a_reload_and_at_game_end(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager
    alice, bob, carol, dave = game.players
    dave.poison = 9
    _play_round(gm, game, game_id, _loses("Dave"))
    last_build = _build_seen_by(gm, game_id, "Dave")
    assert all(last_build)
    carol.poison = 9
    _play_round(gm, game, game_id, _loses("Carol"))

    bob.poison = 9
    for p in (alice, bob):
        gm.handle_draft_done(game, p)
    _ready_all(gm, game, game_id, [alice, bob])
    assert not dave.hand
    assert not dave.sideboard

    gm.persist_all_games()
    restarted = GameManager()
    assert restarted.restore_game_from_snapshot(game_id)
    assert _build_seen_by(restarted, game_id, "Dave") == last_build

    _submit(gm, game, game_id, [alice, bob], "Alice")
    assert alice.phase == "winner"
    assert _build_seen_by(gm, game_id, "Dave") == last_build


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


def _bob_and_carol_reach_lethal_while_alice_survives(b: Battle) -> str:
    names = {b.player.name, b.opponent.name}
    if names == {"Bob", "Carol"}:
        return "draw"
    if "Alice" in names:
        return "Alice"
    return b.opponent.name


def _sudden_death_rows(game_id: str) -> list[tuple[str, int, int, int | None, str | None]]:
    db = db_module.SessionLocal()
    try:
        rows = (
            db.query(
                PlayerGameHistory.player_name,
                BattleSnapshot.stage,
                BattleSnapshot.round,
                BattleSnapshot.sudden_death_build,
                BattleSnapshot.opponent_name,
            )
            .join(BattleSnapshot, BattleSnapshot.player_history_id == PlayerGameHistory.id)
            .filter(PlayerGameHistory.game_id == game_id, PlayerGameHistory.player_name.in_(["Bob", "Carol"]))
            .order_by(BattleSnapshot.id)
            .all()
        )
        return [tuple(row) for row in rows]
    finally:
        db.close()


@pytest.fixture
def sudden_death_game(client, start_lobby, monkeypatch):
    """Dave goes out in 3-1. In 3-2 Bob and Carol reach lethal while Alice survives, so they fight in Sudden
    Death: the first fight is a draw, then Bob beats Carol. Carol shares mid-game, then Alice wins the game."""
    monkeypatch.setattr(
        share_preview_module,
        "_preview_rate_limiter",
        SlidingWindowRateLimiter(window_seconds=RATE_LIMIT_WINDOW, max_requests=RATE_LIMIT_MAX),
    )
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager
    players = {p.name: p for p in game.players}
    players["Dave"].poison = 9
    _play_round(gm, game, game_id, lambda b: b.opponent.name if b.player.name == "Dave" else b.player.name)
    players["Bob"].poison = 9
    players["Carol"].poison = 9
    _play_round(gm, game, game_id, _bob_and_carol_reach_lethal_while_alice_survives)
    bob, carol = players["Bob"], players["Carol"]
    assert bob.in_sudden_death
    assert carol.in_sudden_death

    _ready_all(gm, game, game_id, [bob, carol])
    _submit(gm, game, game_id, [bob, carol], "draw")
    _ready_all(gm, game, game_id, [bob, carol])
    _submit(gm, game, game_id, [bob, carol], "Bob")
    assert carol.phase == "eliminated"

    mid_game = client.get(f"/api/games/{game_id}/share/Carol")
    assert mid_game.status_code == 200, mid_game.text
    _play_until_alice_wins(gm, game, game_id)
    after = client.get(f"/api/games/{game_id}/share/Carol")
    assert after.status_code == 200, after.text

    return {"game_id": game_id, "mid_game": mid_game.json(), "after": after.json()}


def _round_keys(player: dict) -> list[tuple[int, int, int | None]]:
    return [(s["stage"], s["round"], s["sudden_death_build"]) for s in player["snapshots"]]


def _rounds_from(player: dict, first: tuple[int, int, int | None], count: int) -> list[tuple[int, int, int | None]]:
    keys = _round_keys(player)
    start = keys.index(first)
    return keys[start : start + count]


def test_each_sudden_death_build_is_saved_with_its_number_and_opponent(sudden_death_game):
    rows = [row for row in _sudden_death_rows(sudden_death_game["game_id"]) if row[1:3] == (3, 2)]

    assert sorted((name, build) for name, _, _, build, _ in rows if build is None) == [("Bob", None), ("Carol", None)]
    assert sorted((name, build, opponent) for name, _, _, build, opponent in rows if build is not None) == [
        ("Bob", 1, "Carol"),
        ("Bob", 2, "Carol"),
        ("Carol", 1, "Bob"),
        ("Carol", 2, "Bob"),
    ]


def test_share_lists_each_sudden_death_build_after_the_ordinary_round(sudden_death_game):
    after = sudden_death_game["after"]

    for name in ("Bob", "Carol"):
        player = _player(after, name)
        assert _rounds_from(player, (3, 2, None), 3) == [(3, 2, None), (3, 2, 1), (3, 2, 2)]
        start = _round_keys(player).index((3, 2, None))
        assert all(s["hand"] for s in player["snapshots"][start : start + 3])


def test_mid_game_share_hides_the_sudden_death_build_its_sharer_went_out_with(sudden_death_game):
    carol = _player(sudden_death_game["mid_game"], "Carol")
    last_build, first_sudden_death_build = carol["snapshots"][-1], carol["snapshots"][-2]

    assert _round_keys(carol)[-3:] == [(3, 2, None), (3, 2, 1), (3, 2, 2)]
    assert (last_build["visibility"], last_build["hand"]) == ("hand_hidden", [])
    assert first_sudden_death_build["visibility"] == "full"
    assert first_sudden_death_build["hand"]


def test_mid_game_share_hides_the_sudden_death_builds_of_the_other_fighter(sudden_death_game):
    bob = _player(sudden_death_game["mid_game"], "Bob")

    assert _rounds_from(bob, (3, 2, None), 3) == [(3, 2, None), (3, 2, 1), (3, 2, 2)]
    assert (3, 3, None) not in _round_keys(bob)
    assert all(s["visibility"] == "hidden" for s in bob["snapshots"])
    assert all(s["hand"] == [] for s in bob["snapshots"])


def test_a_puppet_from_a_game_with_sudden_death_plays_the_ordinary_build_of_that_round(sudden_death_game):
    gm = ws_module.game_manager
    db = db_module.SessionLocal()
    try:
        history = db.query(PlayerGameHistory).filter_by(game_id=sudden_death_game["game_id"], player_name="Bob").one()
        builds = {
            snapshot.sudden_death_build: StaticOpponent.from_snapshot(
                restore_snapshot_data(snapshot.full_state_json), "Bob", cast(int, history.id)
            )
            for snapshot in history.snapshots
            if (snapshot.stage, snapshot.round) == (3, 2)
        }
        puppet = gm._load_fake_player(db, history, set())
    finally:
        db.close()

    assert builds[2] != builds[None]
    assert puppet.snapshots["3_2"] == builds[None]


def _add_build(
    db, history: PlayerGameHistory, stage: int, round_number: int, *, treasures: int, poison: int, **columns
) -> None:
    snapshot_data = BattleSnapshotData(
        hand=[], vanguard=None, basic_lands=BASICS, applied_upgrades=[], treasures=treasures, poison=poison
    )
    db.add(
        BattleSnapshot(
            player_history_id=history.id,
            stage=stage,
            round=round_number,
            hand_json="[]",
            basic_lands_json="[]",
            applied_upgrades_json="[]",
            treasures=treasures,
            poison=poison,
            full_state_json=snapshot_data.model_dump_json(),
            **columns,
        )
    )


def test_share_shows_a_puppet_in_each_sudden_death_it_fought_with_its_ordinary_build(client):
    """Ava wins a Goldfish game in Sudden Death against Rook, a puppet replaying a past player who once rebuilt for
    a Sudden Death of their own."""
    db = db_module.SessionLocal()
    try:
        db.add(GameRecord(id="past-game", ended_at=datetime.now(UTC)))
        db.add(GameRecord(id="goldfish", ended_at=datetime.now(UTC)))
        past_rook = PlayerGameHistory(
            game_id="past-game", player_name="Rook", battler_elo=1200, max_stage=4, max_round=2
        )
        ava = PlayerGameHistory(
            game_id="goldfish", player_name="Ava", battler_elo=1200, max_stage=4, max_round=2, final_placement=1
        )
        db.add_all([past_rook, ava])
        db.flush()
        rook = PlayerGameHistory(
            game_id="goldfish",
            player_name="Rook",
            battler_elo=1200,
            max_stage=4,
            max_round=2,
            is_puppet=True,
            source_history_id=past_rook.id,
            poison_history_json='{"4_2": 8}',
            final_placement=2,
            final_poison=10,
        )
        db.add(rook)
        _add_build(db, past_rook, 4, 2, treasures=2, poison=8)
        _add_build(db, past_rook, 4, 2, treasures=77, poison=9, sudden_death_build=1)
        _add_build(db, ava, 4, 2, treasures=3, poison=8, opponent_name="Rook")
        _add_build(db, ava, 4, 2, treasures=3, poison=9, opponent_name="Rook", sudden_death_build=1)
        _add_build(db, ava, 4, 2, treasures=3, poison=9, opponent_name="Rook", sudden_death_build=2)
        db.commit()
    finally:
        db.close()

    rook_rows = _share_rows(client, "goldfish", "Ava")["Rook"]["snapshots"]

    assert [(s["sudden_death_build"], s["poison"], s["treasures"]) for s in rook_rows] == [
        (None, 8, 2),
        (1, 9, 2),
        (2, 9, 2),
    ]


def test_both_builds_of_a_sudden_death_fight_share_its_number_even_after_a_failed_save(
    client, start_lobby, monkeypatch
):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob", "Carol", "Dave"])
    gm = ws_module.game_manager
    players = {p.name: p for p in game.players}
    players["Dave"].poison = 9
    _play_round(gm, game, game_id, lambda b: b.opponent.name if b.player.name == "Dave" else b.player.name)
    players["Bob"].poison = 9
    players["Carol"].poison = 9
    _play_round(gm, game, game_id, _bob_and_carol_reach_lethal_while_alice_survives)
    bob, carol = players["Bob"], players["Carol"]
    record_snapshot = GameManager._record_snapshot
    failed = []

    def fail_bobs_first_sudden_death_build(self, db, game_id, player, battler_elo, **columns):
        if player.name == "Bob" and columns.get("sudden_death_build") is not None and not failed:
            failed.append(player.name)
            raise OperationalError("INSERT", {}, Exception("database is locked"))
        return record_snapshot(self, db, game_id, player, battler_elo, **columns)

    monkeypatch.setattr(GameManager, "_record_snapshot", fail_bobs_first_sudden_death_build)
    _ready_all(gm, game, game_id, [bob, carol])
    _submit(gm, game, game_id, [bob, carol], "draw")
    _ready_all(gm, game, game_id, [bob, carol])

    builds = sorted((name, build) for name, _, _, build, _ in _sudden_death_rows(game_id) if build is not None)
    assert failed == ["Bob"]
    assert builds == [("Bob", 2), ("Carol", 1), ("Carol", 2)]


def test_a_sudden_death_against_a_puppet_saves_the_players_build_and_starts_the_fight(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Bob", "Carol"])
    gm = ws_module.game_manager
    _, carol = game.players
    game.puppets.append(
        Puppet(
            name="Rook",
            player_history_id=999,
            snapshots={"3_1": StaticOpponent(name="Rook", hand=[])},
            in_sudden_death=True,
        )
    )
    carol.in_sudden_death = True
    carol.poison = 9

    _ready_all(gm, game, game_id, [carol])

    assert [(b.player.name, b.opponent.name, b.is_sudden_death) for b in game.active_battles] == [
        ("Carol", "Rook", True)
    ]
    assert ("Carol", 3, 1, 1, "Rook") in _sudden_death_rows(game_id)


def test_a_sudden_death_build_that_cannot_be_saved_still_starts_the_fight(client, start_lobby):
    game_id, game = _start_game(client, start_lobby, ["Alice", "Bob"])
    gm = ws_module.game_manager
    alice, bob = game.players
    alice.poison = 9
    bob.poison = 9
    _ready_all(gm, game, game_id, [alice, bob])
    _submit(gm, game, game_id, [alice, bob], "draw")
    _finish_rewards(gm, game, game_id, [alice, bob])
    assert alice.in_sudden_death
    with db_module.engine.begin() as conn:
        conn.execute(text("DROP TABLE battle_snapshots"))

    _ready_all(gm, game, game_id, [alice, bob])

    assert [p.phase for p in (alice, bob)] == ["battle", "battle"]
    assert [b.is_sudden_death for b in game.active_battles] == [True]
