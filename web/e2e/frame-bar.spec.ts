import type { Page } from '@playwright/test'
import { GAME_BANNER_HEIGHT } from '../src/components/common/bannerSizes'
import { PAGES, expect, openPage, serveGame, serveSpectating, test } from './helpers'
import { GAME_ID, type ScreenState } from './gameStates'

const BAR_HEIGHT = 42
const BAR_BUTTON_HEIGHT = 30
const TOP_BAR_ROLES = ['helpers', 'home', 'primary', 'account']

const SCREENS = [
  { name: 'iPhone 15', viewport: { width: 390, height: 844 }, isMobile: true, rail: 4 },
  { name: '1280×800 laptop', viewport: { width: 1280, height: 800 }, isMobile: false, rail: 40 },
  { name: '1920×1080 desktop', viewport: { width: 1920, height: 1080 }, isMobile: false, rail: 40 },
]

const GAME_PHASES: Record<string, ScreenState> = {
  draft: { phase: 'draft', counts: { pack: 5, sideboard: 10, upgrades: 2 } },
  build: { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6 } },
  fight: { phase: 'battle', counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6 } },
  'build in Sudden Death': { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6 }, suddenDeath: true },
  'fight in Sudden Death': { phase: 'battle', counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6 }, suddenDeath: true },
  reward: { phase: 'reward', counts: { sideboard: 8 } },
  over: { phase: 'game_over', counts: { sideboard: 8 } },
  eliminated: { phase: 'eliminated', counts: { sideboard: 8 } },
}

interface Surface {
  name: string
  open: (page: Page, baseURL: string) => Promise<void>
}

const SURFACES: Surface[] = [
  ...PAGES.map((pageUnderTest) => ({
    name: pageUnderTest.name,
    open: (page: Page, baseURL: string) => openPage(page, baseURL, pageUnderTest),
  })),
  ...Object.entries(GAME_PHASES).map(([phase, state]) => ({
    name: `game ${phase}`,
    open: async (page: Page, baseURL: string) => {
      await serveGame(page, baseURL, state)
      await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
      await page.getByRole('contentinfo').waitFor()
      await page.evaluate(() => document.fonts.load('16px Cinzel'))
    },
  })),
  {
    name: 'game watching a player',
    open: async (page: Page, baseURL: string) => {
      await watchAlice(page, baseURL, GAME_PHASES.fight)
      await page.evaluate(() => document.fonts.load('16px Cinzel'))
    },
  },
]

async function watchAlice(page: Page, baseURL: string, state: ScreenState) {
  await serveSpectating('approved', state)(page, baseURL)
  await page.goto(`/game/${GAME_ID}/play?spectate=true`, { waitUntil: 'domcontentloaded' })
  // A spectator's bottom bar is inert, which hides it from the accessibility tree, so it's found by tag.
  await page.locator('footer .btn').first().waitFor()
}

/** Where the bars and the felt sit, and what each bar holds, measured in the page. */
function measureFrame(page: Page) {
  return page.evaluate(() => {
    const visible = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }
    const inner = (bar: Element) => {
      const rect = bar.getBoundingClientRect()
      const style = getComputedStyle(bar)
      return { left: rect.left + parseFloat(style.paddingLeft), right: rect.right - parseFloat(style.paddingRight) }
    }
    const header = document.querySelector('header')!
    const footer = document.querySelector('footer')!
    const main = document.querySelector('main')!
    // A docked sidebar sits inside the felt's gold edge, so the felt ends where the sidebar does.
    const felt = document.querySelector('.frame-sidebar') ?? main
    const barButtons = (bar: Element) => Array.from(bar.querySelectorAll('.btn')).filter(visible).map((button) => {
      const rect = button.getBoundingClientRect()
      return {
        label: button.textContent?.trim() ?? '',
        role: button.closest('[data-bar-role]')?.getAttribute('data-bar-role') ?? null,
        left: rect.left,
        right: rect.right,
        height: rect.height,
        primary: button.classList.contains('btn-primary'),
      }
    })
    const lastVisibleRight = (slot: Element | null) => {
      const items = slot ? Array.from(slot.children).filter(visible) : []
      return items.length ? Math.max(...items.map((element) => element.getBoundingClientRect().right)) : null
    }
    return {
      headerHeight: header.getBoundingClientRect().height,
      headerBottom: header.getBoundingClientRect().bottom,
      footerHeight: footer.getBoundingClientRect().height,
      footerTop: footer.getBoundingClientRect().top,
      feltLeft: main.getBoundingClientRect().left,
      feltRight: felt.getBoundingClientRect().right,
      headerInner: inner(header),
      topButtons: barButtons(header),
      bottomButtons: barButtons(footer),
      mainActionRight: lastVisibleRight(footer.querySelector('[data-bar-role="main"]')),
    }
  })
}

