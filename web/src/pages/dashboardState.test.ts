import { describe, expect, it } from 'vitest'
import type { FollowedBattler, UserBattler } from '../types'
import {
  NO_FOLLOWS,
  findFollow,
  followFor,
  isFollowing,
  libraryEntries,
  visitLoadsFirstPage,
  withDiscoverResults,
  withFollow,
  withFollowingPage,
  withoutFollow,
} from './dashboardState'

describe('visitLoadsFirstPage', () => {
  it('loads on the first visit and on a visit after a failed load', () => {
    expect(visitLoadsFirstPage('idle')).toBe(true)
    expect(visitLoadsFirstPage('failed')).toBe(true)
  })

  it('sends no second request while the first page is loading or once it has loaded', () => {
    expect(visitLoadsFirstPage('loading')).toBe(false)
    expect(visitLoadsFirstPage('loaded')).toBe(false)
  })
})

function followed(id: number, cubeId: string): FollowedBattler {
  return {
    id,
    cube_id: cubeId,
    display_name: null,
    created_at: '2026-11-21T00:00:00',
    game_count: 0,
    human_player_count: 0,
  }
}

const cubeIds = (follows: typeof NO_FOLLOWS) => follows.records.map((f) => f.cube_id)

describe('follows shared by the Following and Discover tabs', () => {
  it('lists a cube followed from Discover first in Following, where its follow can be found to unfollow', () => {
    let follows = withFollowingPage(NO_FOLLOWS, { following: [followed(1, 'old')], has_more: false }, 0)
    follows = withDiscoverResults(follows, [{ cube_id: 'new', is_following: false }])

    follows = withFollow(follows, followed(2, 'new'))

    expect(cubeIds(follows)).toEqual(['new', 'old'])
    expect(isFollowing(follows, 'new')).toBe(true)
    expect(followFor(follows, 'new')?.id).toBe(2)
  })

  it('shows a cube unfollowed in Following as not followed in Discover', () => {
    let follows = withFollowingPage(NO_FOLLOWS, { following: [followed(1, 'auto')], has_more: false }, 0)
    follows = withDiscoverResults(follows, [{ cube_id: 'auto', is_following: true }])

    follows = withoutFollow(follows, 'auto')

    expect(isFollowing(follows, 'auto')).toBe(false)
    expect(cubeIds(follows)).toEqual([])
  })

  it('keeps a cube Discover reports as followed until its Following page loads with the follow id', () => {
    let follows = withFollowingPage(NO_FOLLOWS, { following: [followed(1, 'a')], has_more: true }, 0)
    follows = withDiscoverResults(follows, [{ cube_id: 'z', is_following: true }])

    expect(isFollowing(follows, 'z')).toBe(true)
    expect(followFor(follows, 'z')).toBeUndefined()

    follows = withFollowingPage(follows, { following: [followed(9, 'z')], has_more: false }, 1)

    expect(followFor(follows, 'z')?.id).toBe(9)
    follows = withoutFollow(follows, 'z')
    expect(isFollowing(follows, 'z')).toBe(false)
  })

  it('keeps Discover follows that arrive before the first Following page', () => {
    let follows = withDiscoverResults(NO_FOLLOWS, [
      { cube_id: 'a', is_following: true },
      { cube_id: 'z', is_following: true },
    ])

    follows = withFollowingPage(follows, { following: [followed(1, 'a')], has_more: true }, 0)

    expect(cubeIds(follows)).toEqual(['a'])
    expect(isFollowing(follows, 'z')).toBe(true)
  })
})

function serverFollowing(cubeIds: string[]) {
  const all = cubeIds.map((cubeId, i) => followed(100 + i, cubeId))
  return async (offset: number) => ({ following: all.slice(offset, offset + 20), has_more: offset + 20 < all.length })
}

describe('findFollow', () => {
  const twentyOne = Array.from({ length: 21 }, (_, i) => `cube-${i}`)

  it('finds a follow on a Following page not loaded yet', async () => {
    const loadPage = serverFollowing(twentyOne)
    const follows = withFollowingPage(NO_FOLLOWS, await loadPage(0), 0)

    expect((await findFollow(follows, 'cube-20', loadPage))?.id).toBe(120)
  })

  it('finds a follow made on another device after Following loaded', async () => {
    const follows = withFollowingPage(NO_FOLLOWS, await serverFollowing(twentyOne)(0), 0)
    const loadPage = serverFollowing(['elsewhere', ...twentyOne])

    expect((await findFollow(follows, 'elsewhere', loadPage))?.id).toBe(100)
  })

  it('finds a follow when the first Following load failed', async () => {
    expect((await findFollow(NO_FOLLOWS, 'cube-3', serverFollowing(twentyOne)))?.id).toBe(103)
  })

  it('finds nothing only when no Following page has the cube', async () => {
    expect(await findFollow(NO_FOLLOWS, 'unknown', serverFollowing(twentyOne))).toBeUndefined()
  })
})

describe('libraryEntries', () => {
  it('lists saved cubes and decks before followed cubes', () => {
    const preset = (id: number) => ({ id, cube_id: `cube-${id}` }) as UserBattler
    const entries = libraryEntries([preset(1), preset(2)], [followed(7, 'auto')])

    expect(entries.map((e) => (e.kind === 'saved' ? `saved ${e.preset.id}` : `following ${e.follow.id}`))).toEqual([
      'saved 1',
      'saved 2',
      'following 7',
    ])
  })
})
