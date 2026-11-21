import { expect, test, type Locator, type Page } from '@playwright/test'

const API_RESPONSES: Record<string, { status?: number; json: unknown }> = {
  '/api/auth/me': { status: 401, json: { detail: 'Not authenticated' } },
  '/api/server/status': {
    json: {
      mode: 'normal',
      message: '',
      updated_at: '2026-01-01T00:00:00Z',
      new_games_blocked: false,
      scheduled_for_utc: null,
      estimated_recovery_minutes: null,
    },
  },
  '/api/games/cubes/warm': { json: { status: 'ok' } },
}

async function serveWithoutBackend(page: Page, baseURL: string) {
  const appOrigin = new URL(baseURL).origin
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== appOrigin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const response = API_RESPONSES[url.pathname]
    if (!response) return route.fulfill({ status: 404, json: { detail: 'Not mocked' } })
    return route.fulfill(response)
  })
}

// Playwright offers no swipe or wheel input in mobile WebKit, and scrollIntoView would also
// scroll overflow:hidden boxes that no finger can move. Scrolling only the boxes a swipe can
// scroll keeps a clipped, unscrollable panel failing the way it fails on a phone.
async function swipeToBottom(element: Locator) {
  await element.evaluate((target) => {
    const scrollsOnSwipe = (node: Element) => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
    for (let node = target.parentElement; node; node = node.parentElement) {
      if (scrollsOnSwipe(node)) node.scrollTop = node.scrollHeight
    }
    window.scrollTo(0, document.documentElement.scrollHeight)
  })
}

test.beforeEach(async ({ page, baseURL }) => {
  await serveWithoutBackend(page, baseURL!)
  await page.goto('/play')
})

test('Start Game can be scrolled fully into view', async ({ page }) => {
  const startGame = page.getByRole('button', { name: 'Start Game' })
  await swipeToBottom(startGame)

  await expect(startGame).toBeInViewport({ ratio: 1 })
})

test('Create Lobby can be scrolled fully into view', async ({ page }) => {
  await page.getByRole('button', { name: 'Play with Friends' }).tap()
  const createLobby = page.getByRole('button', { name: 'Create Lobby' })
  await swipeToBottom(createLobby)

  await expect(createLobby).toBeInViewport({ ratio: 1 })
})
