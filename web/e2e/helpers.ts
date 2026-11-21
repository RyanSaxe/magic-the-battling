import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test as base, type Locator, type Page, type Route, type WebSocketRoute } from '@playwright/test'
import type {
  AuthUser,
  FollowedBattler,
  GameSummary,
  LobbyState,
  ShareGameResponse,
  SharePlayerSnapshot,
  UserBattler,
} from '../src/types'
import { GAME_ID, PLAYER_NAME, gameBootstrap, type ScreenState } from './gameStates'

type MockResponse = { status?: number; json: unknown }

/** Set LAYOUT_CARD_ART=real to load real card images from Scryfall, for screenshots; runs stay offline otherwise. */
const SHOW_REAL_CARD_ART = process.env.LAYOUT_CARD_ART === 'real'

const isLoopback = (ipAddress: string) => ipAddress.startsWith('127.') || ipAddress === '::1' || ipAddress === '[::1]'

/** Fails a test when any response came from a server other than this machine, so the tests never depend on the network. */
export const test = base.extend<{ stayOffline: void }>({
  stayOffline: [async ({ page }, use) => {
    const outsideResponses: Promise<string | null>[] = []
    page.on('response', (response) => {
      outsideResponses.push(response.serverAddr().then((address) => (address && !isLoopback(address.ipAddress) ? response.url() : null)))
    })
    await use()
    // Real card art is fetched on purpose, for screenshots taken on a developer's machine.
    if (SHOW_REAL_CARD_ART) return
    const reachedNetwork = (await Promise.all(outsideResponses)).filter((url) => url !== null)
    expect(reachedNetwork, 'responses from servers outside this machine').toEqual([])
  }, { auto: true }],
})

export { expect }

const SERVER_STATUS: MockResponse = {
  json: {
    mode: 'normal',
    message: '',
    updated_at: '2026-01-01T00:00:00Z',
    new_games_blocked: false,
    scheduled_for_utc: null,
    estimated_recovery_minutes: null,
  },
}

const SIGNED_OUT_RESPONSES: Record<string, MockResponse> = {
  '/api/auth/me': { status: 401, json: { detail: 'Not authenticated' } },
  '/api/server/status': SERVER_STATUS,
  '/api/games/cubes/warm': { json: { status: 'ok' } },
}

const USER: AuthUser = { user_id: 'user-1', username: 'tester' }

export function battler(id: number, cubeId: string, name: string): UserBattler {
  return {
    id,
    cube_id: cubeId,
    display_name: name,
    cube_name: name,
    cube_image_uri: null,
    use_upgrades: true,
    use_vanguards: false,
    play_mode: 'limited',
    puppet_count: 3,
    target_player_count: 4,
    auto_approve_spectators: false,
    guided_mode_default: false,
    position: id,
    created_at: '2026-01-01T00:00:00Z',
    game_count: 12,
    human_player_count: 5,
    last_played: '2026-01-02T00:00:00Z',
    my_game_count: 4,
    my_win_count: 1,
    my_average_placement: 2.25,
    my_last_played: '2026-01-02T00:00:00Z',
  }
}

const BATTLERS = [battler(1, 'vintage-cube', 'Vintage Cube'), battler(2, 'pauper-cube', 'Pauper Cube'), battler(3, 'legacy-cube', 'Legacy Cube')]

const FOLLOWING: FollowedBattler[] = [
  {
    id: 7,
    cube_id: 'peasant-cube',
    display_name: 'Peasant Cube',
    cube_name: 'Peasant Cube',
    cube_image_uri: null,
    created_at: '2026-01-01T00:00:00Z',
    game_count: 4,
    human_player_count: 3,
    last_played: '2026-01-02T00:00:00Z',
  },
]

export function gameSummary(index: number): GameSummary {
  return {
    game_id: `game-${index}`,
    created_at: '2026-01-02T00:00:00Z',
    player_count: 4,
    human_count: 2,
    best_human_name: 'Alice',
    best_human_placement: index % 4 + 1,
    cube_id: 'vintage-cube',
    cube_name: 'Vintage Cube',
    cube_image_uri: null,
    play_mode: 'limited',
    use_upgrades: true,
    hand_scryfall_ids: [],
  }
}

const GAMES = { games: [1, 2, 3, 4].map(gameSummary), has_more: false, total_games: 4, total_wins: 1 }

