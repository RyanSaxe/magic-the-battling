import asyncio
from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient
from playwright.async_api import Error as PlaywrightError
from starlette.requests import Request
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

import server.routers.share_preview as share_preview_module
from server.main import app
from server.routers.share_preview import RATE_LIMIT_MAX, SlidingWindowRateLimiter, _build_og_html, serve_index
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
    <meta property="og:title" content="Pitfight" />
    <meta property="og:description" content="A Magic: The Gathering format" />
    <meta property="og:image" content="https://www.cruciblemtg.com/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Pitfight" />
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
        assert 'content="Pitfight"' not in html
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


class TestSiteLinkPreview:
    @pytest.mark.parametrize("host", ["dev.pitfight.test", "pitfight.test"])
    @pytest.mark.parametrize("path", ["/game/missing/share/Alice", "/game/not.an.id/share/Al%20Smith?spectate=true"])
    def test_a_link_names_the_site_and_page_it_was_posted_from(self, client, monkeypatch, host, path):
        # CI's pytest job has no web build, so serve the page the build starts from.
        source = Path(__file__).parent.parent / "web" / "index.html"
        monkeypatch.setattr(share_preview_module, "INDEX_HTML", source)
        # scripts/start_server.sh trusts the proxy's headers, so Fly's https reaches the tags.
        proxied = TestClient(cast(Any, ProxyHeadersMiddleware(cast(Any, app), trusted_hosts="*")))

        html = proxied.get(path, headers={"Host": host, "X-Forwarded-Proto": "https"}).text

        image = f"https://{host}/og-image.png?v=pitfight"
        assert f'<meta property="og:url" content="https://{host}{path}" />' in html
        assert f'<meta property="og:image" content="{image}" />' in html
        assert f'<meta name="twitter:image" content="{image}" />' in html

    def test_a_link_cannot_break_out_of_its_tag(self, client, monkeypatch):
        source = Path(__file__).parent.parent / "web" / "index.html"
        monkeypatch.setattr(share_preview_module, "INDEX_HTML", source)

        html = client.get("/game/missing/share/Alice", headers={"Host": 'x"><script>'}).text
        assert 'x"><script>' not in html

        # Starlette 1.x ignores malformed Host headers before they reach handlers, so also
        # verify serve_index escapes raw unencoded query text that arrives in an ASGI scope.
        request = Request(
            {
                "type": "http",
                "method": "GET",
                "scheme": "https",
                "path": "/game/missing/share/Alice",
                "query_string": b'q="><script>',
                "headers": [(b"host", b"pitfight.test")],
            }
        )
        body = bytes(serve_index(request).body).decode("utf-8")
        assert '"><script>' not in body
        assert "q=&quot;&gt;&lt;script&gt;" in body


class _FakePage:
    def __init__(self, png: bytes = b"png_data") -> None:
        self._png = png

    async def goto(self, _url: str, **_kwargs: Any) -> None:
        pass

    async def wait_for_selector(self, _selector: str, **_kwargs: Any) -> None:
        pass

    async def screenshot(self, **_kwargs: Any) -> bytes:
        return self._png


class _FakeContext:
    def __init__(self, page: _FakePage | None = None) -> None:
        self._page = page or _FakePage()

    async def new_page(self) -> _FakePage:
        return self._page

    async def close(self) -> None:
        pass


class _FakeBrowser:
    def __init__(self, *, error: Exception | None = None, png: bytes = b"png_data") -> None:
        self._error = error
        self._png = png

    async def new_context(self, **_kwargs: Any) -> _FakeContext:
        if self._error is not None:
            raise self._error
        return _FakeContext(_FakePage(self._png))

    async def close(self) -> None:
        pass


class _FakeChromium:
    def __init__(self, browser: _FakeBrowser) -> None:
        self._browser = browser

    async def launch(self, **_kwargs: Any) -> _FakeBrowser:
        return self._browser


class _FakePlaywright:
    def __init__(self, browser: _FakeBrowser | None = None) -> None:
        self.chromium = _FakeChromium(browser or _FakeBrowser())

    async def stop(self) -> None:
        pass


class _FakePlaywrightStarter:
    def __init__(self, playwright: _FakePlaywright) -> None:
        self._playwright = playwright

    async def start(self) -> _FakePlaywright:
        return self._playwright


class TestPreviewServiceRestart:
    def test_restart_on_target_closed_error(self, monkeypatch):
        service = PreviewService()
        target_closed = PlaywrightError("Browser.new_context: Target page, context or browser has been closed")
        service._browser = cast(Any, _FakeBrowser(error=target_closed))
        service._playwright = cast(Any, _FakePlaywright())

        restarted = _FakePlaywright(_FakeBrowser(png=b"png_data"))
        monkeypatch.setattr("server.services.preview.async_playwright", lambda: _FakePlaywrightStarter(restarted))

        result = asyncio.run(service.screenshot("http://example.com/embed", "cache_key_123"))

        assert result == b"png_data"

    def test_non_target_closed_error_propagates(self):
        service = PreviewService()
        other_error = PlaywrightError("Some other Playwright error")
        service._browser = cast(Any, _FakeBrowser(error=other_error))
        service._playwright = cast(Any, _FakePlaywright())

        with pytest.raises(PlaywrightError, match="Some other Playwright error"):
            asyncio.run(service.screenshot("http://example.com/embed", "cache_key_456"))


class TestPreviewRateLimit:
    def test_behind_fly_forged_forwarded_for_addresses_share_one_limit(self, client, monkeypatch):
        monkeypatch.setattr(share_preview_module, "BEHIND_FLY_PROXY", True)
        monkeypatch.setattr(
            share_preview_module,
            "_preview_rate_limiter",
            SlidingWindowRateLimiter(window_seconds=60, max_requests=RATE_LIMIT_MAX),
        )
        # scripts/start_server.sh runs uvicorn with --proxy-headers --forwarded-allow-ips "*".
        # uvicorn and Starlette type ASGI apps differently, hence the casts.
        proxied = TestClient(cast(Any, ProxyHeadersMiddleware(cast(Any, app), trusted_hosts="*")))

        statuses = [
            proxied.get(
                "/game/missing/share/Alice/preview.png",
                headers={"X-Forwarded-For": f"198.51.100.{i}", "Fly-Client-IP": "203.0.113.7"},
            ).status_code
            for i in range(RATE_LIMIT_MAX + 1)
        ]

        assert statuses[:RATE_LIMIT_MAX] == [404] * RATE_LIMIT_MAX
        assert statuses[RATE_LIMIT_MAX] == 429

    def test_limiter_forgets_clients_idle_for_a_whole_window(self):
        now = 0.0
        limiter = SlidingWindowRateLimiter(window_seconds=60, max_requests=1, clock=lambda: now)

        assert limiter.allow("a")
        assert not limiter.allow("a")
        now = 61.0
        assert limiter.allow("b")

        assert limiter.tracked_clients() == 1
        assert limiter.allow("a")
