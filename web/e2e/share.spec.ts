import type { Locator } from '@playwright/test'
import { GAME_SHELL_MOBILE_BREAKPOINT_PX } from '../src/hooks/useGameShellMode'
import { PAGES, expect, openPage, test } from './helpers'

const suddenDeath = PAGES.find((pageUnderTest) => pageUnderTest.name === 'share Sudden Death')!

async function linesOfText(element: Locator) {
  return element.evaluate((node) => {
    const range = document.createRange()
    range.selectNodeContents(node)
    return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size
  })
}

test('Prev and Next step through each Sudden Death build after the round it shares', async ({ page, baseURL }) => {
  await openPage(page, baseURL!, suddenDeath)
  const onPhone = page.viewportSize()!.width < GAME_SHELL_MOBILE_BREAKPOINT_PX
  const band = page.getByRole('main').getByText('Sudden Death', { exact: true })
  const roundChip = (label: string) => page.getByRole('button', { name: label, exact: true })
  const suddenDeathChip = (suffix: string) => roundChip(`${onPhone ? '3-3' : 'Stage 3 - Round 3'} · ${suffix}`)

  await expect(suddenDeathChip('Sudden Death 2')).toBeVisible()
  expect(await linesOfText(suddenDeathChip('Sudden Death 2')), 'the round chip keeps its label on one line').toBe(1)
  await expect(band).toBeVisible()

  await page.getByRole('button', { name: 'Prev' }).click()
  await expect(suddenDeathChip('Sudden Death')).toBeVisible()
  await expect(band).toBeVisible()

  await page.getByRole('button', { name: 'Prev' }).click()
  await expect(roundChip('Stage 3 - Round 3')).toBeVisible()
  await expect(band).toHaveCount(0)

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(suddenDeathChip('Sudden Death')).toBeVisible()
})

test('a player who did not fight in the Sudden Death is named as such', async ({ page, baseURL }) => {
  await openPage(page, baseURL!, suddenDeath)

  await page.getByRole('button', { name: 'Players' }).click()
  await page.getByRole('button', { name: /Carol/ }).click()

  await expect(page.getByText('This player did not fight in this Sudden Death.')).toBeVisible()
})
