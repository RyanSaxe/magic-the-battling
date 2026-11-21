import { expect, test, type Locator, type Page } from '@playwright/test'
import { PAGES, openPage } from './helpers'

const dashboard = PAGES.find((pageUnderTest) => pageUnderTest.name === 'dashboard')!

const SCREENS = [
  { name: '1280×800 laptop', viewport: { width: 1280, height: 800 } },
  { name: '1920×1080 monitor', viewport: { width: 1920, height: 1080 } },
]

/** The y of a heading's text baseline: a zero-height inline box sits on it. */
async function baselineOf(heading: Locator): Promise<number> {
  return heading.evaluate((element) => {
    const probe = document.createElement('span')
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
    element.appendChild(probe)
    const y = probe.getBoundingClientRect().top
    probe.remove()
    return y
  })
}

/** The first card under each section: library cards sit left of the Recent Games header, recent games under it. */
async function firstCards(page: Page) {
  const recentLeft = (await page.getByTestId('recent-header').boundingBox())!.x
  const boxes = await page.getByTestId('dashboard-board').getByRole('article').evaluateAll((cards) =>
    cards.map((card) => {
      const { x, y, height } = card.getBoundingClientRect()
      return { x, y, height }
    }),
  )
  const byTop = (a: { y: number }, b: { y: number }) => a.y - b.y
  const library = boxes.filter((box) => box.x < recentLeft - 1).sort(byTop)
  const recent = boxes.filter((box) => box.x >= recentLeft - 1).sort(byTop)
  return { library: library[0], recent: recent[0] }
}

for (const { name, viewport } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile: false })

    test('My Cubes & Decks and Recent Games line up as one grid', async ({ page, baseURL }) => {
      await openPage(page, baseURL!, dashboard)

      const libraryTitle = page.getByTestId('library-header').getByRole('heading', { name: 'My Cubes & Decks' })
      const recentTitle = page.getByTestId('recent-header').getByRole('heading', { name: 'Recent Games' })
      expect(Math.abs((await baselineOf(libraryTitle)) - (await baselineOf(recentTitle)))).toBeLessThanOrEqual(1)

      const { library, recent } = await firstCards(page)
      expect(Math.abs(library.y - recent.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(library.height - recent.height)).toBeLessThanOrEqual(1)
    })
  })
}