const SIGNED_IN_RESPONSES: Record<string, MockResponse> = {
  ...SIGNED_OUT_RESPONSES,
  '/api/auth/me': { json: USER },
  '/api/battlers': { json: { battlers: BATTLERS, has_more: false } },
  '/api/battlers/following': { json: { following: FOLLOWING, has_more: false } },
  '/api/battlers/my-games': { json: GAMES },
  '/api/discover': { json: { results: [], has_more: false, total: 0 } },
  '/api/battlers/1/games': { json: GAMES },
  '/api/battlers/cube/vintage-cube/games': { json: GAMES },
  '/api/battlers/cube/vintage-cube': {
    json: {
      cube_id: 'vintage-cube',
      cube_name: 'Vintage Cube',
      cube_image_uri: null,
      game_count: 4,
      human_player_count: 5,
      last_played: '2026-01-02T00:00:00Z',
      popular_setup: { play_mode: 'limited', use_upgrades: true },
      is_following: false,
      follow_id: null,
    },
  },
}

export const LOBBY_GAME_ID = 'game-lobby'
const LOBBY_SESSION = { sessionId: 'session-1', playerId: 'player-1' }

const LOBBY_STATE: LobbyState = {
  game_id: LOBBY_GAME_ID,
  join_code: 'WXYZ',
  cube_id: 'vintage-cube',
  players: [
    { player_id: 'player-1', name: 'Alice', is_ready: false, is_host: true, is_connected: true, battler_id: null, battler_status: null, battler_error: null },
    { player_id: 'player-2', name: 'Bob', is_ready: true, is_host: false, is_connected: true, battler_id: null, battler_status: null, battler_error: null },
    { player_id: 'player-3', name: 'Carol', is_ready: true, is_host: false, is_connected: true, battler_id: null, battler_status: null, battler_error: null },
  ],
  can_start: true,
  is_started: false,
  start_status: 'open',
  start_error: null,
  target_player_count: 4,
  puppet_count: 1,
  cube_loading_status: 'ready',
  cube_loading_error: null,
  available_puppet_count: 6,
  use_upgrades: true,
  guided_mode_default: false,
  voice_chat_enabled: false,
  play_mode: 'limited',
}

function shareSnapshot(stage: number, round: number): SharePlayerSnapshot {
  return {
    stage,
    round,
    hand: [],
    sideboard: [],
    command_zone: [],
    applied_upgrades: [],
    basic_lands: ['Plains', 'Island', 'Swamp'],
    treasures: 2,
    poison: round,
    vanguard: null,
    visibility: 'full',
  }
}

export const SHARE_GAME_ID = 'game-share'
const SHARE_SNAPSHOTS = [shareSnapshot(3, 1), shareSnapshot(3, 2), shareSnapshot(3, 3)]
const SHARE_GAME: ShareGameResponse = {
  game_id: SHARE_GAME_ID,
  owner_name: 'Alice',
  created_at: '2026-01-02T00:00:00Z',
  use_upgrades: true,
  cube_id: 'vintage-cube',
  in_progress: false,
  players: ['Alice', 'Bob', 'Carol', 'Dave'].map((name, index) => ({
    name,
    final_placement: index + 1,
    final_poison: index * 3,
    final_treasures: null,
    is_puppet: index === 3,
    snapshots: SHARE_SNAPSHOTS,
  })),
}

const FONT_FIXTURES = fileURLToPath(new URL('./fixtures/fonts/', import.meta.url))

// The header's Cinzel title sets how much room its buttons have, so the tests serve the
// Google Fonts stylesheet and font files the app loads from copies in fixtures/fonts.
function serveGoogleFont(route: Route, url: URL) {
  const headers = { 'Access-Control-Allow-Origin': '*' }
  if (url.hostname === 'fonts.googleapis.com') {
    return route.fulfill({ path: `${FONT_FIXTURES}cinzel.css`, contentType: 'text/css', headers })
  }
  return route.fulfill({ path: `${FONT_FIXTURES}${basename(url.pathname)}`, contentType: 'font/woff2', headers })
}

async function serveFromTable(page: Page, baseURL: string, responses: Record<string, MockResponse>) {
  const appOrigin = new URL(baseURL).origin
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return serveGoogleFont(route, url)
    if (url.origin !== appOrigin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const response = responses[url.pathname]
    if (!response) return route.fulfill({ status: 404, json: { detail: 'Not mocked' } })
    return route.fulfill(response)
  })
}

export async function serveWithoutBackend(page: Page, baseURL: string) {
  await serveFromTable(page, baseURL, SIGNED_OUT_RESPONSES)
}

export async function serveSignedIn(page: Page, baseURL: string) {
  await serveFromTable(page, baseURL, SIGNED_IN_RESPONSES)
}

