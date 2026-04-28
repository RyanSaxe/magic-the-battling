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


_HTML_WITH_STATIC_OG = """\
<html><head>
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://www.cruciblemtg.com/" />
    <meta property="og:title" content="Crucible" />
    <meta property="og:description" content="A Magic: The Gathering format" />
    <meta property="og:image" content="https://www.cruciblemtg.com/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Crucible" />
    <meta name="twitter:description" content="A Magic: The Gathering format" />
    <meta name="twitter:image" content="https://www.cruciblemtg.com/og-image.png" />
</head></html>"""


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

    def test_static_og_tags_stripped(self):
        html = _build_og_html(_HTML_WITH_STATIC_OG, "g1", "Alice", _make_share_data(), "https://example.com")
        assert "og-image.png" not in html
        assert 'content="Crucible"' not in html
        assert "A Magic: The Gathering format" not in html
        assert 'content="https://www.cruciblemtg.com/"' not in html

    def test_dynamic_tags_present_after_stripping(self):
        html = _build_og_html(_HTML_WITH_STATIC_OG, "g1", "Alice", _make_share_data(), "https://example.com")
        assert 'og:image" content="https://example.com/game/g1/share/Alice/preview.png"' in html
        assert "1st Place" in html
        assert html.count('property="og:image"') == 1

    def test_og_url_points_to_share_page(self):
        html = _build_og_html(_HTML_WITH_STATIC_OG, "g1", "Alice", _make_share_data(), "https://example.com")
        assert 'og:url" content="https://example.com/game/g1/share/Alice"' in html

    def test_html_escaping_in_player_name(self):
        html = _build_og_html(
            "<html><head></head></html>",
            "g1",
            'Al"ice<script>',
            _make_share_data('Al"ice<script>', 1),
            "https://example.com",
        )
        assert 'Al"ice' not in html
        assert "Al&quot;ice&lt;script&gt;" in html
        assert "Al%22ice%3Cscript%3E" in html  # URL-encoded in og:url/og:image

    def test_non_og_meta_tags_preserved(self):
        source = (
            '<html><head><meta name="description" content="Keep me" />'
            '<meta property="og:title" content="Remove" /></head></html>'
        )
        html = _build_og_html(source, "g1", "A", _make_share_data("A", 1), "https://x.com")
        assert 'content="Keep me"' in html
        assert 'content="Remove"' not in html


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
            result = asyncio.run(service.screenshot("http://example.com/embed", "cache_key_123"))

        assert result == b"png_data"

    def test_non_target_closed_error_propagates(self):
        service = PreviewService()
        service._browser = MagicMock()
        service._playwright = MagicMock()

        other_error = PlaywrightError("Some other Playwright error")
        service._browser.new_context = AsyncMock(side_effect=other_error)

        with pytest.raises(PlaywrightError, match="Some other Playwright error"):
            asyncio.run(service.screenshot("http://example.com/embed", "cache_key_456"))
