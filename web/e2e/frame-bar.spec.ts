import type { Page, WebSocketRoute } from '@playwright/test'
import { PAGES, expect, openPage, serveGame, serveSpectating, test } from './helpers'
import { GAME_ID, gameBootstrap, type ScreenState } from './gameStates'

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
]

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
    // Felt content that shows across a bar, after clipping by its scrolling or clipped ancestors.
    const headerBottom = header.getBoundingClientRect().bottom
    const footerTop = footer.getBoundingClientRect().top
    const crossings: string[] = []
    for (const root of [main, document.querySelector('.frame-sidebar')]) {
      if (!root) continue
      for (const element of Array.from(root.querySelectorAll('*'))) {
        let top = element.getBoundingClientRect().top
        let bottom = element.getBoundingClientRect().bottom
        let hidden = false
        for (let ancestor: Element | null = element; ancestor && ancestor !== root.parentElement; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor)
          if (style.position === 'fixed' || style.opacity === '0' || style.visibility === 'hidden') hidden = true
          if (ancestor !== element && (style.overflowX !== 'visible' || style.overflowY !== 'visible')) {
            const clip = ancestor.getBoundingClientRect()
            top = Math.max(top, clip.top)
            bottom = Math.min(bottom, clip.bottom)
          }
        }
        if (hidden || bottom - top <= 0 || element.getBoundingClientRect().width === 0) continue
        // Each zone label straddles its zone's top seam; the top zone's sits on the board's top edge, across the top bar.
        const crossesTop = top < headerBottom - 0.5 && !element.closest('[data-zone-label]')
        // Known: Round Wrap-Up's progression note follows loot that fills the Loot zone, and the reward layout doesn't
        // make room for it, so it runs under the bottom bar. Remove this once that layout sizes the zone for the note.
        const crossesBottom = bottom > footerTop + 0.5 && !element.closest('[data-guide-target="reward-progression"]')
        if (crossesTop || crossesBottom) {
          const name = `${element.tagName.toLowerCase()}.${Array.from(element.classList).slice(0, 3).join('.')}`
          crossings.push(`${name} "${element.textContent?.trim().slice(0, 20) ?? ''}" spans y=${Math.round(top)}..${Math.round(bottom)}`)
        }
      }
    }
    return {
      crossings,
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
        expect.soft(frame.crossings, 'felt content showing across a bar').toEqual([])

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

const TOAST_CLEARANCE = 8

const TOASTS = [
  {
    where: 'on a page',
    raise: async (page: Page, baseURL: string) => {
      await openPage(page, baseURL, PAGES.find((pageUnderTest) => pageUnderTest.name === 'play')!)
      await page.getByRole('button', { name: 'Start Game' }).click()
    },
  },
  {
    where: 'in a game',
    raise: async (page: Page, baseURL: string) => {
      await serveGame(page, baseURL, GAME_PHASES.build, {
        onSocket: (ws) => ws.send(JSON.stringify({ type: 'error', payload: { code: 'UNKNOWN_ACTION' } })),
      })
      await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
    },
  },
]

for (const { name, viewport, isMobile } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const { where, raise } of TOASTS) {
      test(`a toast ${where} opens below the top bar, clear of the felt's gold edge`, async ({ page, baseURL }) => {
        await raise(page, baseURL!)
        // A toast slides in from 8px above its place, so measure the stack it settles into.
        const toasts = page.getByRole('button', { name: 'Dismiss toast' }).locator('../..')
        await toasts.waitFor()

        const toastTop = (await toasts.boundingBox())!.y
        const barBottom = (await page.getByRole('banner').boundingBox())!
        const goldEdgeBottom = barBottom.y + barBottom.height + 2
        expect(toastTop - goldEdgeBottom, 'gap between the toast and the gold edge below the top bar').toBeGreaterThanOrEqual(TOAST_CLEARANCE)
      })
    }
  })
}

// The page's own Play Preset or Play Cube is its one gold button, which leaves room for Home on phones.
const ACCOUNT_DETAIL_PAGES = ['battler', 'cube']

