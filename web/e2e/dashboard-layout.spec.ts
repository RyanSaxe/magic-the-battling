import type { Locator, Page } from '@playwright/test'
import { PAGES, battler, expect, openPage, test } from './helpers'

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

    test('Cubes & Decks and Recent Games line up as one grid', async ({ page, baseURL }) => {
      await openPage(page, baseURL!, dashboard)

      const libraryTitle = page.getByTestId('library-header').getByRole('heading', { name: 'Cubes & Decks' })
      const recentTitle = page.getByTestId('recent-header').getByRole('heading', { name: 'Recent Games' })
      expect(Math.abs((await baselineOf(libraryTitle)) - (await baselineOf(recentTitle)))).toBeLessThanOrEqual(1)

      const { library, recent } = await firstCards(page)
      expect(Math.abs(library.y - recent.y)).toBeLessThanOrEqual(1)
      expect(Math.abs(library.height - recent.height)).toBeLessThanOrEqual(1)
    })

    test("the phone's switch between Cubes & Decks and Recent Games is hidden", async ({ page, baseURL }) => {
      await openPage(page, baseURL!, dashboard)
      await expect(page.getByRole('radio', { name: 'Recent Games' })).toBeHidden()
    })
  })
}

test.describe('390×844 phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true })

  test('a switch shows Cubes & Decks or Recent Games, one at a time', async ({ page, baseURL }) => {
    await openPage(page, baseURL!, dashboard)
    const libraryHeader = page.getByTestId('library-header')
    const recentHeader = page.getByTestId('recent-header')

    await expect(page.getByRole('radio', { name: 'Cubes & Decks' })).toBeChecked()
    await expect(libraryHeader).toBeVisible()
    await expect(recentHeader).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Cubes & Decks' })).toBeHidden()

    await page.getByRole('radio', { name: 'Recent Games' }).click()
    await expect(recentHeader).toBeVisible()
    await expect(libraryHeader).toBeHidden()
  })
})

test.describe('1280×800 laptop with many cubes', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false })

  test('Recent Games stays in view while the cubes scroll past', async ({ page, baseURL }) => {
    const presets = Array.from({ length: 12 }, (_, i) => battler(i + 1, `cube-${i + 1}`, `Cube ${i + 1}`))
    await openPage(page, baseURL!, {
      ...dashboard,
      serve: async (p, url) => {
        await dashboard.serve(p, url)
        await p.route('**/api/battlers?*', (route) => route.fulfill({ json: { battlers: presets, has_more: false } }))
      },
    })
    const recentTitle = page.getByTestId('recent-header').getByRole('heading', { name: 'Recent Games' })
    const feltTop = (await page.getByRole('main').boundingBox())!.y

    await page.getByRole('main').evaluate((main) => {
      const felt = main.firstElementChild!
      felt.scrollTop = felt.scrollHeight
    })

    const lastCube = page.getByRole('heading', { name: 'Cube 12' })
    await expect(lastCube).toBeInViewport()
    const titleTop = (await recentTitle.boundingBox())!.y
    expect(titleTop).toBeGreaterThanOrEqual(feltTop)
    expect(titleTop).toBeLessThan(feltTop + 60)
  })
})