for (const { name, viewport, isMobile, rail } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const surface of SURFACES) {
      test(`${surface.name} has the shared 42px bars, with buttons placed by role`, async ({ page, baseURL }) => {
        await surface.open(page, baseURL!)
        const frame = await measureFrame(page)

        // Every page's bars and felt sit at the same edges, so nothing moves between pages and phases.
        expect.soft(frame.headerHeight, 'top bar height').toBe(BAR_HEIGHT)
        expect.soft(frame.headerBottom, 'top bar bottom edge').toBe(BAR_HEIGHT)
        expect.soft(frame.footerHeight, 'bottom bar height').toBe(BAR_HEIGHT)
        expect.soft(frame.footerTop, 'bottom bar top edge').toBe(viewport.height - BAR_HEIGHT)
        expect.soft(frame.feltLeft, 'felt left edge').toBe(rail)
        expect.soft(frame.feltRight, 'felt right edge').toBe(viewport.width - rail)

        for (const button of [...frame.topButtons, ...frame.bottomButtons]) {
          expect.soft(button.height, `"${button.label}" height`).toBe(BAR_BUTTON_HEIGHT)
        }

        const roleOrder = frame.topButtons
          .filter((button) => button.role !== null)
          .sort((a, b) => a.left - b.left)
          .map((button) => TOP_BAR_ROLES.indexOf(button.role!))
        expect.soft(roleOrder, 'top bar buttons run helpers, Home, gold button, account').toEqual([...roleOrder].sort((a, b) => a - b))
        expect.soft(frame.topButtons.filter((button) => button.primary).length, 'gold buttons in the top bar').toBeLessThanOrEqual(1)

        if (frame.topButtons.length) {
          const rightmost = Math.max(...frame.topButtons.map((button) => button.right))
          expect.soft(rightmost, 'last top bar button sits at the right edge').toBeCloseTo(frame.headerInner.right, 0)
        }
        if (frame.mainActionRight !== null) {
          expect.soft(frame.mainActionRight, 'main action sits at the right edge, under the top bar\'s last button').toBeCloseTo(frame.headerInner.right, 0)
        }
      })
    }
  })
}

const GAME_OVER_BARS = [
  { phase: 'over', left: ['Review'] },
  { phase: 'eliminated', left: ['Review', 'Spectate'] },
]

for (const { name, viewport, isMobile } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const { phase, left } of GAME_OVER_BARS) {
      test(`game ${phase} puts ${left.join(' and ')} at the left and Share Game, its one gold button, at the right`, async ({ page, baseURL }) => {
        await serveGame(page, baseURL!, GAME_PHASES[phase])
        await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
        const bar = page.getByRole('contentinfo')
        await bar.getByRole('button', { name: 'Share Game' }).waitFor()

        const labels = (role: string) => bar.locator(`[data-bar-role="${role}"] .btn`).allTextContents()
        expect.soft(await labels('secondary'), 'left of the bottom bar').toEqual(left)
        expect.soft(await labels('main'), 'right of the bottom bar').toEqual(['Share Game'])
        expect.soft(await page.locator('.btn-primary').allTextContents(), 'gold buttons on the screen').toEqual(['Share Game'])
      })
    }
  })
}

const SUBMIT_POPOVERS = [
  { state: GAME_PHASES.build, button: 'Submit Hand', popover: 'build-submit-popover', choice: 'Play' },
  { state: GAME_PHASES.fight, button: 'Submit Result', popover: 'battle-submit-popover', choice: 'I Won' },
]
const MIN_POPOVER_GAP = 6

