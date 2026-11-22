import { PAGES, expect, gameSummary, openPage, test } from './helpers'

const HAND = [
  '33672990-4860-4aa6-ac1b-f9da66f5da59',
  '3bd78731-949c-464a-826a-92f86d784911',
  '82d5ce46-7118-4ede-ba1d-c387e7ce16e7',
  '9d914868-9000-4df2-a818-0ef8a7f636ae',
  '451c8a79-1e8a-437d-836f-31155914c551',
]
const GAME = { ...gameSummary(1), hand_scryfall_ids: HAND }

const SCREENS = [
  { page: 'cube', games: '**/api/battlers/cube/vintage-cube/games*', viewport: { width: 390, height: 844 }, isMobile: true },
  { page: 'dashboard', games: '**/api/battlers/my-games*', viewport: { width: 1280, height: 800 }, isMobile: false },
]

for (const screen of SCREENS) {
  test.describe(`the ${screen.page} page's game cards`, () => {
    test.use({ viewport: screen.viewport, isMobile: screen.isMobile })

    test('open the recap from anywhere on the card, such as its hand', async ({ page, baseURL }) => {
      const pageUnderTest = PAGES.find((candidate) => candidate.name === screen.page)!
      await openPage(page, baseURL!, {
        ...pageUnderTest,
        serve: async (p, url) => {
          await pageUnderTest.serve(p, url)
          await p.route(screen.games, (route) => route.fulfill({ json: { games: [GAME], has_more: false, total_games: 1, total_wins: 0 } }))
        },
      })
      const recentGames = page.getByRole('radio', { name: 'Recent Games' })
      if (await recentGames.isVisible()) await recentGames.click()

      const middleOfHand = page.locator(`article img[src*="${HAND[2]}"]`)
      const box = (await middleOfHand.boundingBox())!
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

      await expect(page).toHaveURL(`/game/${GAME.game_id}/share/${GAME.best_human_name}`)
    })
  })
}
