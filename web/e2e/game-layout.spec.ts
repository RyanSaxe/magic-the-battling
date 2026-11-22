import type { Page } from '@playwright/test'
import { MIN_CARD_WIDTH } from '../src/hooks/cardSizeUtils'
import { expect, serveGame, test } from './helpers'
import { GAME_ID, type ScreenState } from './gameStates'

type Check = 'card-outside-zone' | 'card-below-minimum' | 'cards-differ-in-zone' | 'zones-off-board'
type Failures = Partial<Record<Check, string[]>>

interface Box {
  x: number
  y: number
  width: number
  height: number
}

const DRAFT: ScreenState = { phase: 'draft', counts: { pack: 5, sideboard: 10, upgrades: 2 } }
const ZONE_SELECTOR = '.zone-hand, .zone-battlefield, .zone-sideboard, .zone-upgrades, .zone-pack'

/** Runs in the page: finds the board, its zones and cards, and checks them against each other. */
function measureBoard({ zoneSelector, minCardWidth }: { zoneSelector: string; minCardWidth: number }): Failures {
  const failures: Failures = {}
  const fail = (check: Check, detail: string) => (failures[check] ??= []).push(detail)
  const toBox = (rect: DOMRect): Box => ({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
  const describe = (element: Element) =>
    element.id ? `#${element.id}` : `${element.tagName.toLowerCase()}.${Array.from(element.classList).slice(0, 3).join('.')}`
  const px = (value: number) => Math.round(value * 100) / 100

  const boardElement = document.querySelector('main .zone-divider-bg')!
  const contentElement = boardElement.querySelector(':scope > [class*="flex-col"]') ?? boardElement
  const style = getComputedStyle(contentElement)
  const outer = contentElement.getBoundingClientRect()
  const board: Box = {
    x: outer.x + parseFloat(style.paddingLeft),
    y: outer.y + parseFloat(style.paddingTop),
    width: outer.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    height: outer.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
  }

  const zones = Array.from(contentElement.querySelectorAll(zoneSelector)).map((zone) => toBox(zone.getBoundingClientRect()))
  const dividers = Array.from(contentElement.querySelectorAll('.zone-divider-line')).map((line) => toBox(line.getBoundingClientRect()))

  // The overlay sidebar stays in the page, moved off screen, while it is closed.
  const onScreen = (element: Element | null | undefined): element is Element => {
    const rect = element?.getBoundingClientRect()
    return !!rect && rect.width > 0 && rect.right > 0 && rect.x < innerWidth && rect.bottom > 0 && rect.y < innerHeight
  }
  const sidebar = document.querySelector('aside[data-guide-target="sidebar-panel"]')
  const chrome = [document.querySelector('header'), sidebar, document.querySelector('footer')].filter(onScreen)

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
        fail('card-outside-zone', `${describe(card.closest(zoneSelector) ?? card)} card cut off by ${describe(ancestor)} (${px(over)}px)`)
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
    if (width < minCardWidth) fail('card-below-minimum', `${describe(card.closest(zoneSelector) ?? card)} card ${width}px wide`)
    const row = card.closest(`${zoneSelector}, .flex-nowrap`)
    if (row) groups.set(row, [...(groups.get(row) ?? []), width])
  }
  for (const [row, widths] of groups) {
    if (new Set(widths).size > 1) fail('cards-differ-in-zone', `${describe(row)} has cards ${[...new Set(widths)].join(', ')}px wide`)
  }

  // Scan three columns and three rows of the board: zones, dividers and the 2px seams between zones must tile it.
  const pieces = [...zones, ...dividers].filter((box) => box.width > 0 && box.height > 0)
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

  return failures
}

/**
 * Waits until the board and its zones stop moving, as the header and sidebar settle after the first paint. The app
 * lays out again only when a frame delivers ResizeObserver, and WebKit on Linux can go seconds between frames, so
 * boxes that haven't moved count only once a frame has run.
 */
async function waitForStableLayout(page: Page) {
  const snapshot = () => page.evaluate((zoneSelector) =>
    JSON.stringify(Array.from(document.querySelectorAll(`main .zone-divider-bg, ${zoneSelector}`))
      .map((element) => element.getBoundingClientRect())
      .map((rect) => [rect.x, rect.y, rect.width, rect.height])), ZONE_SELECTOR)
  let previous = await snapshot()
  for (let stableFor = 0, samples = 0; stableFor < 3; samples++) {
    if (samples === 50) throw new Error('the board kept moving for 50 frames')
    await page.waitForTimeout(100)
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve))))
    const current = await snapshot()
    stableFor = current === previous ? stableFor + 1 : 0
    previous = current
  }
}

test.describe('a stylesheet that arrives after the game renders', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  // Unstyled, the board's height follows its content, so a layout that measures on every render keeps growing it.
  test('leaves the board laid out once it applies', async ({ page, baseURL }) => {
    await serveGame(page, baseURL!, DRAFT)
    let stylesheet = ''
    await page.route(/\/assets\/.*\.css$/, async (route) => {
      stylesheet = await (await route.fetch()).text()
      await route.fulfill({ body: '', contentType: 'text/css' })
    })
    await page.goto(`/game/${GAME_ID}/play`, { waitUntil: 'domcontentloaded' })
    const crashed = page.getByRole('heading', { name: 'Something went wrong' })
    await expect(page.locator('main .card').first().or(crashed)).toBeAttached()
    await page.waitForTimeout(500)
    await page.addStyleTag({ content: stylesheet })

    await expect(crashed).toHaveCount(0)
    await waitForStableLayout(page)
    expect(await page.evaluate(measureBoard, { zoneSelector: ZONE_SELECTOR, minCardWidth: MIN_CARD_WIDTH })).toEqual({})
  })
})