for (const { name, viewport, isMobile } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const { state, button, popover, choice } of SUBMIT_POPOVERS) {
      // The choices open over the felt's corner, where they once sat flush with its gold edge or behind the sidebar.
      test(`the choices over ${button} stay inside the felt's gold edge, in front of the sidebar`, async ({ page, baseURL }) => {
        await serveGame(page, baseURL!, state)
        await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
        await page.getByRole('button', { name: button }).click()
        const choices = page.locator(`[data-guide-target="${popover}"]`)
        await choices.getByRole('button', { name: choice }).waitFor()

        const { popoverRight, feltInnerRight, popoverBottom, seamTop, choiceOnTop } = await page.evaluate(({ popover, choice }) => {
          const box = document.querySelector(`[data-guide-target="${popover}"]`)!.getBoundingClientRect()
          const felt = (document.querySelector('.frame-sidebar') ?? document.querySelector('main'))!.getBoundingClientRect()
          const choiceButton = Array.from(document.querySelectorAll(`[data-guide-target="${popover}"] button`))
            .find((element) => element.textContent?.trim() === choice)!
          const choiceBox = choiceButton.getBoundingClientRect()
          const topmost = document.elementFromPoint(choiceBox.left + choiceBox.width / 2, choiceBox.top + choiceBox.height / 2)
          const seamTop = document.querySelector('footer')!.getBoundingClientRect().top - 2
          return { popoverRight: box.right, feltInnerRight: felt.right - 2, popoverBottom: box.bottom, seamTop, choiceOnTop: !!topmost && choiceButton.contains(topmost) }
        }, { popover, choice })

        expect.soft(feltInnerRight - popoverRight, 'gap between the choices and the gold edge').toBeGreaterThanOrEqual(MIN_POPOVER_GAP)
        expect.soft(seamTop - popoverBottom, 'gap between the choices and the bottom seam').toBeGreaterThanOrEqual(MIN_POPOVER_GAP)
        expect.soft(choiceOnTop, `"${choice}" is in front of everything at its spot`).toBe(true)
      })
    }
  })
}

for (const { name, viewport, isMobile } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    test("a spectator sees the watched player's bottom bar but can't use it", async ({ page, baseURL }) => {
      await serveSpectating('approved')(page, baseURL!)
      await page.goto(`/game/${GAME_ID}/play?spectate=true`, { waitUntil: 'domcontentloaded' })
      // The bar is inert, which also hides it from the accessibility tree, so it's found by tag and text.
      const bar = page.locator('footer')
      const submitHand = bar.getByText('Submit Hand')
      await page.locator('main').waitFor()
      await expect(submitHand, "the watched player's Submit Hand in the bottom bar").toBeVisible()

      const barBox = (await bar.boundingBox())!
      expect.soft(barBox.height, 'bottom bar height').toBe(BAR_HEIGHT)
      expect.soft(barBox.y, 'bottom bar top edge').toBe(viewport.height - BAR_HEIGHT)

      const button = (await submitHand.boundingBox())!
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2)
      await expect(page.locator('[data-guide-target="build-submit-popover"]'), 'Play and Draw stay closed').toHaveCount(0)
    })
  })
}

const BANNERS = [
  {
    banner: 'Sudden Death in Build',
    open: (page: Page, baseURL: string) => playGame(page, baseURL, GAME_PHASES['build in Sudden Death']),
    title: 'Sudden Death',
  },
  {
    banner: 'Sudden Death in a Fight',
    open: (page: Page, baseURL: string) => playGame(page, baseURL, GAME_PHASES['fight in Sudden Death']),
    title: 'Sudden Death',
  },
  { banner: 'watching a player', open: (page: Page, baseURL: string) => watchAlice(page, baseURL, GAME_PHASES.fight), title: 'Watching Alice' },
]

async function playGame(page: Page, baseURL: string, state: ScreenState) {
  await serveGame(page, baseURL, state)
  await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
}

for (const { name, viewport, isMobile, rail } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const { banner, open, title } of BANNERS) {
      test(`the ${banner} banner spans the felt between the rails, over the board and the sidebar`, async ({ page, baseURL }) => {
        await open(page, baseURL!)
        await expect(page.locator('[data-banner]')).toContainText(title)
        const { bannerBox, boardTop, sidebarTop } = await page.evaluate(() => {
          const box = (selector: string) => {
            const rect = document.querySelector(selector)?.getBoundingClientRect()
            return rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null
          }
          return { bannerBox: box('[data-banner]')!, boardTop: box('main')!.top, sidebarTop: box('.frame-sidebar')?.top ?? null }
        })

        expect.soft(bannerBox.top, 'banner top, under the top bar').toBe(BAR_HEIGHT)
        expect.soft(bannerBox.left, 'banner left edge, at the left rail').toBe(rail)
        expect.soft(bannerBox.right, 'banner right edge, at the right rail').toBe(viewport.width - rail)
        expect.soft(bannerBox.bottom - bannerBox.top, 'banner height').toBe(GAME_BANNER_HEIGHT)
        expect.soft(boardTop, "board's top edge, under the banner").toBe(bannerBox.bottom)
        if (sidebarTop !== null) expect.soft(sidebarTop, "docked sidebar's top edge, under the banner").toBe(bannerBox.bottom)
      })
    }
  })
}
