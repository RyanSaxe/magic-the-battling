import { devices, type Locator } from '@playwright/test'
import { expect, serveSignedIn, swipeIntoView, test } from './helpers'

async function isOnScreenAndOnTop(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const onScreen = rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return onScreen && !!hit && element.contains(hit)
  })
}

// Every dialog shares one component, and Settings is the tallest. A phone held sideways is the screen it outgrows.
test.use({ viewport: devices['iPhone 15 landscape'].viewport })

test("the Settings dialog's close and submit buttons can be reached", async ({ page, baseURL }) => {
  await serveSignedIn(page, baseURL!)
  await page.goto('/dashboard/list/1')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()

  const close = dialog.getByRole('button', { name: 'Close Settings' })
  expect.soft(await isOnScreenAndOnTop(close), 'close button is on screen').toBe(true)

  const submit = dialog.getByRole('button', { name: 'Save' })
  await swipeIntoView(submit)
  expect(await isOnScreenAndOnTop(submit), 'submit button can be scrolled onto the screen').toBe(true)
  expect.soft(await isOnScreenAndOnTop(close), 'close button stays on screen after scrolling').toBe(true)
})
