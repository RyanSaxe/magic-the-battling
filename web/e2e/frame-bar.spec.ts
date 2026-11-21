import { expect, test } from '@playwright/test'
import { PAGES, openPage } from './helpers'

const GAME_ACTION_BAR_HEIGHT = 42

const SCREENS = [
  { name: 'iPhone 15', viewport: { width: 393, height: 659 }, isMobile: true },
  { name: '1280×800 laptop', viewport: { width: 1280, height: 800 }, isMobile: false },
]

const play = PAGES.find((pageUnderTest) => pageUnderTest.name === 'play')!

for (const { name, viewport, isMobile } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile })

    // The footer's top edge is the felt's bottom seam, so a different height moves the seam when a game starts.
    test('the Play page footer is as tall as the game action bar', async ({ page, baseURL }) => {
      await openPage(page, baseURL!, play)

      const footer = await page.getByRole('contentinfo').boundingBox()
      expect(footer?.height).toBe(GAME_ACTION_BAR_HEIGHT)
    })
  })
}
