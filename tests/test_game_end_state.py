from sqlalchemy import create_engine, inspect, text

import server.db.database as db_module
import server.routers.ws as ws_module
from mtb.models.game import BattleSnapshotData, Game, Player
from server.db.models import Base, BattleSnapshot, GameRecord, PlayerGameHistory
from server.services.game_manager import GameManager

BASICS = ["Plains", "Island", "Swamp"]


def _start_game(client, player_names: list[str]) -> tuple[str, Game]:
    created = client.post(
        "/api/games",
        json={"player_name": player_names[0], "cube_id": "test", "target_player_count": len(player_names)},
    ).json()
    for name in player_names[1:]:
        client.post("/api/games/join", json={"join_code": created["join_code"], "player_name": name})
    game_id = created["game_id"]
    assert client.post(f"/api/games/{game_id}/start").status_code == 200
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


def _share_rows(client, game_id: str, owner: str) -> dict[str, dict]:
    response = client.get(f"/api/games/{game_id}/share/{owner}")
    assert response.status_code == 200
    return {p["name"]: p for p in response.json()["players"]}


def test_share_page_shows_state_after_the_final_battle(client):
    game_id, game = _start_game(client, ["Alice", "Bob"])
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


def test_share_page_shows_final_state_of_player_eliminated_mid_game(client):
    game_id, game = _start_game(client, ["Alice", "Bob", "Carol", "Dave"])
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
    rows = _share_rows(client, game_id, "Dave")
    assert rows["Dave"]["final_poison"] == dave.poison
    assert rows["Dave"]["final_treasures"] == dave.treasures
    assert rows["Alice"]["final_treasures"] is None


def test_share_page_shows_how_sudden_death_ended(client):
    game_id, game = _start_game(client, ["Alice", "Bob"])
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
        db.add(GameRecord(id="old-game"))
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

