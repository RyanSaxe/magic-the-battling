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
const MENU_SCREENS = [
  { name: '1280×800 laptop', viewport: { width: 1280, height: 800 }, isMobile: false },
  { name: 'iPhone 15', viewport: { width: 390, height: 844 }, isMobile: true },
]
const CARD_MENUS = [
  {
    menu: "a hand card's menu",
    open: async (page: Page) => {
      const card = (await page.locator('[data-guide-card-id^="battle-hand"]').first().boundingBox())!
      await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2, { button: 'right' })
    },
    row: 'Move To',
    item: 'Graveyard',
  },
  {
    menu: 'the Actions menu for a creature',
    open: async (page: Page) => {
      await page.locator('[data-guide-card-id^="your-creature"]').first().click()
      await page.getByRole('button', { name: 'Actions' }).click()
    },
    row: 'Move To',
    item: 'Graveyard',
  },
  {
    menu: 'the Actions menu',
    open: (page: Page) => page.getByRole('button', { name: 'Actions' }).click(),
    row: 'Roll a Die',
    item: 'Custom…',
  },
]

for (const { name, viewport, isMobile } of MENU_SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const { menu, open, row, item } of CARD_MENUS) {
      // Opening a submenu once moved the whole menu, so the next tap landed on a different row.
      test(`${row} in ${menu} opens without moving the menu`, async ({ page, baseURL }) => {
        await openGame(page, baseURL!, FIGHT)
        await open(page)
        const submenuRow = page.getByRole('button', { name: row })
        const before = await submenuRow.boundingBox()

        await submenuRow.click()

        await expect(page.locator('.menu-submenu').getByRole('button', { name: item, exact: true })).toBeInViewport({ ratio: 0.99 })
        expect(await submenuRow.boundingBox()).toEqual(before)
      })
    }
  })
}

test('a card moved from the Actions menu is no longer selected', async ({ page, baseURL }) => {
  const game = await openGame(page, baseURL!, FIGHT)
  const creature = page.locator('[data-guide-card-id^="your-creature"]').first()
  await creature.click()
  await expect(creature).toHaveClass(/\bselected\b/)
  await page.getByRole('button', { name: 'Actions' }).click()
  await page.getByRole('button', { name: 'Move To' }).click()
  await page.locator('.menu-submenu').getByRole('button', { name: 'Graveyard', exact: true }).click()

  await expect.poll(() => game.sent('battle_move')).toBe(1)
  // A card left selected moves again on the next tap on a pile.
  await expect(creature).not.toHaveClass(/\bselected\b/)
})

for (const { name, viewport, isMobile } of MENU_SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    // The menu's backdrop once covered the bars, so the first click on a bar button only closed the menu.
    test('a bar button acts on the first click while the Actions menu is open', async ({ page, baseURL }) => {
      await openGame(page, baseURL!, FIGHT)
      const actions = page.getByRole('button', { name: 'Actions' })
      await actions.click()
      const roll = page.getByRole('button', { name: 'Roll a Die' })
      await expect(roll).toBeVisible()

      await page.getByRole('button', { name: 'Submit Result' }).click()

      await expect(page.locator('[data-guide-target="battle-submit-popover"]').getByRole('button', { name: 'I Won' })).toBeVisible()
      await expect(roll).toBeHidden()

      await actions.click()
      await expect(roll).toBeVisible()
      await actions.click()
      await expect(roll).toBeHidden()
    })
  })
}
