import { PAGES, expect, gameSummary, openPage, test } from './helpers'

const discover = PAGES.find((pageUnderTest) => pageUnderTest.name === 'discover')!
const games = PAGES.find((pageUnderTest) => pageUnderTest.name === 'games')!

function cube(cubeId: string, name: string) {
  return { cube_id: cubeId, cube_name: name, cube_image_uri: null, game_count: 3, player_count: 2, last_played: null, is_following: false }
}

const CUBES = [cube('auto', 'Crucible'), cube('vintage', 'Vintage Cube'), cube('thepaupercube', 'The Pauper Cube')]

test.use({ viewport: { width: 1280, height: 800 }, isMobile: false })

const SEARCH_DELAY_MS = 300

test('Discover searches once typing stops, counts the matches and says when none match', async ({ page, baseURL }) => {
  const searches: string[] = []
  await page.clock.install()
  await openPage(page, baseURL!, {
    ...discover,
    serve: async (p, url) => {
      await discover.serve(p, url)
      await p.route('**/api/discover?*', (route) => {
        const q = new URL(route.request().url()).searchParams.get('q') ?? ''
        searches.push(q)
        const results = CUBES.filter((c) => c.cube_name.toLowerCase().includes(q.toLowerCase()))
        return route.fulfill({ json: { results, has_more: false, total: results.length } })
      })
    },
  })
  const search = discover.primaryAction(page)
  await expect(page.getByText('3 popular cubes')).toBeVisible()

  // With the clock paused, the search can only wait for typing to stop, however slowly the keys arrive.
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1000)
  await search.pressSequentially('pauper')
  await page.clock.runFor(SEARCH_DELAY_MS - 1)
  expect(searches).toEqual([''])
  await page.clock.runFor(1)
  await expect(page.getByText('1 matching cube')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Pauper Cube' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Crucible' })).toHaveCount(0)
  expect(searches).toEqual(['', 'pauper'])
  await page.clock.resume()

  await search.fill('zzz')
  await expect(page.getByText('No cubes match “zzz”.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear search' }).first().click()
  await expect(page.getByText('3 popular cubes')).toBeVisible()
})

test('Games searches the server and shows the matching count', async ({ page, baseURL }) => {
  await openPage(page, baseURL!, {
    ...games,
    serve: async (p, url) => {
      await games.serve(p, url)
      await p.route('**/api/battlers/my-games?*', (route) => {
        const q = new URL(route.request().url()).searchParams.get('q') ?? ''
        const all = [1, 2, 3, 4].map(gameSummary)
        const found = q === 'rook' ? all.slice(0, 1) : q ? [] : all
        return route.fulfill({ json: { games: found, has_more: false, total_games: found.length, total_wins: 0 } })
      })
    },
  })
  const search = games.primaryAction(page)

  await search.fill('rook')
  await expect(page.getByText('1 matching game')).toBeVisible()
  await expect(page.getByRole('article')).toHaveCount(1)

  await search.fill('nobody')
  await expect(page.getByText('No games match “nobody”.')).toBeVisible()
})