export async function serveShareGame(page: Page, baseURL: string) {
  await serveFromTable(page, baseURL, {
    ...SIGNED_OUT_RESPONSES,
    [`/api/games/${SHARE_GAME_ID}/share/Alice`]: { json: SHARE_GAME },
  })
}

// Dave went out first and shares while the others play on, so their rounds show only poison and treasures.
const SHARE_MID_GAME: ShareGameResponse = {
  ...SHARE_GAME,
  owner_name: 'Dave',
  in_progress: true,
  players: SHARE_GAME.players.map((player) => ({
    ...player,
    final_placement: player.name === 'Dave' ? 4 : null,
    snapshots: player.name === 'Dave'
      ? SHARE_SNAPSHOTS
      : SHARE_SNAPSHOTS.map((snapshot) => ({ ...snapshot, basic_lands: [], visibility: 'hidden' as const })),
  })),
}

export async function serveShareMidGame(page: Page, baseURL: string) {
  await serveFromTable(page, baseURL, {
    ...SIGNED_OUT_RESPONSES,
    [`/api/games/${SHARE_GAME_ID}/share/Dave`]: { json: SHARE_MID_GAME },
  })
}

export async function serveShareInProgress(page: Page, baseURL: string) {
  await serveFromTable(page, baseURL, {
    ...SIGNED_OUT_RESPONSES,
    [`/api/games/${SHARE_GAME_ID}/share/Bob`]: {
      status: 404,
      json: { detail: 'This game is still being played', code: 'GAME_IN_PROGRESS' },
    },
  })
}

/** The lobby's states: connected to a lobby, waiting for its first update, or holding no session. */
export type LobbyMode = 'connected' | 'loading' | 'no-session'

export async function serveLobby(page: Page, baseURL: string, mode: LobbyMode = 'connected') {
  await serveWithoutBackend(page, baseURL)
  if (mode === 'no-session') return
  await page.addInitScript((session) => {
    sessionStorage.setItem('mtb_session', session.sessionId)
    sessionStorage.setItem('mtb_player', session.playerId)
  }, LOBBY_SESSION)
  await page.routeWebSocket(/\/ws\//, (ws) => {
    if (mode === 'connected') ws.send(JSON.stringify({ type: 'lobby_state', payload: LOBBY_STATE }))
  })
}

// A plain card-shaped frame, so an offline run doesn't look like a broken image or a logo.
const CARD_PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 680">
  <rect x="6" y="6" width="476" height="668" rx="28" fill="#3b3a36" stroke="#8a7a52" stroke-width="12"/>
  <rect x="40" y="70" width="408" height="300" rx="6" fill="#55534d"/>
