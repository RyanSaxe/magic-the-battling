import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from playwright.async_api import Error as PlaywrightError

from server.routers.share_preview import _build_og_html
from server.schemas.api import ShareGameResponse, SharePlayerData
from server.services.preview import PreviewService


def _make_share_data(player_name: str = "Alice", placement: int | None = 1) -> ShareGameResponse:
    return ShareGameResponse(
        game_id="game123",
        owner_name=player_name,
        created_at="2025-01-01T00:00:00",
        use_upgrades=True,
        players=[
            SharePlayerData(
                name=player_name,
                final_placement=placement,
                final_poison=0,
                is_puppet=False,
                snapshots=[],
            ),
        ],
    )


class TestBuildOgHtml:
    def test_image_url_is_absolute(self):
        html = _build_og_html(
            "<html><head></head></html>",
            "game123",
            "Alice",
            _make_share_data(),
            "https://example.com",
        )
        assert 'content="https://example.com/game/game123/share/Alice/preview.png"' in html

    def test_image_url_uses_provided_base(self):
        html = _build_og_html(
            "<html><head></head></html>",
            "g1",
            "Bob",
            _make_share_data("Bob", 2),
            "http://localhost:8000",
        )
        assert 'content="http://localhost:8000/game/g1/share/Bob/preview.png"' in html


class TestPreviewServiceRestart:
    def test_restart_on_target_closed_error(self):
        service = PreviewService()
        service._browser = MagicMock()
        service._playwright = MagicMock()

        target_closed = PlaywrightError("Browser.new_context: Target page, context or browser has been closed")
        service._browser.new_context = AsyncMock(side_effect=target_closed)

        mock_playwright_cm = AsyncMock()
        mock_browser = AsyncMock()
        mock_browser.new_context.return_value = AsyncMock()
        mock_context = mock_browser.new_context.return_value
        mock_page = AsyncMock()
        mock_page.screenshot.return_value = b"png_data"
        mock_context.new_page.return_value = mock_page
        mock_playwright_cm.chromium.launch.return_value = mock_browser

        with patch("server.services.preview.async_playwright") as mock_pw:
            mock_pw.return_value.start = AsyncMock(return_value=mock_playwright_cm)
            result = asyncio.get_event_loop().run_until_complete(
                service.screenshot("http://example.com/embed", "cache_key_123")
            )

        assert result == b"png_data"

    def test_non_target_closed_error_propagates(self):
        service = PreviewService()
        service._browser = MagicMock()
        service._playwright = MagicMock()

        other_error = PlaywrightError("Some other Playwright error")
        service._browser.new_context = AsyncMock(side_effect=other_error)

        with pytest.raises(PlaywrightError, match="Some other Playwright error"):
            asyncio.get_event_loop().run_until_complete(service.screenshot("http://example.com/embed", "cache_key_456"))
