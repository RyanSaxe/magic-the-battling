import type { Page } from '@playwright/test'
import type { UserBattler } from '../src/types'
import { battler, expect, serveSignedIn, test } from './helpers'

const PAGE_SIZE = 20

function presetsNamed(count: number): UserBattler[] {
  return Array.from({ length: count }, (_, index) => battler(index + 1, `cube-${index + 1}`, `Preset ${index + 1}`))
}

interface Holds {
  /** Answers a save only once this settles, after the preset is already listed, as a slow save does. */
  save?: Promise<void>
  /** Answers Load more only once this settles, with the page as it was when asked for. */
  morePage?: Promise<void>
}

/** Serves the player's saved presets from a list, paged as the server pages them, with a new one saved last. */
async function servePresets(page: Page, presets: UserBattler[], holds: Holds = {}) {
  await page.route(
    (url) => url.pathname === '/api/battlers',
    async (route) => {
      const request = route.request()
      if (request.method() === 'POST') {
        const body = request.postDataJSON()
        const preset = battler(presets.length + 1, body.cube_id, body.display_name)
        presets.push(preset)
        await holds.save
        return route.fulfill({ json: preset })
      }
      const offset = Number(new URL(request.url()).searchParams.get('offset') ?? 0)
      const json = { battlers: presets.slice(offset, offset + PAGE_SIZE), has_more: offset + PAGE_SIZE < presets.length }
      if (offset > 0) await holds.morePage
      return route.fulfill({ json })
    },
  )
}

async function addPreset(page: Page, cubeId: string, name: string) {
  await page.getByRole('button', { name: '+ Add Cube / Deck' }).click()
  await page.getByPlaceholder('e.g. auto').fill(cubeId)
  await page.getByPlaceholder('My Draft Cube').fill(name)
  await page.getByRole('button', { name: 'Add Cube / Deck', exact: true }).click()
}

