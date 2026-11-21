import type { FollowedBattler, UserBattler } from '../types'

export type FirstPageStatus = 'idle' | 'loading' | 'loaded' | 'failed'

export function visitLoadsFirstPage(status: FirstPageStatus): boolean {
  return status === 'idle' || status === 'failed'
}

/** The user's follows, shared by the Following and Discover tabs. */
export interface Follows {
  /** Newest first, in the order GET /battlers/following pages them. */
  records: FollowedBattler[]
  hasMore: boolean
  /** Cubes Discover reports as followed whose record is on a Following page not loaded yet. */
  unloadedCubeIds: ReadonlySet<string>
}

export const NO_FOLLOWS: Follows = { records: [], hasMore: false, unloadedCubeIds: new Set() }

export interface FollowingPage {
  following: FollowedBattler[]
  has_more: boolean
}

/** A page loaded at `offset` replaces any records from that offset on. */
export function withFollowingPage(follows: Follows, page: FollowingPage, offset: number): Follows {
  const pageCubeIds = new Set(page.following.map((f) => f.cube_id))
  return {
    records: [...follows.records.slice(0, offset), ...page.following],
    hasMore: page.has_more,
    unloadedCubeIds: new Set([...follows.unloadedCubeIds].filter((id) => !pageCubeIds.has(id))),
  }
}

export function withDiscoverResults(
  follows: Follows,
  results: { cube_id: string; is_following: boolean }[],
): Follows {
  const unloaded = results
    .filter((r) => r.is_following && !followFor(follows, r.cube_id))
    .map((r) => r.cube_id)
  return { ...follows, unloadedCubeIds: new Set([...follows.unloadedCubeIds, ...unloaded]) }
}

export function withFollow(follows: Follows, record: FollowedBattler): Follows {
  const rest = withoutFollow(follows, record.cube_id)
  return { ...rest, records: [record, ...rest.records] }
}

export function withoutFollow(follows: Follows, cubeId: string): Follows {
  return {
    ...follows,
    records: follows.records.filter((f) => f.cube_id !== cubeId),
    unloadedCubeIds: new Set([...follows.unloadedCubeIds].filter((id) => id !== cubeId)),
  }
}

export function followFor(follows: Follows, cubeId: string): FollowedBattler | undefined {
  return follows.records.find((f) => f.cube_id === cubeId)
}

/**
 * Finds a cube's follow record, loading Following from its first page when the record isn't loaded.
 * Returns undefined only when no Following page has the cube.
 */
export async function findFollow(
  follows: Follows,
  cubeId: string,
  loadPage: (offset: number) => Promise<FollowingPage>,
): Promise<FollowedBattler | undefined> {
  let record = followFor(follows, cubeId)
  // Start from the first page: a follow made on another device since this page loaded sorts ahead of the loaded records.
  let offset = 0
  let hasMore = true
  while (!record && hasMore) {
    const page = await loadPage(offset)
    record = page.following.find((f) => f.cube_id === cubeId)
    offset += page.following.length
    hasMore = page.has_more
  }
  return record
}

export function isFollowing(follows: Follows, cubeId: string): boolean {
  return follows.unloadedCubeIds.has(cubeId) || followFor(follows, cubeId) !== undefined
}

/** Which of the player's cubes and decks the dashboard lists. */
export type LibraryFilter = 'all' | 'saved' | 'following'

export type LibraryEntry =
  | { kind: 'saved'; preset: UserBattler }
  | { kind: 'following'; follow: FollowedBattler }

/** Saved cubes and decks first, in the player's order, then followed cubes, newest first. */
export function libraryEntries(
  presets: UserBattler[],
  follows: FollowedBattler[],
  filter: LibraryFilter,
): LibraryEntry[] {
  const saved = filter === 'following' ? [] : presets.map((preset) => ({ kind: 'saved' as const, preset }))
  const following = filter === 'saved' ? [] : follows.map((follow) => ({ kind: 'following' as const, follow }))
  return [...saved, ...following]
}
