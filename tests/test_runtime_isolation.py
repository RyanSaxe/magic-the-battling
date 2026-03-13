import server.main as main_module
import server.monitoring as monitoring_module
import server.routers.games as games_module
import server.routers.ops as ops_module
import server.routers.ws as ws_module
import server.services.game_manager as gm_module
import server.services.session_manager as sm_module


def test_runtime_singletons_are_shared_across_app_modules(client):
    game_managers = {
        id(gm_module.game_manager),
        id(ws_module.game_manager),
        id(games_module.game_manager),
        id(ops_module.game_manager),
        id(main_module.game_manager),
        id(monitoring_module.game_manager),
    }
    session_managers = {
        id(sm_module.session_manager),
        id(gm_module.session_manager),
        id(ws_module.session_manager),
        id(games_module.session_manager),
        id(ops_module.session_manager),
        id(main_module.session_manager),
        id(monitoring_module.session_manager),
    }
    connection_managers = {
        id(ws_module.connection_manager),
        id(games_module.connection_manager),
        id(ops_module.connection_manager),
        id(monitoring_module.connection_manager),
    }

    assert len(game_managers) == 1
    assert len(session_managers) == 1
    assert len(connection_managers) == 1


def test_runtime_singletons_start_clean_and_track_current_test_state(client):
    assert not gm_module.game_manager._active_games
    assert not gm_module.game_manager._pending_games
    assert gm_module.session_manager.size() == 0
    assert not ws_module.connection_manager._connections
    assert not games_module._create_idempotency_cache

    response = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
    assert response.status_code == 200

    assert len(gm_module.game_manager._pending_games) == 1
    assert gm_module.session_manager.size() == 1
