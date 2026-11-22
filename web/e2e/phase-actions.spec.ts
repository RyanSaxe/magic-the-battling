import type { Page } from '@playwright/test'
import { expect, serveGame, test } from './helpers'
import { GAME_ID, type ScreenState } from './gameStates'

const REWARD: ScreenState = { phase: 'reward', counts: { sideboard: 8 } }

async function openGame(page: Page, baseURL: string, screen: ScreenState) {
  const actions: string[] = []
  await serveGame(page, baseURL, screen, {
    onSocket: (ws) => {
      ws.onMessage((message) => actions.push(JSON.parse(String(message)).action))
    },
  })
  await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
  return {
    sent: (action: string) => actions.filter((sent) => sent === action).length,
  }
}

/** Waits two frames, so React has run the effects of the last update. */
async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test('a double click on Continue sends one reward_done', async ({ page, baseURL }) => {
  const game = await openGame(page, baseURL!, REWARD)
  await page.getByRole('button', { name: 'Continue' }).dblclick()
  await expect.poll(() => game.sent('reward_done')).toBeGreaterThan(0)
  await settle(page)

  expect(game.sent('reward_done')).toBe(1)
})