</svg>`

/** A player's Guided Mode progress in a game: the guides they have seen and the one left open at a step. */
export interface GuideProgress {
  seen: string[]
  active_guide?: { id: string; step: number }
}

export interface ServeGameOptions {
  /** Turns Guided Mode on with this progress. */
  guideProgress?: GuideProgress
  /** Receives the game socket, to read the client's actions and send more state. */
  onSocket?: (ws: WebSocketRoute) => void
}

/** Opens a game whose server sends `screen` as its state. */
export async function serveGame(
  page: Page,
  baseURL: string,
  screen: ScreenState,
  { guideProgress, onSocket }: ServeGameOptions = {},
) {
  await serveWithoutBackend(page, baseURL)
  await page.route(/^https:\/\/(cards|backs)\.scryfall\.io\//, (route) =>
    SHOW_REAL_CARD_ART ? route.continue() : route.fulfill({ body: CARD_PLACEHOLDER_SVG, contentType: 'image/svg+xml' }))
  await page.addInitScript(({ session, progressKey, guideProgress }) => {
    sessionStorage.setItem('mtb_session', session.sessionId)
    sessionStorage.setItem('mtb_player', session.playerId)
    if (guideProgress) {
      localStorage.setItem('mtb_guided_mode_preference', '1')
      localStorage.setItem('mtb_guided_progress', JSON.stringify({ [progressKey]: guideProgress }))
    } else {
      // Guided Mode is on for new players and opens panels over the board, so play as a returning player.
      localStorage.setItem('mtb_guided_mode_preference', '0')
    }
  }, { session: LOBBY_SESSION, progressKey: `${GAME_ID}::${PLAYER_NAME}`, guideProgress })
  await page.routeWebSocket(/\/ws\//, (ws) => {
    ws.send(JSON.stringify({ type: 'game_bootstrap', payload: gameBootstrap(screen) }))
    onSocket?.(ws)
  })
}

export interface PageUnderTest {
  name: string
  path: string
  serve: (page: Page, baseURL: string) => Promise<void>
  /** The action a visitor comes to the page for, which must be reachable on any screen. */
  primaryAction: (page: Page) => Locator
  /** The content is sized to the felt rather than scrolling in it, like the share page's board. */
  fillsFelt?: boolean
}

export const PAGES: PageUnderTest[] = [
  {
    name: 'home',
    path: '/',
    serve: serveWithoutBackend,
    primaryAction: (page) => page.getByRole('main').getByRole('link', { name: 'create an account' }),
  },
  {
    name: 'login',
    path: '/login',
    serve: serveWithoutBackend,
    primaryAction: (page) => page.getByRole('button', { name: 'Log In' }),
  },
  {
    name: 'register',
    path: '/register',
    serve: serveWithoutBackend,
    primaryAction: (page) => page.getByRole('button', { name: 'Create Account' }),
  },
  {
    name: 'play',
    path: '/play',
    serve: serveWithoutBackend,
    primaryAction: (page) => page.getByRole('button', { name: 'Start Game' }),
  },
  {
    name: 'dashboard',
    path: '/dashboard',
    serve: serveSignedIn,
    primaryAction: (page) => page.getByRole('button', { name: 'New Game' }),
  },
  {
    name: 'games',
    path: '/dashboard/games',
    serve: serveSignedIn,
    primaryAction: (page) => page.getByRole('searchbox', { name: 'Search games' }),
  },
  {
    name: 'discover',
    path: '/dashboard/discover',
    serve: serveSignedIn,
    primaryAction: (page) => page.getByRole('searchbox', { name: 'Search cubes' }),
  },
  {
    name: 'battler',
    path: '/dashboard/list/1',
    serve: serveSignedIn,
    primaryAction: (page) => page.getByRole('main').getByRole('button', { name: 'Play Preset' }),
  },
  {
    name: 'cube',
    path: '/cube/vintage-cube',
    serve: serveSignedIn,
    primaryAction: (page) => page.getByRole('main').getByRole('button', { name: 'Play Cube' }),
  },
  {
    name: 'lobby',
    path: `/game/${LOBBY_GAME_ID}/lobby`,
    serve: (page, baseURL) => serveLobby(page, baseURL),
    primaryAction: (page) => page.getByRole('button', { name: 'Start Game' }),
  },
  {
    name: 'share',
    path: `/game/${SHARE_GAME_ID}/share/Alice`,
    serve: serveShareGame,
    primaryAction: (page) => page.getByRole('button', { name: 'Prev' }),
    fillsFelt: true,
  },
  {
    name: 'share mid-game',
    path: `/game/${SHARE_GAME_ID}/share/Dave`,
    serve: serveShareMidGame,
    primaryAction: (page) => page.getByRole('button', { name: 'Prev' }),
    fillsFelt: true,
  },
  {
    name: 'share in progress',
    path: `/game/${SHARE_GAME_ID}/share/Bob`,
    serve: serveShareInProgress,
    primaryAction: (page) => page.getByRole('main').getByRole('button', { name: 'Home' }),
  },
]

/** Opens the page with its mocks and waits until its primary action, the header font and any opening motion have settled. */
export async function openPage(page: Page, baseURL: string, pageUnderTest: PageUnderTest) {
  await pageUnderTest.serve(page, baseURL)
  await page.goto(pageUnderTest.path)
  await pageUnderTest.primaryAction(page).waitFor({ state: 'attached' })
  await page.evaluate(() => document.fonts.load('16px Cinzel'))
  // Some panels slide into place as a page opens, such as the share page's player list leaving the screen.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
    .map((animation) => animation.finished.catch(() => undefined))))
}

// Playwright offers no swipe or wheel input in mobile WebKit, and scrollIntoView would also
// scroll overflow:hidden boxes that no finger can move. Scrolling only the boxes a swipe can
// scroll keeps a clipped, unscrollable panel failing the way it fails on a phone.
export async function swipeIntoView(element: Locator) {
  await element.evaluate((target) => {
    const scrollsOnSwipe = (node: Element) => ['auto', 'scroll'].includes(getComputedStyle(node).overflowY)
    for (let node = target.parentElement; node; node = node.parentElement) {
      if (!scrollsOnSwipe(node)) continue
      const offset = target.getBoundingClientRect().top - node.getBoundingClientRect().top
      node.scrollTop += offset - (node.clientHeight - target.getBoundingClientRect().height) / 2
    }
  })
}
