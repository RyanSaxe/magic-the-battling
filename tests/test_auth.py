import logging
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from httpx import Response
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.exc import IntegrityError

import server.db.database as db_module
import server.routers.auth as auth_router
import server.services.auth as auth_service
from server import runtime_config
from server.db.models import Base

LOWERCASE_INDEXES = {"ix_users_username_lower", "ix_users_email_lower"}


def _register(client: TestClient, username: str, *, email: str) -> Response:
    return client.post("/api/auth/register", json={"username": username, "password": "password123", "email": email})


class TestAuthCookies:
    def test_register_sets_secure_cookie_outside_local_dev(
        self, client: TestClient, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr(auth_router, "AUTH_COOKIE_SECURE", True)

        response = client.post(
            "/api/auth/register",
            json={"username": "secure_user", "password": "password123", "email": "secure@test.com"},
        )

        assert response.status_code == 200
        assert "Secure" in response.headers["set-cookie"]

    def test_login_omits_secure_cookie_in_local_dev(self, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
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

    def test_login_invalid_credentials_returns_structured_error(self, client: TestClient) -> None:
        response = client.post(
            "/api/auth/login",
            json={"username": "missing_user", "password": "password123"},
        )

        assert response.status_code == 401
        assert response.json()["code"] == "INVALID_CREDENTIALS"


class TestRuntimeConfig:
    def test_requires_auth_secret_outside_local_dev(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MTB_LOCAL_DEV", "0")
        monkeypatch.delenv("MTB_AUTH_SECRET_KEY", raising=False)

        with pytest.raises(RuntimeError, match="MTB_AUTH_SECRET_KEY"):
            runtime_config.resolve_auth_secret_key()

    def test_rejects_default_auth_secret_outside_local_dev(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MTB_LOCAL_DEV", "0")
        monkeypatch.setenv("MTB_AUTH_SECRET_KEY", "dev-secret-change-in-production")

        with pytest.raises(RuntimeError, match="deployment-specific secret"):
            runtime_config.resolve_auth_secret_key()

    def test_local_dev_uses_fallback_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("MTB_LOCAL_DEV", "1")
        monkeypatch.delenv("MTB_AUTH_SECRET_KEY", raising=False)

        assert runtime_config.resolve_auth_secret_key() == "local-dev-secret-key-change-before-production"

    def test_tokens_round_trip_with_explicit_secret(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(auth_service, "AUTH_SECRET_KEY", "unit-test-secret-key-1234567890abcd")

        token = auth_service.create_access_token("user-123", "alice")
        claims = auth_service.decode_access_token(token)

        assert claims is not None
        assert claims["user_id"] == "user-123"
        assert claims["username"] == "alice"


class TestCaseInsensitiveAccounts:
    def test_sign_up_rejects_a_username_that_differs_only_by_case(self, client: TestClient) -> None:
        assert _register(client, "jace_fan", email="jace@test.com").status_code == 200

        exact = _register(client, "jace_fan", email="exact@test.com")
        other_case = _register(client, "Jace_Fan", email="other@test.com")

        assert other_case.status_code == 409
        assert other_case.json() == exact.json()
        assert other_case.json()["code"] == "USERNAME_TAKEN"

    def test_sign_up_rejects_an_email_that_differs_only_by_case(self, client: TestClient) -> None:
        assert _register(client, "jace_fan", email="jace.fan@test.com").status_code == 200

        exact = _register(client, "exact_case", email="jace.fan@test.com")
        other_case = _register(client, "other_case", email="Jace.Fan@Test.com")

        assert other_case.status_code == 409
        assert other_case.json() == exact.json()
        assert other_case.json()["code"] == "EMAIL_IN_USE"

    def test_login_accepts_any_case_and_keeps_the_name_as_typed(self, client: TestClient) -> None:
        assert _register(client, "Jace_Fan", email="Jace.Fan@Test.com").status_code == 200
        client.post("/api/auth/logout")

        for typed in ("jace_fan", "JACE_FAN"):
            response = client.post("/api/auth/login", json={"username": typed, "password": "password123"})

            assert response.status_code == 200
            assert response.json()["username"] == "Jace_Fan"
            assert response.json()["email"] == "Jace.Fan@Test.com"

    @pytest.mark.parametrize("names", [("Jace_Fan", "jace_fan"), ("jace_fan", "Jace_Fan")])
    @pytest.mark.parametrize("passwords", [("password123", "password123"), ("password123", "different456")])
    def test_login_never_picks_between_accounts_that_differ_only_by_case(
        self, client: TestClient, names: tuple[str, str], *, passwords: tuple[str, str]
    ) -> None:
        db = db_module.SessionLocal()
        try:
            for index in LOWERCASE_INDEXES:
                db.execute(text(f"DROP INDEX {index}"))
            ids = [
                str(auth_service.create_user(db, name, password=pw).id)
                for name, pw in zip(names, passwords, strict=True)
            ]
        finally:
            db.close()

        for username, password, user_id in zip(names, passwords, ids, strict=True):
            exact = client.post("/api/auth/login", json={"username": username, "password": password})
            assert exact.status_code == 200
            assert exact.json()["user_id"] == user_id
            assert client.get("/api/auth/me").json()["user_id"] == user_id

        for password in passwords:
            third_spelling = client.post("/api/auth/login", json={"username": "JACE_FAN", "password": password})
            assert third_spelling.status_code == 401
            assert third_spelling.json()["code"] == "INVALID_CREDENTIALS"

    def test_the_database_rejects_accounts_that_differ_only_by_case(self, test_db: None) -> None:
        _ = test_db
        db = db_module.SessionLocal()
        try:
            auth_service.create_user(db, "jace_fan", password="password123", email="jace@test.com")  # noqa: S106 -- test fixture credential literal
            with pytest.raises(IntegrityError):
                auth_service.create_user(db, "JACE_FAN", password="password123", email="other@test.com")  # noqa: S106 -- test fixture credential literal
            db.rollback()
            with pytest.raises(IntegrityError):
                auth_service.create_user(db, "someone_else", password="password123", email="JACE@test.com")  # noqa: S106 -- test fixture credential literal
        finally:
            db.close()


def _database_from_before_the_indexes(tmp_path: Path, accounts: list[tuple[str, str]]) -> Engine:
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for name in LOWERCASE_INDEXES:
            conn.execute(text(f"DROP INDEX {name}"))
        for number, (username, email) in enumerate(accounts):
            conn.execute(
                text("INSERT INTO users (id, username, email, password_hash) VALUES (:id, :username, :email, 'x')"),
                {"id": f"user-{number}", "username": username, "email": email},
            )
    return engine


def _index_names(engine: Engine) -> set[str]:
    with engine.connect() as conn:
        return set(conn.execute(text("SELECT name FROM sqlite_master WHERE type = 'index'")).scalars())


def test_init_db_adds_the_lowercase_indexes_to_an_existing_database(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    engine = _database_from_before_the_indexes(tmp_path, [("jace_fan", "jace@test.com")])
    monkeypatch.setattr(db_module, "engine", engine)

    db_module.init_db()
    db_module.init_db()

    assert _index_names(engine) >= LOWERCASE_INDEXES
    with pytest.raises(IntegrityError), engine.begin() as conn:
        conn.execute(text("INSERT INTO users (id, username, password_hash) VALUES ('user-new', 'Jace_Fan', 'x')"))


def test_init_db_adds_neither_index_while_accounts_differ_only_by_case(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, *, caplog: pytest.LogCaptureFixture
) -> None:
    accounts = [("jace_fan", "jace@test.com"), ("someone_else", "JACE@test.com")]
    engine = _database_from_before_the_indexes(tmp_path, accounts)
    monkeypatch.setattr(db_module, "engine", engine)

    with caplog.at_level(logging.ERROR, logger="server.db.database"):
        db_module.init_db()

    assert not LOWERCASE_INDEXES & _index_names(engine)
    assert "ix_users_username_lower: 0 group(s)" in caplog.text
    assert "ix_users_email_lower: 1 group(s)" in caplog.text
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM users")).scalar_one() == len(accounts)
