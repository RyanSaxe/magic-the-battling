from server.services.ops_manager import ops_manager


class TestServerStatus:
    def test_returns_normal_status_by_default(self, client):
        ops_manager.set_mode("normal", "", "test")

        response = client.get("/api/server/status")

        assert response.status_code == 200
        data = response.json()
        assert data["mode"] == "normal"
        assert data["new_games_blocked"] is False
        assert data["scheduled_for_utc"] is None
        assert data["estimated_recovery_minutes"] is None

    def test_draining_status_includes_schedule_fields(self, client):
        ops_manager.set_mode(
            "draining",
            "Server update scheduled for 2099-01-01 12:00 UTC. New games are temporarily paused.",
            "test",
        )

        try:
            response = client.get("/api/server/status")
            assert response.status_code == 200
            data = response.json()
            assert data["mode"] == "draining"
            assert data["new_games_blocked"] is True
            assert data["scheduled_for_utc"] == "2099-01-01T12:00:00+00:00"
            assert isinstance(data["estimated_recovery_minutes"], int)
            assert data["estimated_recovery_minutes"] > 0
        finally:
            ops_manager.set_mode("normal", "", "test")

    def test_create_game_during_drain_returns_retry_after(self, client):
        ops_manager.set_mode(
            "draining",
            "Server update scheduled for 2099-01-01 12:00 UTC. New games are temporarily paused.",
            "test",
        )

        try:
            response = client.post("/api/games", json={"player_name": "Alice", "cube_id": "test"})
            assert response.status_code == 503
            assert response.headers.get("retry-after") is not None
            assert "Server is updating" in response.json()["detail"]
        finally:
            ops_manager.set_mode("normal", "", "test")
