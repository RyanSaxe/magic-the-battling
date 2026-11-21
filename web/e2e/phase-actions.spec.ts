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
