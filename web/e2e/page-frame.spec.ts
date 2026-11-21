import type { Locator, Page } from '@playwright/test'
import { PAGES, expect, openPage, swipeIntoView, test } from './helpers'

type Box = { x: number; y: number; width: number; height: number }

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

async function boxOf(locator: Locator): Promise<Box> {
  const box = await locator.boundingBox()
  expect(box, 'element has a layout box').not.toBeNull()
  return box!
}

async function isOnTopAtItsCenter(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return !!hit && element.contains(hit)
  })
}

async function nameOf(button: Locator) {
  return (await button.getAttribute('aria-label')) ?? (await button.innerText())
}

/** How far the felt's first content sits below its top edge, and its last content above its bottom edge when scrolled to the end. */
async function gapsFromFeltEdges(main: Locator) {
  return main.evaluate((node) => {
    const felt = node.firstElementChild!
    felt.scrollTop = 0
    const top = felt.firstElementChild!.getBoundingClientRect().top - felt.getBoundingClientRect().top
    felt.scrollTop = felt.scrollHeight
    const bottom = felt.getBoundingClientRect().bottom - felt.lastElementChild!.getBoundingClientRect().bottom
    return { top, bottom }
  })
}

async function expectWithinViewportWidth(page: Page, landmark: Locator, name: string) {
  const { width } = page.viewportSize()!
  const box = await boxOf(landmark)
  expect.soft(box.x, `${name} starts inside the screen`).toBeGreaterThanOrEqual(0)
  expect.soft(box.x + box.width, `${name} ends inside the screen`).toBeLessThanOrEqual(width)
}

for (const pageUnderTest of PAGES) {
  test(`${pageUnderTest.name} fits the screen and its primary action can be reached`, async ({ page, baseURL }) => {
    await openPage(page, baseURL!, pageUnderTest)
    const action = pageUnderTest.primaryAction(page)

    const banner = page.getByRole('banner')
    const main = page.getByRole('main')
    const footer = page.getByRole('contentinfo')
    const hasFooter = (await footer.count()) > 0
    const chrome = hasFooter ? [banner, footer] : [banner]

    await expectWithinViewportWidth(page, banner, 'header')
    await expectWithinViewportWidth(page, main, 'main content')
    if (hasFooter) await expectWithinViewportWidth(page, footer, 'footer')
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect.soft(scrollWidth).toBeLessThanOrEqual(page.viewportSize()!.width)

    const headerButtons = await banner.getByRole('button').all()
    for (const button of headerButtons) {
      expect.soft(await isOnTopAtItsCenter(button), `nothing covers header button "${await nameOf(button)}"`).toBe(true)
    }
    const titleParts = [banner.getByRole('heading', { name: 'Pitfight' }), banner.getByText('an MtG format').filter({ visible: true })]
    for (const part of titleParts) {
      const partBox = await boxOf(part)
      for (const button of headerButtons) {
        expect.soft(overlaps(partBox, await boxOf(button)), `header title clears "${await nameOf(button)}"`).toBe(false)
      }
    }

    if (!pageUnderTest.fillsFelt) {
      const gaps = await gapsFromFeltEdges(main)
      expect.soft(gaps.top, 'content starts 16px below the felt\'s top edge').toBeGreaterThanOrEqual(16)
      // Scroll offsets are whole pixels, so content with a fractional height can end half a pixel closer.
      expect.soft(gaps.bottom, 'content ends 16px above the felt\'s bottom edge').toBeGreaterThanOrEqual(15.5)
    }

    await swipeIntoView(action)
    await expect.soft(action).toBeInViewport({ ratio: 1 })
    expect.soft(await isOnTopAtItsCenter(action), 'nothing covers the primary action').toBe(true)
    const actionBox = await boxOf(action)
    for (const bar of chrome) {
      const insideBar = await bar.evaluate((node, target) => node.contains(target), await action.elementHandle())
      if (!insideBar) expect.soft(overlaps(actionBox, await boxOf(bar)), 'primary action stays clear of header and footer').toBe(false)
    }
  })
}
