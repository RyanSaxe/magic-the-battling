import { expect, test, type Page } from '@playwright/test'
import type { ZoneConstraints } from '../src/hooks/computeConstrainedLayout'
import { serveGame } from './helpers'
import { GAME_ID, type ScreenState } from './gameStates'

/**
 * Measures the rendered game board on each screen and reports which layout
 * checks fail. CI runs SAMPLE; `LAYOUT_SWEEP=full npm run test:e2e -- game-layout`
 * runs every phase at every viewport. A screen fails when its failing checks
 * differ from the ones listed for it, so a fix or a regression both show up.
 */

type Check =
  | 'card-outside-zone'
  | 'card-below-minimum'
  | 'cards-differ-in-zone'
  | 'zones-off-board'
  | 'sidebar-seams-off-board'
  | 'divider-off-saved-layout'
  | 'grab-moves-layout'

interface Screen {
  name: string
  viewport: { width: number; height: number }
  state: ScreenState
  saved?: ZoneConstraints
  /** Checks that fail on this screen today, each with what fails. */
  knownFailures?: Partial<Record<Check, string>>
}

const MIN_CARD_WIDTH = 40

const TYPICAL: Record<string, ScreenState> = {
  draft: { phase: 'draft', counts: { pack: 5, sideboard: 10, upgrades: 2 } },
  build: { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6 } },
  'build-with-upgrades': { phase: 'build', counts: { hand: 3, handSize: 3, sideboard: 6, upgrades: 2 } },
  battle: { phase: 'battle', counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6 } },
  'battle-sudden-death': { phase: 'battle', counts: { hand: 5, lands: 4, nonlands: 3, opponentHand: 6 }, suddenDeath: true },
  reward: { phase: 'reward', counts: { sideboard: 8 } },
  'reward-stage-end': { phase: 'reward', counts: { sideboard: 8, upgrades: 1 }, stageEnd: true },
}

const SAMPLE: Screen[] = [
  {
    name: 'build 1280x720',
    viewport: { width: 1280, height: 720 },
    state: TYPICAL.build,
    knownFailures: { 'grab-moves-layout': 'grabbing the battlefield/sideboard divider shrinks the hand from 285px to 189px' },
  },
  {
    name: 'build-with-upgrades 1280x720',
    viewport: { width: 1280, height: 720 },
    state: TYPICAL['build-with-upgrades'],
  },
  {
    name: 'build-with-upgrades 1440x900 with a saved layout',
    viewport: { width: 1440, height: 900 },
    state: TYPICAL['build-with-upgrades'],
    saved: { topFraction: 0.3, bottomLeftSplit: 0.3 },
  },
  {
    name: 'reward-stage-end 1280x800',
    viewport: { width: 1280, height: 800 },
    state: TYPICAL['reward-stage-end'],
    knownFailures: { 'grab-moves-layout': 'grabbing the top divider moves the upgrades/pool divider by 2px' },
  },
  { name: 'draft 393x852', viewport: { width: 393, height: 852 }, state: TYPICAL.draft },
  {
    name: 'reward 375x667',
    viewport: { width: 375, height: 667 },
    state: TYPICAL.reward,
  },
  { name: 'battle 1280x800', viewport: { width: 1280, height: 800 }, state: TYPICAL.battle },
  {
    name: 'battle-sudden-death 1280x800',
    viewport: { width: 1280, height: 800 },
    state: TYPICAL['battle-sudden-death'],
    knownFailures: {
      'zones-off-board': 'the banner is taller than the room the rows leave for it',
      'card-outside-zone': 'the bottom of the hand row is cut off',
      'sidebar-seams-off-board': 'the sidebar seams ignore the banner',
    },
  },
  {
    name: 'battle 1024x500',
    viewport: { width: 1024, height: 500 },
    state: TYPICAL.battle,
    knownFailures: { 'card-below-minimum': 'six rows share a 372px board' },
  },
]

// Phones in landscape are left out: the game covers the board with a prompt to turn the phone upright.
const FULL_VIEWPORTS = [
  [320, 568], [375, 667], [393, 852], [430, 932],
  [768, 1024], [820, 1180], [1024, 768], [1024, 500], [1180, 820], [1280, 600],
  [1280, 720], [1280, 800], [1366, 768], [1366, 1024], [1440, 600], [1440, 900], [1536, 864], [1920, 1080], [2560, 1440],
]

