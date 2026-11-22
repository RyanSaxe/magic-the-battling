import type { Locator } from '@playwright/test'
import { LOBBY_GAME_ID, expect, serveLobby, test } from './helpers'

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box, 'element has a layout box').not.toBeNull()
  return box!
}

test.beforeEach(async ({ page, baseURL }) => {
  await serveLobby(page, baseURL!)
  await page.goto(`/game/${LOBBY_GAME_ID}/lobby`)
})

test('the Guided and Voice toggles stay apart and inside their row', async ({ page }) => {
  const guidedInfo = page.getByLabel('What guided mode does')
  const voiceInfo = page.getByLabel('Voice chat info')
  const row = page.locator('div').filter({ has: guidedInfo }).filter({ has: voiceInfo }).last()
  const voiceLabel = row.getByText('Voice', { exact: true })

  const rowBox = await boxOf(row)
  const guidedInfoBox = await boxOf(guidedInfo)
  const voiceLabelBox = await boxOf(voiceLabel)
  const voiceInfoBox = await boxOf(voiceInfo)

  expect(voiceLabelBox.x - (guidedInfoBox.x + guidedInfoBox.width), 'space between Guided and Voice').toBeGreaterThanOrEqual(8)
  expect(voiceInfoBox.x + voiceInfoBox.width, 'Voice info icon ends inside the row').toBeLessThanOrEqual(rowBox.x + rowBox.width)
})
