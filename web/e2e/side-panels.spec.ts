import type { Locator, Page } from '@playwright/test'
import { PAGES, expect, openPage, serveGame, test } from './helpers'
import { GAME_ID, type ScreenState } from './gameStates'

const FIGHT: ScreenState = {
  phase: 'battle',
  counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6, sideboard: 4, graveyard: 1, exile: 2 },
}
const BUILD: ScreenState = { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6 } }

const SCREENS = [
  { name: '1280×800', viewport: { width: 1280, height: 800 }, isMobile: false, rail: 40 },
  { name: '1024×768', viewport: { width: 1024, height: 768 }, isMobile: false, rail: 40 },
  { name: '390×844', viewport: { width: 390, height: 844 }, isMobile: true, rail: 4 },
]
const BAR_HEIGHT = 42
const DOCKED_SIDEBAR_FROM = 1120
const SIDEBAR_COLUMN = 242
const SEAM = 2

interface Panel {
  name: string
  /** Wide screens dock this panel's content in the sidebar, so it has no panel there. */
  belowDockedSidebarOnly?: boolean
  open: (page: Page, baseURL: string) => Promise<Locator>
}

async function openGame(page: Page, baseURL: string, state: ScreenState) {
  await serveGame(page, baseURL, state)
  await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('contentinfo').waitFor()
}

const sidePanel = (page: Page, title: string) => page.getByRole('region', { name: title, exact: true })

const PANELS: Panel[] = [
  {
    name: 'Your Sideboard',
    open: async (page, baseURL) => {
      await openGame(page, baseURL, FIGHT)
      await page.getByRole('button', { name: 'Actions' }).click()
      await page.getByRole('button', { name: /View Your Sideboard/ }).click()
      return sidePanel(page, 'Your Sideboard')
    },
  },
  ...['Graveyard', 'Exile', 'Library'].map((zone): Panel => ({
    name: zone,
    open: async (page, baseURL) => {
      await openGame(page, baseURL, FIGHT)
      await page.locator('.battle-side-column-player .battle-side-cell').filter({ hasText: zone }).click()
      return sidePanel(page, zone)
    },
  })),
  {
    name: 'the Fight drawer',
    belowDockedSidebarOnly: true,
    open: async (page, baseURL) => {
      await openGame(page, baseURL, FIGHT)
      await page.getByRole('button', { name: '☰' }).click()
      return sidePanel(page, 'Fight')
    },
  },
  {
    name: 'the player drawer',
    belowDockedSidebarOnly: true,
    open: async (page, baseURL) => {
      await openGame(page, baseURL, BUILD)
      await page.getByRole('button', { name: '☰' }).click()
      return sidePanel(page, 'Players')
    },
  },
  {
    name: "the share page's players",
    belowDockedSidebarOnly: true,
    open: async (page, baseURL) => {
      await openPage(page, baseURL, PAGES.find((pageUnderTest) => pageUnderTest.name === 'share')!)
      await page.getByRole('button', { name: 'Players', exact: true }).click()
      return sidePanel(page, 'Players')
    },
  },
]

