import { describe, expect, it } from 'vitest'
import type { FollowedBattler, UserBattler } from '../types'
import {
  NO_FOLLOWS,
  canRemove,
  findFollow,
  followFor,
  isFollowPending,
  isFollowing,
  libraryEntries,
  loadedLibrary,
  nextLibraryPage,
  withAddedPreset,
  withDiscoverResults,
  withFollow,
  withFollowPending,
  withFollowSettled,
  withFollowingPage,
  withLibraryPage,
  withLibraryPageRequested,
  withRemovalStarted,
  withRemoved,
  withoutFollow,
  type Library,
  type LibraryEntry,
} from './dashboardState'

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

describe('follows as Discover shows them', () => {
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

  it('holds a cube pending while its follow or unfollow runs, and lets go when it lands or fails', () => {
    let follows = withFollowPending(NO_FOLLOWS, 'auto')
    expect(isFollowPending(follows, 'auto')).toBe(true)

    follows = withFollow(follows, followed(1, 'auto'))
    expect([isFollowPending(follows, 'auto'), isFollowing(follows, 'auto')]).toEqual([false, true])

    follows = withFollowSettled(withFollowPending(follows, 'auto'), 'auto')
    expect([isFollowPending(follows, 'auto'), isFollowing(follows, 'auto')]).toEqual([false, true])

    follows = withoutFollow(withFollowPending(follows, 'auto'), 'auto')
    expect([isFollowPending(follows, 'auto'), isFollowing(follows, 'auto')]).toEqual([false, false])
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

const preset = (id: number) => ({ id, cube_id: `cube-${id}` }) as UserBattler

/** Saved presets as GET /battlers pages them: newest first, so a new one goes to the front. */
function serverPresets(count: number) {
  const ids = Array.from({ length: count }, (_, i) => i + 1)
  return {
    page: (offset: number) => ({ battlers: ids.slice(offset, offset + 20).map(preset), has_more: offset + 20 < ids.length }),
    save: () => {
      const id = Math.max(0, ...ids) + 1
      ids.unshift(id)
      return preset(id)
    },
    remove: (id: number) => ids.splice(ids.indexOf(id), 1),
  }
}

const NO_FOLLOWING = { following: [], has_more: false }

function nextSavedPage(library: Library, server: ReturnType<typeof serverPresets>): Library {
  const next = nextLibraryPage(library)
  if (next?.list !== 'saved') throw new Error(`expected a saved page, not ${JSON.stringify(next)}`)
  return withLibraryPage(withLibraryPageRequested(library), { list: 'saved', page: server.page(next.offset) })
}

const savedIds = (library: Library) =>
  libraryEntries(library).flatMap((entry) => (entry.kind === 'saved' ? [entry.preset.id] : []))

describe('the dashboard library', () => {
  it('lists saved cubes and decks before followed cubes', () => {
    const library = loadedLibrary({ battlers: [preset(1), preset(2)], has_more: false }, { following: [followed(7, 'auto')], has_more: false })

    expect(libraryEntries(library).map((e) => (e.kind === 'saved' ? `saved ${e.preset.id}` : `following ${e.follow.id}`))).toEqual([
      'saved 1',
      'saved 2',
      'following 7',
    ])
  })

  it('puts a preset saved here first', () => {
    const server = serverPresets(3)
    let library = loadedLibrary(server.page(0), NO_FOLLOWING)

    library = withAddedPreset(library, server.save())

    expect(savedIds(library)).toEqual([4, 1, 2, 3])
  })

  it('shows a preset saved before every preset has loaded first, and the next page skips none', () => {
    const server = serverPresets(21)
    let library = loadedLibrary(server.page(0), NO_FOLLOWING)

    library = withAddedPreset(library, server.save())
    library = nextSavedPage(library, server)

    expect(savedIds(library)).toEqual([22, ...Array.from({ length: 21 }, (_, i) => i + 1)])
    expect(nextLibraryPage(library)).toBeNull()
  })

  it('shows each preset once when a save lands before a page it shifted', () => {
    const server = serverPresets(21)
    let library = loadedLibrary(server.page(0), NO_FOLLOWING)

    const saved = server.save()
    library = nextSavedPage(library, server)
    library = withAddedPreset(library, saved)

    expect(savedIds(library)).toEqual([22, ...Array.from({ length: 21 }, (_, i) => i + 1)])
  })

  it('keeps a preset saved while a page loads, and still waits for that page', () => {
    const server = serverPresets(21)
    let library = withLibraryPageRequested(loadedLibrary(server.page(0), NO_FOLLOWING))
    const pageReadBeforeTheSave = server.page(20)

    library = withAddedPreset(library, server.save())
    expect(nextLibraryPage(library)).toBeNull()
    library = withLibraryPage(library, { list: 'saved', page: pageReadBeforeTheSave })

    expect(savedIds(library)).toEqual([22, ...Array.from({ length: 21 }, (_, i) => i + 1)])
  })

  it('asks for the next page one earlier after a loaded preset is deleted', () => {
    const server = serverPresets(25)
    let library = loadedLibrary(server.page(0), NO_FOLLOWING)
    const fifth: LibraryEntry = { kind: 'saved', preset: preset(5) }

    library = withRemovalStarted(library, fifth)
    server.remove(5)
    library = withRemoved(library, fifth)
    library = nextSavedPage(library, server)

    expect(savedIds(library)).toEqual([1, 2, 3, 4, ...Array.from({ length: 20 }, (_, i) => i + 6)])
  })

  it('runs a page and a removal one at a time, so a page never lands on a list a removal has shifted', () => {
    const server = serverPresets(25)
    const loaded = loadedLibrary(server.page(0), NO_FOLLOWING)
    const first: LibraryEntry = { kind: 'saved', preset: preset(1) }

    expect(canRemove(withLibraryPageRequested(loaded), first)).toBe(false)
    const removing = withRemovalStarted(loaded, first)
    expect([canRemove(removing, first), nextLibraryPage(removing)]).toEqual([false, null])
    expect(nextLibraryPage(withRemoved(removing, first))).toEqual({ list: 'saved', offset: 19 })
  })
})
