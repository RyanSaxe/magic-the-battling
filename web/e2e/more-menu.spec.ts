import { battler, expect, serveSignedIn, test } from './helpers'

const PRESETS = Array.from({ length: 12 }, (_, index) => battler(index + 1, `cube-${index + 1}`, `Preset ${index + 1}`))

test.use({ viewport: { width: 390, height: 844 } })

test('the last card’s ⋯ menu opens where every item can be tapped', async ({ page, baseURL }) => {
  await serveSignedIn(page, baseURL!)
  await page.route('**/api/battlers?*', (route) => route.fulfill({ json: { battlers: PRESETS, has_more: false } }))
  await page.goto('/dashboard')
  await page.getByRole('button', { name: 'More for Preset 12' }).waitFor()

  await page.getByRole('main').evaluate((main) => {
    const felt = main.firstElementChild!
    felt.scrollTop = felt.scrollHeight
  })
  const lastCardMenu = page.getByRole('button', { name: 'More for Peasant Cube' })
  await lastCardMenu.click()

  for (const item of await page.getByRole('menuitem').all()) {
    const box = (await item.boundingBox())!
    const underCenter = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('[role="menuitem"]')?.textContent ?? null,
      { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    )
    expect(underCenter).toBe(await item.textContent())
  }
})
