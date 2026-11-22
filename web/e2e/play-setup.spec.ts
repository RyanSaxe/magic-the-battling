import { expect, serveWithoutBackend, swipeIntoView, test } from './helpers'

test.beforeEach(async ({ page, baseURL }) => {
  await serveWithoutBackend(page, baseURL!)
  await page.goto('/play')
})

test('Create Lobby can be scrolled fully into view', async ({ page }) => {
  await page.getByRole('button', { name: 'Play with Friends' }).tap()
  const createLobby = page.getByRole('button', { name: 'Create Lobby' })
  await swipeIntoView(createLobby)

  await expect(createLobby).toBeInViewport({ ratio: 1 })
})
