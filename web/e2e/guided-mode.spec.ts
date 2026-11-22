import { expect, serveGame, test } from './helpers'
import { GAME_ID } from './gameStates'

// The closed guide stays mounted while it fades out, so the next guide can take its place.
const GUIDE_FADE_MS = 450

test.skip(({ viewport }) => viewport!.width > viewport!.height, 'A phone held sideways sees a prompt to rotate it instead of the game')

test('the board takes a tap while a closed guide fades out', async ({ page, baseURL }) => {
  // A guide shows only after its layout holds still for several animation frames, and WebKit on
  // Linux can go seconds between frames while a game first renders.
  test.slow()
  await serveGame(page, baseURL!, { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6 } }, {
    guideProgress: { seen: ['welcome'], active_guide: { id: 'build', step: 4 } },
  })
  await page.goto(`/game/${GAME_ID}/play`)

  const closeGuide = page.getByRole('button', { name: 'Ready to Build' })
  await expect(closeGuide).toBeEnabled({ timeout: 45_000 })
  const card = page.locator('[data-guide-target="build-sideboard"] .card').first()
  await card.scrollIntoViewIfNeeded()
  const box = (await card.boundingBox())!
  // A locator tap waits until nothing covers the card, so tap the card's position instead.
  const tapCard = () => page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)

  await tapCard()
  await expect(closeGuide).toBeVisible()
  await expect(card).not.toHaveClass(/\bselected\b/)

  await closeGuide.tap()
  const closedAt = Date.now()
  await tapCard()
  expect(Date.now() - closedAt).toBeLessThan(GUIDE_FADE_MS)

  await expect(card).toHaveClass(/\bselected\b/)
})

test('the host can answer a spectate request while the welcome guide is open', async ({ page, baseURL }) => {
  const sent: { action: string; payload: unknown }[] = []
  let sendToHost: (message: unknown) => void = () => {}
  await serveGame(page, baseURL!, { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6 } }, {
    guideProgress: { seen: [] },
    onSocket: (ws) => {
      sendToHost = (message) => ws.send(JSON.stringify(message))
      ws.onMessage((message) => sent.push(JSON.parse(String(message))))
    },
  })
  await page.goto(`/game/${GAME_ID}/play`)
  await page.getByRole('heading', { name: 'Playing Pitfight' }).waitFor()

  sendToHost({ type: 'spectate_requests', payload: { requests: [{ request_id: 'carol-1', spectator_name: 'Carol' }] } })
  const allow = (await page.getByRole('button', { name: 'Allow' }).boundingBox())!
  // A tap at the button's position lands on whatever is on top there.
  await page.touchscreen.tap(allow.x + allow.width / 2, allow.y + allow.height / 2)

  await expect.poll(() => sent.find((message) => message.action === 'spectate_response')?.payload)
    .toEqual({ request_id: 'carol-1', allowed: true })
})