async function presetTitles(page: Page) {
  const titles = await page.getByRole('heading', { level: 3, name: /^Preset \d+$/ }).allTextContents()
  return titles.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

const PRESETS_1_TO_22 = presetsNamed(22).map((preset) => preset.display_name)

/** A response the test sends only when it chooses, to look at the page while a request runs. */
function heldResponse() {
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  return { release, released }
}

test('a saved preset past the first page of the list opens', async ({ page, baseURL }) => {
  const presets = presetsNamed(21)
  await serveSignedIn(page, baseURL!)
  await servePresets(page, presets)
  await page.route('**/api/battlers/21', (route) => route.fulfill({ json: presets[20] }))

  await page.goto('/dashboard/list/21')

  await expect(page.getByRole('heading', { name: 'Preset 21' })).toBeVisible()
})

test('a saved preset that is missing or another player’s sends the player back to the dashboard', async ({ page, baseURL }) => {
  await serveSignedIn(page, baseURL!)
  await page.route('**/api/battlers/99', (route) =>
    route.fulfill({ status: 404, json: { detail: 'Battler not found', code: 'BATTLER_NOT_FOUND' } }),
  )

  await page.goto('/dashboard/list/99')

  await expect(page).toHaveURL(/\/dashboard$/)
})

test('a saved preset that fails to load says so, and Retry loads it', async ({ page, baseURL }) => {
  let failing = true
  await serveSignedIn(page, baseURL!)
  await page.route('**/api/battlers/1', (route) =>
    failing
      ? route.fulfill({ status: 500, json: { detail: 'Internal Server Error' } })
      : route.fulfill({ json: battler(1, 'vintage-cube', 'Vintage Cube') }),
  )

  await page.goto('/dashboard/list/1')
  await expect(page.getByText("This preset didn't load.")).toBeVisible()
  failing = false
  await page.getByRole('button', { name: 'Retry' }).click()

  await expect(page.getByRole('heading', { name: 'Vintage Cube' })).toBeVisible()
})

test('a cube whose details fail to load says so, and Retry loads them', async ({ page, baseURL }) => {
  let failing = true
  await serveSignedIn(page, baseURL!)
  await page.route('**/api/battlers/cube/vintage-cube', async (route) =>
    failing ? route.fulfill({ status: 500, json: { detail: 'Internal Server Error' } }) : route.fallback(),
  )

  await page.goto('/cube/vintage-cube')
  await expect(page.getByText("This cube's details didn't load.")).toBeVisible()
  failing = false
  await page.getByRole('button', { name: 'Retry' }).click()

  await expect(page.getByRole('button', { name: '+ Follow' })).toBeVisible()
  await expect(page.getByText("This cube's details didn't load.")).toBeHidden()
})

test.describe('on a phone held upright', () => {
  // The Add Cube / Deck dialog can't scroll, so on a landscape phone its submit button is off screen.
  test.use({ viewport: { width: 390, height: 844 } })

  test('a preset added before every preset has loaded shows once, and Load more skips none', async ({ page, baseURL }) => {
    await serveSignedIn(page, baseURL!)
    await servePresets(page, presetsNamed(21))
    await page.goto('/dashboard')

    await addPreset(page, 'cube-22', 'Preset 22')
    await expect(page.getByRole('link', { name: 'Preset 22', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden()

    expect(await presetTitles(page)).toEqual(PRESETS_1_TO_22)
  })

  test('a page that lands after a preset is added keeps the new preset', async ({ page, baseURL }) => {
    const morePage = heldResponse()
    await serveSignedIn(page, baseURL!)
    await servePresets(page, presetsNamed(21), { morePage: morePage.released })
    await page.goto('/dashboard')

    await page.getByRole('button', { name: 'Load more' }).click()
    await addPreset(page, 'cube-22', 'Preset 22')
    await expect(page.getByRole('link', { name: 'Preset 22', exact: true })).toBeVisible()
    morePage.release()
    await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden()

    expect(await presetTitles(page)).toEqual(PRESETS_1_TO_22)
  })

  test('a preset whose page lands before its slow save returns shows once', async ({ page, baseURL }) => {
    const save = heldResponse()
    await serveSignedIn(page, baseURL!)
    await servePresets(page, presetsNamed(21), { save: save.released })
    await page.goto('/dashboard')

    await addPreset(page, 'cube-22', 'Preset 22')
    await page.getByRole('button', { name: '✕' }).click()
    await page.getByRole('button', { name: 'Load more' }).click()
    await expect(page.getByRole('button', { name: 'Load more' })).toBeHidden()
    const saved = page.waitForResponse((response) => response.request().method() === 'POST')
    save.release()
    await saved
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))

    expect(await presetTitles(page)).toEqual(PRESETS_1_TO_22)
  })
})

test('Follow in Discover can’t be chosen again while its request runs', async ({ page, baseURL }) => {
  const follow = heldResponse()
  await serveSignedIn(page, baseURL!)
  await page.route('**/api/discover?*', (route) =>
    route.fulfill({
      json: {
        results: [{ cube_id: 'pauper-cube', cube_name: 'Pauper Cube', cube_image_uri: null, game_count: 3, player_count: 2, last_played: null, is_following: false }],
        has_more: false,
        total: 1,
      },
    }),
  )
  await page.route('**/api/battlers/follow', async (route) => {
    await follow.released
    await route.fulfill({
      json: { id: 9, cube_id: 'pauper-cube', display_name: null, cube_name: 'Pauper Cube', cube_image_uri: null, created_at: '2026-01-01T00:00:00Z' },
    })
  })
  await page.goto('/dashboard/discover')

  const menu = page.getByRole('button', { name: 'More for Pauper Cube' })
  await menu.click()
  await page.getByRole('menuitem', { name: 'Follow' }).click()
  await menu.click()
  await expect(page.getByRole('menuitem', { name: 'Follow' })).toBeDisabled()

  follow.release()
  await expect(page.getByRole('menuitem', { name: 'Unfollow' })).toBeEnabled()
})

test('Unfollow on the dashboard can’t be chosen again while its request runs', async ({ page, baseURL }) => {
  const unfollow = heldResponse()
  await serveSignedIn(page, baseURL!)
  await page.route('**/api/battlers/follow/7', async (route) => {
    await unfollow.released
    await route.fulfill({ json: { ok: true } })
  })
  await page.goto('/dashboard')

  const menu = page.getByRole('button', { name: 'More for Peasant Cube' })
  await menu.click()
  await page.getByRole('menuitem', { name: 'Unfollow' }).click()
  await menu.click()
  await expect(page.getByRole('menuitem', { name: 'Unfollow' })).toBeDisabled()

  unfollow.release()
  await expect(menu).toBeHidden()
})
