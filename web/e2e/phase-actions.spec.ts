import type { Page, WebSocketRoute } from '@playwright/test'
import { expect, serveGame, test } from './helpers'
import { GAME_ID, gameBootstrap, type ScreenState } from './gameStates'

const BUILD: ScreenState = { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6 } }
const REWARD: ScreenState = { phase: 'reward', counts: { sideboard: 8 } }

async function openGame(page: Page, baseURL: string, screen: ScreenState) {
  const actions: string[] = []
  let socket: WebSocketRoute | null = null
  await serveGame(page, baseURL, screen, {
    onSocket: (ws) => {
      socket = ws
      ws.onMessage((message) => actions.push(JSON.parse(String(message)).action))
    },
  })
  await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
  return {
    sent: (action: string) => actions.filter((sent) => sent === action).length,
    broadcast: (state: unknown) => socket!.send(JSON.stringify({ type: 'game_state', payload: state })),
  }
}

/** Waits two frames, so React has run the effects of the last update. */
async function settle(page: Page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test('Submit Hand stays disabled when another player updates before the server confirms it', async ({ page, baseURL }) => {
  const game = await openGame(page, baseURL!, BUILD)
  await page.getByRole('button', { name: 'Submit Hand' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect.poll(() => game.sent('build_ready')).toBe(1)

  const { state } = gameBootstrap(BUILD)
  state.players[1] = { ...state.players[1], build_ready: true, poison: 8 }
  game.broadcast(state)
  await expect(page.getByRole('button', { name: /Bob/ }).first()).toContainText('8')
  await settle(page)

  await expect(page.getByRole('button', { name: 'Submitting...' })).toBeDisabled()
})

test('a double click on Continue sends one reward_done', async ({ page, baseURL }) => {
  const game = await openGame(page, baseURL!, REWARD)
  await page.getByRole('button', { name: 'Continue' }).dblclick()
  await expect.poll(() => game.sent('reward_done')).toBeGreaterThan(0)
  await settle(page)

  expect(game.sent('reward_done')).toBe(1)
})

const FIGHT: ScreenState = { phase: 'battle', counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6 } }

// A locator click waits for two frames, and WebKit on Linux can go seconds between frames while a game first
// renders. The menu tests send the click event, or click a position where what lies on top matters.

// A row that moves as its submenu opens puts a different row under the next tap.
async function expectOpensInPlace(page: Page, name: string) {
  const row = page.getByRole('button', { name })
  const before = await row.boundingBox()
  await row.dispatchEvent('click')
  await expect(row).toHaveAttribute('aria-expanded', 'true')
  expect(await row.boundingBox()).toEqual(before)
}

test("Move To opens in place in a hand card's menu", async ({ page, baseURL }) => {
  await openGame(page, baseURL!, FIGHT)
  const card = (await page.locator('[data-guide-card-id^="battle-hand"]').first().boundingBox())!
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2, { button: 'right' })

  await expectOpensInPlace(page, 'Move To')
})

test('a card moved from the Actions menu is no longer selected', async ({ page, baseURL }) => {
  const game = await openGame(page, baseURL!, FIGHT)
  const creature = page.locator('[data-guide-card-id^="your-creature"]').first()
  await creature.dispatchEvent('click')
  await expect(creature).toHaveClass(/\bselected\b/)
  await page.getByRole('button', { name: 'Actions' }).dispatchEvent('click')
  await page.getByRole('button', { name: 'Move To' }).dispatchEvent('click')
  await page.locator('.menu-submenu').getByRole('button', { name: 'Graveyard', exact: true }).dispatchEvent('click')

  await expect.poll(() => game.sent('battle_move')).toBe(1)
  // A card left selected moves again on the next tap on a pile.
  await expect(creature).not.toHaveClass(/\bselected\b/)
})

test('a bar button acts on the first click while the Actions menu is open', async ({ page, baseURL }) => {
  await openGame(page, baseURL!, FIGHT)
  await page.getByRole('button', { name: 'Actions' }).dispatchEvent('click')
  await expect(page.getByRole('button', { name: 'Roll a Die' })).toBeVisible()

  const submit = (await page.getByRole('button', { name: 'Submit Result' }).boundingBox())!
  await page.mouse.click(submit.x + submit.width / 2, submit.y + submit.height / 2)

  await expect(page.locator('[data-guide-target="battle-submit-popover"]').getByRole('button', { name: 'I Won' })).toBeVisible()
})