/** The panel's box once it has slid in, and whether the panel shows anywhere along either bar. */
async function measure(page: Page, panel: Locator) {
  await expect.poll(() => panel.evaluate((element) => getComputedStyle(element).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
  const box = (await panel.boundingBox())!
  const bars = await page.evaluate(() => {
    const panelOver = (bar: Element) => {
      const rect = bar.getBoundingClientRect()
      const points = [0.02, 0.25, 0.5, 0.75, 0.98].flatMap((x) =>
        [rect.top + 1, rect.top + rect.height / 2, rect.bottom - 1].map((y) => [rect.left + rect.width * x, y]),
      )
      return points.some(([x, y]) => !!document.elementFromPoint(x, y)?.closest('.side-panel'))
    }
    const header = document.querySelector('header')!
    const footer = document.querySelector('footer')!
    const sidebar = document.querySelector('.frame-sidebar')?.getBoundingClientRect() ?? null
    return {
      headerBottom: header.getBoundingClientRect().bottom,
      footerTop: footer.getBoundingClientRect().top,
      headerHeight: header.getBoundingClientRect().height,
      footerHeight: footer.getBoundingClientRect().height,
      panelOverHeader: panelOver(header),
      panelOverFooter: panelOver(footer),
      sidebar: sidebar && { left: sidebar.left, right: sidebar.right },
    }
  })
  return { box, ...bars }
}

for (const { name, viewport, isMobile, rail } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const panelUnderTest of PANELS) {
      test(`${panelUnderTest.name} opens between the bars and ends on the frame's gold edges`, async ({ page, baseURL }) => {
        test.skip(!!panelUnderTest.belowDockedSidebarOnly && viewport.width >= DOCKED_SIDEBAR_FROM, 'docked in the sidebar')
        const panel = await panelUnderTest.open(page, baseURL!)
        await expect(panel).toBeVisible()
        const { box, headerBottom, footerTop, headerHeight, footerHeight, panelOverHeader, panelOverFooter, sidebar } =
          await measure(page, panel)

        expect.soft([headerBottom, headerHeight], 'the top bar keeps its place and height').toEqual([BAR_HEIGHT, BAR_HEIGHT])
        expect.soft([footerTop, footerHeight], 'the bottom bar keeps its place and height').toEqual([viewport.height - BAR_HEIGHT, BAR_HEIGHT])
        expect.soft(panelOverHeader, 'the panel shows over the top bar').toBe(false)
        expect.soft(panelOverFooter, 'the panel shows over the bottom bar').toBe(false)
        expect.soft(box.y, 'top, on the gold edge under the top bar').toBe(headerBottom + SEAM)
        expect.soft(box.y + box.height, 'bottom, on the gold edge over the bottom bar').toBe(footerTop - SEAM)
        expect.soft(box.x + box.width, 'right, on the gold edge before the rail').toBe(viewport.width - rail - SEAM)
        if (viewport.width >= DOCKED_SIDEBAR_FROM) {
          expect.soft(box.x, 'left, on the docked sidebar\'s left edge').toBe(sidebar!.left)
        } else if (viewport.width >= 640) {
          expect.soft(box.width, 'the docked sidebar\'s column and its gold edge').toBe(SIDEBAR_COLUMN + SEAM)
        } else {
          expect.soft(box.x, 'left, on the gold edge after the rail').toBe(rail + SEAM)
        }
      })
    }
  })
}

test.describe('one panel at a time', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('opening a panel closes the open one, and Escape and × close it', async ({ page, baseURL }) => {
    await openGame(page, baseURL!, FIGHT)
    const yourSideboard = sidePanel(page, 'Your Sideboard')
    const graveyard = sidePanel(page, 'Graveyard')

    await page.keyboard.press('s')
    await expect(yourSideboard).toBeVisible()

    await page.locator('.battle-side-column-player .battle-side-cell').filter({ hasText: 'Graveyard' }).click()
    await expect(graveyard).toBeVisible()
    await expect(yourSideboard).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(graveyard).toHaveCount(0)

    await page.keyboard.press('s')
    await yourSideboard.getByRole('button', { name: 'Close Your Sideboard' }).click()
    await expect(yourSideboard).toHaveCount(0)
  })

  test('the zone hotkeys switch between panels and close the open one', async ({ page, baseURL }) => {
    await openGame(page, baseURL!, FIGHT)

    await page.keyboard.press('s')
    await expect(sidePanel(page, 'Your Sideboard')).toBeVisible()
    await page.keyboard.press('g')
    await expect(sidePanel(page, 'Graveyard')).toBeVisible()
    await expect(sidePanel(page, 'Your Sideboard')).toHaveCount(0)
    await page.keyboard.press('g')
    await expect(sidePanel(page, 'Graveyard')).toHaveCount(0)
  })

  test("the opponent's piles open under the opponent's name", async ({ page, baseURL }) => {
    await openGame(page, baseURL!, FIGHT)

    await page.locator('.battle-side-column-opponent .battle-side-cell').filter({ hasText: 'Library' }).click()
    await expect(sidePanel(page, "Bob's Library")).toBeVisible()
  })

  test.describe('below 1120px', () => {
    test.use({ viewport: { width: 1024, height: 768 } })

    test('the drawer closes when the Actions menu opens, and Escape closes the menu', async ({ page, baseURL }) => {
      await openGame(page, baseURL!, FIGHT)
      const drawer = sidePanel(page, 'Fight')

      await page.getByRole('button', { name: '☰' }).click()
      await expect(drawer).toBeVisible()

      await page.getByRole('button', { name: 'Actions' }).click()
      const showSideboard = page.getByRole('button', { name: /View Your Sideboard/ })
      await expect(showSideboard).toBeVisible()
      await expect(drawer).toHaveCount(0)

      await page.keyboard.press('Escape')
      await expect(showSideboard).toHaveCount(0)
    })
  })
})
