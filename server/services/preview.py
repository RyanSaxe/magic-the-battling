import asyncio
import hashlib
import logging
from collections import OrderedDict

from playwright.async_api import Browser, async_playwright
from playwright.async_api import Error as PlaywrightError

logger = logging.getLogger(__name__)

MAX_CACHE_ENTRIES = 64
MAX_CACHE_BYTES = 128 * 1024 * 1024
SCREENSHOT_WIDTH = 1200
SCREENSHOT_HEIGHT = 630
DEVICE_SCALE_FACTOR = 2
SCREENSHOT_TIMEOUT_MS = 15_000


class PreviewCache:
    def __init__(self, max_entries: int = MAX_CACHE_ENTRIES, max_bytes: int = MAX_CACHE_BYTES):
        self._entries: OrderedDict[str, bytes] = OrderedDict()
        self._max_entries = max_entries
        self._max_bytes = max_bytes
        self._total_bytes = 0

    @staticmethod
    def cache_key(data_json: str) -> str:
        return hashlib.sha256(data_json.encode()).hexdigest()

    def get(self, key: str) -> bytes | None:
        if key in self._entries:
            self._entries.move_to_end(key)
            return self._entries[key]
        return None

    def put(self, key: str, data: bytes) -> None:
        if key in self._entries:
            self._total_bytes -= len(self._entries[key])
            del self._entries[key]
        self._entries[key] = data
        self._total_bytes += len(data)
        self._entries.move_to_end(key)
        self._evict()

    def _evict(self) -> None:
        while len(self._entries) > self._max_entries or self._total_bytes > self._max_bytes:
            if not self._entries:
                break
            _, evicted = self._entries.popitem(last=False)
            self._total_bytes -= len(evicted)


class PreviewService:
    def __init__(self) -> None:
        self.cache = PreviewCache()
        self._browser: Browser | None = None
        self._playwright = None
        self._semaphore = asyncio.Semaphore(2)

    async def start(self) -> None:
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
        )
        logger.info("Preview browser started")

    async def stop(self) -> None:
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()
        logger.info("Preview browser stopped")

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
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(
            args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--single-process"],
        )
        logger.info("Preview browser restarted")

    async def _take_screenshot(self, embed_url: str) -> bytes:
        if not self._browser:
            raise RuntimeError("Preview browser not started")

        context = await self._browser.new_context(
            viewport={"width": SCREENSHOT_WIDTH, "height": SCREENSHOT_HEIGHT},
            device_scale_factor=DEVICE_SCALE_FACTOR,
        )
        try:
            page = await context.new_page()
            await page.goto(embed_url, wait_until="networkidle", timeout=SCREENSHOT_TIMEOUT_MS)
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