const FULL: Screen[] = FULL_VIEWPORTS.flatMap(([width, height]) =>
  Object.entries(TYPICAL).map(([phase, state]) => ({
    name: `${phase} ${width}x${height}`,
    viewport: { width, height },
    state,
  })),
)

const SCREENS = process.env.LAYOUT_SWEEP === 'full' ? FULL : SAMPLE

interface Box {
  x: number
  y: number
  width: number
  height: number
}

interface BoardMeasurement {
  board: Box
  zones: { name: string; box: Box }[]
  dividers: Box[]
  failures: Partial<Record<Check, string[]>>
}

const ZONE_SELECTOR = '.zone-hand, .zone-battlefield, .zone-sideboard, .zone-upgrades, .zone-pack'

/** Runs in the page: finds the board, its zones and cards, and checks them against each other. */
function measureBoard({ zoneSelector, minCardWidth }: { zoneSelector: string; minCardWidth: number }): BoardMeasurement {
  const failures: Partial<Record<Check, string[]>> = {}
  const fail = (check: Check, detail: string) => (failures[check] ??= []).push(detail)
  const toBox = (rect: DOMRect): Box => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  const describe = (element: Element) =>
    element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${Array.from(element.classList).slice(0, 3).join('.')}`
  const px = (value: number) => Math.round(value * 100) / 100

  const battle = document.querySelector('.battle-layout')
  const boardElement = battle ?? document.querySelector('main .zone-divider-bg')!
  const contentElement = battle ?? (boardElement.querySelector(':scope > [class*="flex-col"]') ?? boardElement)
  const style = getComputedStyle(contentElement)
  const outer = contentElement.getBoundingClientRect()
  const board: Box = {
    x: outer.x + parseFloat(style.paddingLeft),
    y: outer.y + parseFloat(style.paddingTop),
    width: outer.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    height: outer.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
  }

  const zones = battle
    ? Array.from(battle.children).map((child) => ({ name: describe(child), box: toBox(child.getBoundingClientRect()) }))
    : Array.from(contentElement.querySelectorAll(zoneSelector)).map((zone) => ({
        name: Array.from(zone.classList).find((name) => name.startsWith('zone-')) ?? describe(zone),
        box: toBox(zone.getBoundingClientRect()),
      }))
  const dividers = battle ? [] : Array.from(contentElement.querySelectorAll('.zone-divider-line')).map((line) => toBox(line.getBoundingClientRect()))

  // The overlay sidebar stays in the page, moved off screen, while it is closed.
  const onScreen = (element: Element | null | undefined): element is Element => {
    const rect = element?.getBoundingClientRect()
    return !!rect && rect.width > 0 && rect.right > 0 && rect.x < innerWidth && rect.bottom > 0 && rect.y < innerHeight
  }
  const sidebar = document.querySelector('aside[data-guide-target="sidebar-panel"]')
  const actionBar = Array.from(document.querySelectorAll('.frame-chrome')).find((element) => element.className.includes('z-40'))
  const chrome = [document.querySelector('header'), sidebar, actionBar].filter(onScreen)

  const groups = new Map<Element, number[]>()
  for (const card of Array.from(contentElement.querySelectorAll('.card'))) {
    const rect = card.getBoundingClientRect()
    if (rect.width === 0) continue
    for (let ancestor = card.parentElement; ancestor && ancestor !== boardElement.parentElement; ancestor = ancestor.parentElement) {
      const ancestorStyle = getComputedStyle(ancestor)
      if (ancestorStyle.overflowX === 'visible' && ancestorStyle.overflowY === 'visible' && ancestor !== boardElement) continue
      const box = ancestor.getBoundingClientRect()
      const over = Math.max(box.x - rect.x, box.y - rect.y, rect.right - box.right, rect.bottom - box.bottom)
      if (over > 0.5) {
        fail('card-outside-zone', `${describe(card.closest(zoneSelector + ', .battlefield, #opponent-hand, .battle-side-cell') ?? card)} card cut off by ${describe(ancestor)} (${px(over)}px)`)
        break
      }
    }
    for (const bar of chrome) {
      const box = bar.getBoundingClientRect()
      if (rect.x < box.right && box.x < rect.right && rect.y < box.bottom && box.y < rect.bottom) {
        fail('card-outside-zone', `card under ${describe(bar)}`)
      }
    }
    const width = (card as HTMLElement).offsetWidth
    if (width < minCardWidth) fail('card-below-minimum', `${describe(card.closest(zoneSelector + ', .battlefield, .hand-zone, .battle-side-cell') ?? card)} card ${width}px wide`)
    const row = card.closest(`${zoneSelector}, .flex-nowrap, .battle-side-cell`)
    if (row) groups.set(row, [...(groups.get(row) ?? []), width])
  }
  for (const [row, widths] of groups) {
    if (new Set(widths).size > 1) fail('cards-differ-in-zone', `${describe(row)} has cards ${[...new Set(widths)].join(', ')}px wide`)
  }

  // Scan three columns and three rows of the board: zones, dividers and the 2px seams between zones must tile it.
  const pieces = [...zones.map((zone) => zone.box), ...dividers].filter((box) => box.width > 0 && box.height > 0)
  const axes = [
    { name: 'y', at: (box: Box) => [box.x, box.x + box.width], span: (box: Box) => [box.y, box.y + box.height], start: board.y, length: board.height, cross: [board.x, board.width] },
    { name: 'x', at: (box: Box) => [box.y, box.y + box.height], span: (box: Box) => [box.x, box.x + box.width], start: board.x, length: board.width, cross: [board.y, board.height] },
  ]
  for (const axis of axes) {
    for (const fraction of [0.1, 0.5, 0.9]) {
      const line = axis.cross[0] + axis.cross[1] * fraction
      const spans = pieces
        .filter((box) => axis.at(box)[0] <= line && line <= axis.at(box)[1])
        .map(axis.span)
        .sort((a, b) => a[0] - b[0])
      let cursor = axis.start
      for (const [from, to] of spans) {
        const gap = from - cursor
        if (gap > (cursor === axis.start ? 0.5 : 2.5)) fail('zones-off-board', `${px(gap)}px of board uncovered at ${axis.name}=${px(cursor - axis.start)}`)
        cursor = Math.max(cursor, to)
      }
      const end = axis.start + axis.length
      if (end - cursor > 0.5) fail('zones-off-board', `${px(end - cursor)}px of board uncovered at the ${axis.name === 'y' ? 'bottom' : 'right'}`)
      if (cursor - end > 0.5) fail('zones-off-board', `zones run ${px(cursor - end)}px past the board ${axis.name === 'y' ? 'bottom' : 'right'}`)
    }
  }

  if (battle && onScreen(sidebar)) {
    const boardSeams = Array.from(battle.querySelectorAll('.battle-side-cell')).flatMap((cell) => {
      const rect = cell.getBoundingClientRect()
      return [rect.top, rect.bottom]
    })
    for (const seam of Array.from(sidebar.querySelectorAll('.zone-divider-line--horizontal'))) {
      const top = seam.getBoundingClientRect().top
      const nearest = Math.min(...boardSeams.map((y) => Math.abs(y - top)))
      if (nearest > 1) fail('sidebar-seams-off-board', `sidebar seam at y=${px(top)} is ${px(nearest)}px from the nearest board seam`)
    }
  }

  return { board, zones, dividers, failures }
}

async function openScreen(page: Page, baseURL: string, screen: Screen) {
  await serveGame(page, baseURL, screen.state)
  await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
  await restoreSavedLayout(page, screen)
}

/** Puts back the layout the screen starts from, saved or not, and reloads the game. */
async function restoreSavedLayout(page: Page, screen: Screen) {
  await page.evaluate(({ phase, saved }) => {
    const key = `mtb_zone_constraints:v2:phase:${phase}`
    if (!saved) return localStorage.removeItem(key)
    localStorage.setItem(key, JSON.stringify({
      version: 2,
      entries: [{ stage: 4, round: 2, mode: 'constraints', constraints: saved }],
    }))
  }, { phase: screen.state.phase, saved: screen.saved ?? null })
  await page.reload({ waitUntil: 'domcontentloaded' })
  // The header's Cinzel title sets the header's height, and with it the board's.
  await page.evaluate(() => document.fonts.load('16px Cinzel'))
  const crashed = page.getByRole('heading', { name: 'Something went wrong' })
  await expect(page.locator('main .card').first().or(crashed)).toBeVisible()
  if (await crashed.isVisible()) throw new Error(`the game crashed: ${await page.locator('p').first().innerText()}`)
  await waitForStableLayout(page)
}

/** Waits until the board and its zones stop moving, as the header and sidebar settle after the first paint. */
async function waitForStableLayout(page: Page) {
  const snapshot = () => page.evaluate((zoneSelector) =>
    JSON.stringify(Array.from(document.querySelectorAll(`.battle-layout, main .zone-divider-bg, ${zoneSelector}`))
      .map((element) => element.getBoundingClientRect())
      .map((rect) => [rect.x, rect.y, rect.width, rect.height])), ZONE_SELECTOR)
  let previous = await snapshot()
  for (let stableFor = 0, samples = 0; stableFor < 3; samples++) {
    if (samples === 50) throw new Error('the board kept moving for 5 seconds')
    await page.waitForTimeout(100)
    const current = await snapshot()
    stableFor = current === previous ? stableFor + 1 : 0
    previous = current
  }
}

async function measure(page: Page) {
  return page.evaluate(measureBoard, { zoneSelector: ZONE_SELECTOR, minCardWidth: MIN_CARD_WIDTH })
}

/** Each zone as `name top+height left+width`, rounded to whole pixels. */
function zoneBoxes(measurement: BoardMeasurement) {
  return measurement.zones.map((zone) => {
    const { x, y, width, height } = zone.box
    return `${zone.name} ${Math.round(y)}+${Math.round(height)} ${Math.round(x)}+${Math.round(width)}`
  })
}

/** Where each divider sits as a fraction of the room it moves in, measured the way the divider measures it on drag start. */
async function dividerFractions(page: Page) {
  return page.evaluate(() => {
    const height = (selector: string) => document.querySelector(selector)?.getBoundingClientRect().height ?? 0
    const sectionPad = 32
    const sectionGap = 2
    const top = height('main .zone-hand') || height('main .zone-pack')
    const first = height('main .zone-battlefield') || height('main .zone-upgrades')
    const second = height('main .zone-sideboard')
    return {
      topFraction: top / (top + first + sectionGap + second),
      bottomLeftSplit: (first - sectionPad) / (first + second - 2 * sectionPad),
      space: { topFraction: top + first + sectionGap + second, bottomLeftSplit: first + second - 2 * sectionPad },
    }
  })
}

/** Presses and releases each divider without moving it, each from the screen's starting layout. */
async function grabEachDivider(page: Page, screen: Screen): Promise<string[]> {
  const handles = page.locator('main .zone-divider-line > div[style*="resize"]')
  const moved: string[] = []
  for (let index = 0; index < (await handles.count()); index++) {
    if (index > 0) await restoreSavedLayout(page, screen)
    const before = zoneBoxes(await measure(page))
    const box = (await handles.nth(index).boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await waitForStableLayout(page)
    const after = zoneBoxes(await measure(page))
    const changed = after.map((zone, position) => [before[position], zone]).filter(([was, now]) => was !== now)
    if (changed.length > 0) moved.push(`divider ${index}: ${changed.map(([was, now]) => `${was} -> ${now}`).join(', ')}`)
  }
  return moved
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    const isPhone = Math.min(screen.viewport.width, screen.viewport.height) <= 430
    test.use({ viewport: screen.viewport, isMobile: isPhone, hasTouch: isPhone })

    test('lays out the board', async ({ page, baseURL }, testInfo) => {
      await openScreen(page, baseURL!, screen)
      const measurement = await measure(page)
      const failures = { ...measurement.failures }

      if (screen.saved) {
        const fractions = await dividerFractions(page)
        for (const key of ['topFraction', 'bottomLeftSplit'] as const) {
          const want = screen.saved[key]
          if (want === undefined) continue
          const offPx = Math.abs(fractions[key] - want) * fractions.space[key]
          if (offPx > 1) (failures['divider-off-saved-layout'] ??= []).push(`${key} ${want} sits ${Math.round(offPx)}px away`)
        }
      }

      await testInfo.attach('screen.png', { body: await page.screenshot(), contentType: 'image/png' })
      // Below 640px wide the phases turn their dividers off.
      if (screen.state.phase !== 'battle' && screen.viewport.width >= 640) {
        const moved = await grabEachDivider(page, screen)
        if (moved.length > 0) failures['grab-moves-layout'] = moved
      }

      await testInfo.attach('failures.json', { body: JSON.stringify(failures, null, 2), contentType: 'application/json' })
      const failing = Object.keys(failures).sort()
      const expected = Object.keys(screen.knownFailures ?? {}).sort()
      expect(failing, JSON.stringify(failures, null, 2)).toEqual(expected)
    })
  })
}