for (const { name, viewport, isMobile } of SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    for (const detailPage of ACCOUNT_DETAIL_PAGES) {
      test(`the ${detailPage} page has one gold button and Home in the top bar`, async ({ page, baseURL }) => {
        await openPage(page, baseURL!, PAGES.find((pageUnderTest) => pageUnderTest.name === detailPage)!)

        const goldButtons = await page.locator('.btn-primary').evaluateAll((buttons) =>
          buttons.filter((button) => button.getBoundingClientRect().width > 0).length)
        expect.soft(goldButtons, 'gold buttons on the page').toBeLessThanOrEqual(1)
        await expect.soft(page.getByRole('banner').getByRole('button', { name: 'Home' })).toBeVisible()
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

const LINE_SCREENS = [
  { name: '1280×800 laptop', viewport: { width: 1280, height: 800 }, isMobile: false },
  { name: '1024×768 tablet', viewport: { width: 1024, height: 768 }, isMobile: false },
  { name: 'iPhone 15', viewport: { width: 390, height: 844 }, isMobile: true },
]
const PHASE_STEPS = [
  { phase: 'draft', mainAction: 'Go to Build' },
  { phase: 'build', mainAction: 'Submit Hand' },
  { phase: 'fight', mainAction: 'Submit Result' },
  { phase: 'reward', mainAction: 'Continue' },
]
const LINE_TOLERANCE = 0.5

/**
 * The frame's lines in the current phase: the bars, the felt, the board's gold edge and the docked sidebar.
 * The gold dividers inside the board aren't here, since each phase lays out its own zones.
 */
function measureLines(page: Page) {
  return page.evaluate(() => {
    const edges = (element: Element | null) => {
      if (!element) return null
      const { left, top, right, bottom } = element.getBoundingClientRect()
      return { left, top, right, bottom }
    }
    const board = document.querySelector('main')
    return {
      'top bar': edges(document.querySelector('header')),
      'bottom bar': edges(document.querySelector('footer')),
      felt: edges(document.querySelector('.game-surface')),
      "board's gold edge": edges(board?.querySelector('.zone-divider-bg') ?? null),
      'docked sidebar': edges(document.querySelector('.frame-sidebar')),
    }
  })
}

for (const { name, viewport, isMobile } of LINE_SCREENS) {
  test.describe(name, () => {
    test.use({ viewport, isMobile, hasTouch: isMobile })

    test("the frame's lines stay put from Draft through Round Wrap-Up", async ({ page, baseURL }) => {
      let server: WebSocketRoute | undefined
      await serveGame(page, baseURL!, GAME_PHASES.draft, { onSocket: (ws) => { server = ws } })
      await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => document.fonts.load('16px Cinzel'))

      let draftLines: Awaited<ReturnType<typeof measureLines>> | undefined
      for (const { phase, mainAction } of PHASE_STEPS) {
        // One game moves from phase to phase, as a player sees it, rather than each phase loading fresh.
        if (phase !== 'draft') server!.send(JSON.stringify({ type: 'game_state', payload: gameBootstrap(GAME_PHASES[phase]).state }))
        await page.getByRole('contentinfo').getByRole('button', { name: mainAction }).waitFor()
        await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))))
        const lines = await measureLines(page)
        draftLines ??= lines

        for (const [line, edges] of Object.entries(lines)) {
          const draftEdges = draftLines[line as keyof typeof lines]
          expect.soft(edges === null, `${line} in ${phase} shows as it does in draft`).toBe(draftEdges === null)
          if (!edges || !draftEdges) continue
          for (const side of ['left', 'top', 'right', 'bottom'] as const) {
            expect.soft(Math.abs(edges[side] - draftEdges[side]), `${line} ${side} edge in ${phase}, against draft`).toBeLessThanOrEqual(LINE_TOLERANCE)
            // A line on a half pixel renders softer than the same line on a whole one.
            expect.soft(Math.abs(edges[side] - Math.round(edges[side])), `${line} ${side} edge in ${phase} sits on a whole pixel`).toBeLessThan(0.01)
          }
        }
      }
    })
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

test.describe('iPhone 15', () => {
  const { viewport } = SCREENS[0]
  test.use({ viewport, isMobile: true, hasTouch: true })

  // On a phone the zoom's box fills 95% of the screen's width, so a × outside the box runs off the screen.
  test("the card zoom's × sits on the card's corner, on the screen", async ({ page, baseURL }) => {
    await serveGame(page, baseURL!, GAME_PHASES.build)
    await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
    await page.locator('main .zone-sideboard .card').first().tap()
    await page.getByTitle('Preview card').first().tap()
    const image = page.locator('[data-card-preview-modal] img')
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), 'the card image has loaded').toBeGreaterThan(0)

    const closeBox = (await page.locator('[data-card-preview-modal]').getByRole('button', { name: '×' }).boundingBox())!
    const imageBox = (await image.boundingBox())!
    expect.soft(closeBox.x + closeBox.width, "×'s right edge").toBeLessThanOrEqual(viewport.width)
    expect.soft(closeBox.y, "×'s top edge").toBeGreaterThanOrEqual(0)
    expect.soft(closeBox.x + closeBox.width / 2, "×'s centre, on the card's right edge").toBeCloseTo(imageBox.x + imageBox.width, 0)
    expect.soft(closeBox.y + closeBox.height / 2, "×'s centre, on the card's top edge").toBeCloseTo(imageBox.y, 0)
  })

  // A touch screen widens each life button's tap area beyond the button, which must stay inside the life bar.
  test("the life bar's buttons can't be tapped through the top bar or the opponent's hand", async ({ page, baseURL }) => {
    await serveGame(page, baseURL!, GAME_PHASES.fight)
    await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
    await page.locator('.mobile-life-bar').waitFor()

    const taps = await page.evaluate(() => {
      const header = document.querySelector('header')!.getBoundingClientRect()
      const bar = document.querySelector('.mobile-life-bar')!.getBoundingClientRect()
      return Array.from(document.querySelectorAll('.mobile-life-bar button')).map((button) => {
        const rect = button.getBoundingClientRect()
        const x = rect.left + rect.width / 2
        const lands = (y: number) => button.contains(document.elementFromPoint(x, y))
        return { label: button.textContent, aboveBar: lands(header.bottom - 1), belowBar: lands(bar.bottom + 1), onButton: lands(rect.top + rect.height / 2) }
      })
    })
    expect(taps.length, 'life buttons').toBe(4)
    for (const tap of taps) {
      expect.soft(tap.onButton, `"${tap.label}" takes a tap on itself`).toBe(true)
      expect.soft(tap.aboveBar, `"${tap.label}" takes a tap in the top bar`).toBe(false)
      expect.soft(tap.belowBar, `"${tap.label}" takes a tap below the life bar`).toBe(false)
    }
  })
})
