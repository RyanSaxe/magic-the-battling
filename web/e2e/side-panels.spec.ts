import type { Locator, Page } from '@playwright/test'
import { expect, serveGame, test } from './helpers'
import { GAME_ID, type ScreenState } from './gameStates'

const FIGHT: ScreenState = { phase: 'battle', counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6 } }
const SCREENS = [
  { name: '1280×800', viewport: { width: 1280, height: 800 }, isMobile: false, rail: 40 },
  { name: '1024×768', viewport: { width: 1024, height: 768 }, isMobile: false, rail: 40 },
  { name: '390×844', viewport: { width: 390, height: 844 }, isMobile: true, rail: 4 },
]
const BAR_HEIGHT = 42
const DOCKED_SIDEBAR_FROM = 1120
const SIDEBAR_COLUMN = 242
const SEAM = 2

/** The open panel with this title. A panel turns inert the moment it closes, and leaves once it has slid out. */
const sidePanel = (page: Page, title: string) =>
  page.getByRole('region', { name: title, exact: true }).and(page.locator(':not([inert])'))

/**
 * Ends the panel's slide, so it can be measured where it comes to rest. A slide starts and ends only on a frame, and
 * WebKit on Linux, as CI runs it, can draw a game page once in several seconds.
 */
async function settled(panel: Locator) {
  await panel.evaluate((element) => element.getAnimations().forEach((animation) => animation.finish()))
}

/** The panel's box once it has slid in, and whether the panel shows anywhere along either bar. */
async function measure(page: Page, panel: Locator) {
  await settled(panel)
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

    async function expectOnFrameEdges(page: Page, title: string) {
      const { box, headerBottom, footerTop, headerHeight, footerHeight, panelOverHeader, panelOverFooter, sidebar } =
        await measure(page, sidePanel(page, title))

      expect.soft([headerBottom, headerHeight], `${title}: the top bar keeps its place and height`).toEqual([BAR_HEIGHT, BAR_HEIGHT])
      expect.soft([footerTop, footerHeight], `${title}: the bottom bar keeps its place and height`).toEqual([viewport.height - BAR_HEIGHT, BAR_HEIGHT])
      expect.soft(panelOverHeader, `${title} shows over the top bar`).toBe(false)
      expect.soft(panelOverFooter, `${title} shows over the bottom bar`).toBe(false)
      expect.soft(box.y, `${title}: top, on the gold edge under the top bar`).toBe(headerBottom + SEAM)
      expect.soft(box.y + box.height, `${title}: bottom, on the gold edge over the bottom bar`).toBe(footerTop - SEAM)
      expect.soft(box.x + box.width, `${title}: right, on the gold edge before the rail`).toBe(viewport.width - rail - SEAM)
      if (viewport.width >= DOCKED_SIDEBAR_FROM) {
        expect.soft(box.x, `${title}: left, on the docked sidebar's left edge`).toBe(sidebar!.left)
      } else if (viewport.width >= 640) {
        expect.soft(box.width, `${title}: the docked sidebar's column and its gold edge`).toBe(SIDEBAR_COLUMN + SEAM)
      } else {
        expect.soft(box.x, `${title}: left, on the gold edge after the rail`).toBe(rail + SEAM)
      }
    }

    test("side panels open between the bars and end on the frame's gold edges", async ({ page, baseURL }) => {
      await serveGame(page, baseURL!, FIGHT)
      await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('contentinfo').waitFor()

      await page.keyboard.press('s')
      await expectOnFrameEdges(page, 'Your Sideboard')
      if (viewport.width < DOCKED_SIDEBAR_FROM) {
        await page.getByRole('button', { name: '☰' }).click()
        await expectOnFrameEdges(page, 'Fight')
      }
    })
  })
}
