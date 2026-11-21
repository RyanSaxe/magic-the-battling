import type { Locator, Page } from '@playwright/test'
import { expect, serveSignedIn, swipeIntoView, test } from './helpers'

interface DialogUnderTest {
  name: string
  path: string
  open: (page: Page) => Promise<void>
  submit: (dialog: Locator) => Locator
}

const DIALOGS: DialogUnderTest[] = [
  {
    name: 'Add Cube / Deck',
    path: '/dashboard',
    open: (page) => page.getByRole('button', { name: '+ Add Cube / Deck' }).click(),
    submit: (dialog) => dialog.getByRole('button', { name: 'Add Cube / Deck', exact: true }),
  },
  {
    name: 'Settings',
    path: '/dashboard/list/1',
    open: (page) => page.getByRole('button', { name: 'Edit Preset' }).click(),
    submit: (dialog) => dialog.getByRole('button', { name: 'Save' }),
  },
]

async function isOnScreenAndOnTop(locator: Locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const onScreen = rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return onScreen && !!hit && element.contains(hit)
  })
}

for (const dialogUnderTest of DIALOGS) {
  test(`the ${dialogUnderTest.name} dialog's close and submit buttons can be reached`, async ({ page, baseURL }) => {
    await serveSignedIn(page, baseURL!)
    await page.goto(dialogUnderTest.path)
    await dialogUnderTest.open(page)
    const dialog = page.getByRole('dialog', { name: dialogUnderTest.name })
    await expect(dialog).toBeVisible()

    const close = dialog.getByRole('button', { name: `Close ${dialogUnderTest.name}` })
    expect.soft(await isOnScreenAndOnTop(close), 'close button is on screen').toBe(true)

    const submit = dialogUnderTest.submit(dialog)
    await swipeIntoView(submit)
    expect(await isOnScreenAndOnTop(submit), 'submit button can be scrolled onto the screen').toBe(true)
    expect.soft(await isOnScreenAndOnTop(close), 'close button stays on screen after scrolling').toBe(true)
  })
}

test('a dialog takes keyboard focus when it opens and gives it back when it closes', async ({ page, baseURL }) => {
  await serveSignedIn(page, baseURL!)
  await page.goto('/dashboard/list/1')
  const opener = page.getByRole('button', { name: 'Edit Preset' })
  await opener.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: 'Settings' })
  await expect(dialog.getByRole('textbox').first()).toBeFocused()

  await dialog.getByRole('button', { name: 'Close Settings' }).click()
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})
