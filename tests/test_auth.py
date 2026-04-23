import importlib

import pytest

import server.routers.auth as auth_router
import server.services.auth as auth_service
from server import runtime_config


class TestAuthCookies:
    def test_register_sets_secure_cookie_outside_local_dev(self, client, monkeypatch):
        monkeypatch.setattr(auth_router, "AUTH_COOKIE_SECURE", True)

        response = client.post(
            "/api/auth/register",
            json={"username": "secure_user", "password": "password123", "email": "secure@test.com"},
        )

        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]

    def test_login_omits_secure_cookie_in_local_dev(self, client, monkeypatch):
        monkeypatch.setattr(auth_router, "AUTH_COOKIE_SECURE", False)

        register = client.post(
            "/api/auth/register",
            json={"username": "local_user", "password": "password123", "email": "local@test.com"},
        )
        assert register.status_code == 200
        client.post("/api/auth/logout")

        response = client.post(
            "/api/auth/login",
            json={"username": "local_user", "password": "password123", "email": "local@test.com"},
        )

        assert response.status_code == 200
        assert "Secure" not in response.headers["set-cookie"]


class TestRuntimeConfig:
    def test_requires_auth_secret_outside_local_dev(self, monkeypatch):
        monkeypatch.setenv("MTB_LOCAL_DEV", "0")
        monkeypatch.delenv("MTB_AUTH_SECRET_KEY", raising=False)

        try:
            with pytest.raises(RuntimeError, match="MTB_AUTH_SECRET_KEY"):
                importlib.reload(runtime_config)
        finally:
            monkeypatch.setenv("MTB_LOCAL_DEV", "1")
            importlib.reload(runtime_config)

    def test_rejects_default_auth_secret_outside_local_dev(self, monkeypatch):
        monkeypatch.setenv("MTB_LOCAL_DEV", "0")
        monkeypatch.setenv("MTB_AUTH_SECRET_KEY", "dev-secret-change-in-production")

        try:
            with pytest.raises(RuntimeError, match="deployment-specific secret"):
                importlib.reload(runtime_config)
        finally:
            monkeypatch.setenv("MTB_LOCAL_DEV", "1")
            monkeypatch.delenv("MTB_AUTH_SECRET_KEY", raising=False)
            importlib.reload(runtime_config)

    def test_local_dev_uses_fallback_secret(self, monkeypatch):
        monkeypatch.setenv("MTB_LOCAL_DEV", "1")
        monkeypatch.delenv("MTB_AUTH_SECRET_KEY", raising=False)

        config = importlib.reload(runtime_config)

        assert config.IS_LOCAL_DEV is True
        assert config.AUTH_SECRET_KEY == "local-dev-secret-key-change-before-production"

    def test_tokens_round_trip_with_explicit_secret(self, monkeypatch):
        monkeypatch.setattr(auth_service, "AUTH_SECRET_KEY", "unit-test-secret-key-1234567890abcd")

        token = auth_service.create_access_token("user-123", "alice")
        claims = auth_service.decode_access_token(token)

        assert claims is not None
        assert claims["user_id"] == "user-123"
        assert claims["username"] == "alice"
