import type { Locator, Page } from '@playwright/test'
import { expect, serveWithoutBackend, test } from './helpers'

const field = (page: Page, label: string) => page.getByLabel(label, { exact: true })
const createAccount = (page: Page) => page.getByRole('button', { name: 'Create Account' })

async function expectReason(input: Locator, reason: string) {
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(input).toHaveAccessibleDescription(reason)
}

test.beforeEach(async ({ page, baseURL }) => {
  await serveWithoutBackend(page, baseURL!)
  await page.goto('/register')
})

test('a new form shows only its hints', async ({ page }) => {
  for (const label of ['Username', 'Email', 'Password', 'Confirm Password']) {
    await expect(field(page, label)).not.toHaveAttribute('aria-invalid')
  }
  await expect(field(page, 'Username')).toHaveAccessibleDescription('3-30 characters: letters, numbers, underscores')
  await expect(field(page, 'Password')).toHaveAccessibleDescription('At least 8 characters')
  await expect(createAccount(page)).toBeDisabled()
})

test('an empty username asks for one once the player moves on', async ({ page }) => {
  await field(page, 'Email').focus()
  await expectReason(field(page, 'Username'), 'Enter a username')
  await expect(createAccount(page)).toBeDisabled()
})

test('an empty email asks for one when the player skips it', async ({ page }) => {
  await field(page, 'Username').fill('kestrel')
  await field(page, 'Password').focus()
  await expectReason(field(page, 'Email'), 'Enter your email')
  await expect(createAccount(page)).toBeDisabled()
})

test('a short password says it needs 8 characters until it has them', async ({ page }) => {
  await field(page, 'Password').fill('short')
  await expectReason(field(page, 'Password'), 'At least 8 characters')
  await expect(createAccount(page)).toBeDisabled()

  await field(page, 'Password').fill('long enough')
  await expect(field(page, 'Password')).not.toHaveAttribute('aria-invalid')
})

test("a different confirm password says they don't match", async ({ page }) => {
  await field(page, 'Password').fill('password1')
  await field(page, 'Confirm Password').fill('password2')
  await expectReason(field(page, 'Confirm Password'), "Passwords don't match")
  await expect(createAccount(page)).toBeDisabled()
})

test('an empty confirm password asks for the password again once the player leaves it', async ({ page }) => {
  await field(page, 'Password').fill('password1')
  await field(page, 'Confirm Password').focus()
  await field(page, 'Confirm Password').blur()
  await expectReason(field(page, 'Confirm Password'), 'Enter your password again')
  await expect(createAccount(page)).toBeDisabled()
})

test('a filled form shows no reasons and can be sent', async ({ page }) => {
  await field(page, 'Username').fill('kestrel')
  await field(page, 'Email').fill('kestrel@example.com')
  await field(page, 'Password').fill('password1')
  await field(page, 'Confirm Password').fill('password1')
  await field(page, 'Confirm Password').blur()
  for (const label of ['Username', 'Email', 'Password', 'Confirm Password']) {
    await expect(field(page, label)).not.toHaveAttribute('aria-invalid')
  }
  await expect(createAccount(page)).toBeEnabled()
})
