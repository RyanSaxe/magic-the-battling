import type { Locator, Page } from '@playwright/test'
import { expect, serveSignedIn, test } from './helpers'

const PHONES = [
  { name: '390×844 phone', viewport: { width: 390, height: 844 } },
  { name: '360×780 phone', viewport: { width: 360, height: 780 } },
]

const FOLLOWED_SUMMARY = {
  cube_id: 'vintage-cube',
  cube_name: 'Vintage Cube',
  cube_image_uri: null,
  game_count: 4,
  human_player_count: 5,
  last_played: '2026-01-02T00:00:00Z',
  popular_setup: { play_mode: 'limited', use_upgrades: true },
  is_following: true,
  follow_id: 7,
}

const CASES: { name: string; path: string; labels: string[]; serve?: (page: Page) => Promise<unknown> }[] = [
  { name: 'a cube page', path: '/cube/vintage-cube', labels: ['Follow', 'Save', 'Play'] },
  {
    name: 'a followed cube’s page',
    path: '/cube/vintage-cube',
    labels: ['✓ Following', 'Save', 'Play'],
    serve: (page) => page.route('**/api/battlers/cube/vintage-cube', (route) => route.fulfill({ json: FOLLOWED_SUMMARY })),
  },
  { name: 'a saved preset’s page', path: '/dashboard/list/1', labels: ['Edit', 'Play'] },
]

/** The tops of the lines a button's label sits on: one top when it doesn't wrap. */
async function labelLineTops(button: Locator): Promise<number[]> {
  return button.evaluate((element) => {
    const tops = new Set<number>()
    const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      if (!node.textContent?.trim()) continue
      const range = document.createRange()
      range.selectNodeContents(node)
      for (const rect of Array.from(range.getClientRects())) tops.add(Math.round(rect.top))
    }
    return [...tops]
  })
}

for (const { name, viewport } of PHONES) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: true })

    for (const pageCase of CASES) {
      test(`${pageCase.name} keeps each button’s label on one line`, async ({ page, baseURL }) => {
        await serveSignedIn(page, baseURL!)
        await pageCase.serve?.(page)
        await page.goto(pageCase.path)

        const buttons = page.getByRole('region', { name: 'Vintage Cube' }).getByRole('button')
        await expect(buttons).toHaveText(pageCase.labels)
        for (const button of await buttons.all()) {
          expect(await labelLineTops(button), `"${await button.textContent()}" wraps`).toHaveLength(1)
        }
      })
    }
  })
}
