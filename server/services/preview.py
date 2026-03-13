import asyncio
import hashlib
import logging
import os
from pathlib import Path

from playwright.async_api import Browser, async_playwright
from playwright.async_api import Error as PlaywrightError

logger = logging.getLogger(__name__)

SCREENSHOT_WIDTH = 1200
SCREENSHOT_HEIGHT = 630
DEVICE_SCALE_FACTOR = 1
SCREENSHOT_TIMEOUT_MS = 15_000
IDLE_SHUTDOWN_SECONDS = 300
DISK_CACHE_MAX_BYTES = 100 * 1024 * 1024

CHROMIUM_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--single-process",
    "--disable-extensions",
    "--js-flags=--max-old-space-size=128",
    "--renderer-process-limit=1",
]


def _cache_dir() -> Path:
    return Path(os.environ.get("PREVIEW_CACHE_DIR", "/data/previews"))


def cache_key(data_json: str) -> str:
    return hashlib.sha256(data_json.encode()).hexdigest()


class DiskCache:
    def __init__(self, directory: Path, max_bytes: int = DISK_CACHE_MAX_BYTES):
        self._dir = directory
        self._max_bytes = max_bytes
        self._initialized = False

    def _ensure_dir(self) -> bool:
        if self._initialized:
            return True
        try:
            self._dir.mkdir(parents=True, exist_ok=True)
            self._initialized = True
            return True
        except OSError:
            return False

    def _path(self, key: str) -> Path:
        return self._dir / f"{key}.png"

    def get(self, key: str) -> bytes | None:
        if not self._ensure_dir():
            return None
        p = self._path(key)
        if p.exists():
            return p.read_bytes()
        return None

    def put(self, key: str, data: bytes) -> None:
        if not self._ensure_dir():
            return
        self._path(key).write_bytes(data)
        self._evict()

    def _evict(self) -> None:
        files = sorted(self._dir.glob("*.png"), key=lambda f: f.stat().st_mtime)
        total = sum(f.stat().st_size for f in files)
        while total > self._max_bytes and files:
            oldest = files.pop(0)
            total -= oldest.stat().st_size
            oldest.unlink(missing_ok=True)


class PreviewService:
    def __init__(self) -> None:
        self.cache = DiskCache(_cache_dir())
        self._browser: Browser | None = None
        self._playwright = None
        self._semaphore = asyncio.Semaphore(2)
        self._idle_timer: asyncio.TimerHandle | None = None
        self._shutdown_task: asyncio.Task[None] | None = None

    async def _ensure_browser(self) -> None:
        if self._browser:
            return
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(args=CHROMIUM_ARGS)
        logger.info("Preview browser started (lazy)")

    async def start(self) -> None:
        await self._ensure_browser()

    async def stop(self) -> None:
        self._cancel_idle_timer()
        if self._browser:
            await self._browser.close()
            self._browser = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None
        logger.info("Preview browser stopped")

    def _cancel_idle_timer(self) -> None:
        if self._idle_timer:
            self._idle_timer.cancel()
            self._idle_timer = None

    def _reset_idle_timer(self) -> None:
        self._cancel_idle_timer()
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        self._idle_timer = loop.call_later(IDLE_SHUTDOWN_SECONDS, self._idle_shutdown)

    def _idle_shutdown(self) -> None:
        self._shutdown_task = asyncio.ensure_future(self.stop())

    async def _restart_browser(self) -> None:
        logger.warning("Restarting preview browser after crash")
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        try:
            if self._playwright:
                await self._playwright.stop()
        except Exception:
            pass
        self._browser = None
        self._playwright = None
        await self._ensure_browser()

    async def _take_screenshot(self, embed_url: str) -> bytes:
        if not self._browser:
            raise RuntimeError("Preview browser not started")

        context = await self._browser.new_context(
            viewport={"width": SCREENSHOT_WIDTH, "height": SCREENSHOT_HEIGHT},
            device_scale_factor=DEVICE_SCALE_FACTOR,
        )
        try:
            page = await context.new_page()
            await page.goto(embed_url, wait_until="domcontentloaded", timeout=SCREENSHOT_TIMEOUT_MS)
            await page.wait_for_selector("[data-embed-ready]", timeout=SCREENSHOT_TIMEOUT_MS)
            return await page.screenshot(type="png")
        finally:
            await context.close()

    async def screenshot(self, embed_url: str, cache_key: str) -> bytes:
        cached = self.cache.get(cache_key)
        if cached:
            return cached

        async with self._semaphore:
            cached = self.cache.get(cache_key)
            if cached:
                return cached

            await self._ensure_browser()
            self._reset_idle_timer()

            try:
                png = await self._take_screenshot(embed_url)
            except PlaywrightError as exc:
                if "Target page, context or browser has been closed" not in str(exc):
                    raise
                await self._restart_browser()
                png = await self._take_screenshot(embed_url)

            self.cache.put(cache_key, png)
            return png


preview_service = PreviewService()
