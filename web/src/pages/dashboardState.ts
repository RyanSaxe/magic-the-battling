import type { FollowedBattler, UserBattler } from "../types";

/** The user's follows, as Discover shows them. */
export interface Follows {
  /** Newest first, in the order GET /battlers/following pages them. */
  records: FollowedBattler[];
  hasMore: boolean;
  /** Cubes Discover reports as followed whose record is on a Following page not loaded yet. */
  unloadedCubeIds: ReadonlySet<string>;
  /** Cubes whose follow or unfollow request is running. */
  pendingCubeIds: ReadonlySet<string>;
}

export const NO_FOLLOWS: Follows = {
  records: [],
  hasMore: false,
  unloadedCubeIds: new Set(),
  pendingCubeIds: new Set(),
};

export interface FollowingPage {
  following: FollowedBattler[];
  has_more: boolean;
}

/** A page loaded at `offset` replaces any records from that offset on. */
export function withFollowingPage(
  follows: Follows,
  page: FollowingPage,
  offset: number,
): Follows {
  const pageCubeIds = new Set(page.following.map((f) => f.cube_id));
  return {
    ...follows,
    records: [...follows.records.slice(0, offset), ...page.following],
    hasMore: page.has_more,
    unloadedCubeIds: new Set(
      [...follows.unloadedCubeIds].filter((id) => !pageCubeIds.has(id)),
    ),
  };
}

export function withDiscoverResults(
  follows: Follows,
  results: { cube_id: string; is_following: boolean }[],
): Follows {
  const unloaded = results
    .filter((r) => r.is_following && !followFor(follows, r.cube_id))
    .map((r) => r.cube_id);
  return {
    ...follows,
    unloadedCubeIds: new Set([...follows.unloadedCubeIds, ...unloaded]),
  };
}

export function withFollow(follows: Follows, record: FollowedBattler): Follows {
  const rest = withoutFollow(follows, record.cube_id);
  return { ...rest, records: [record, ...rest.records] };
}

export function withoutFollow(follows: Follows, cubeId: string): Follows {
  return {
    ...withFollowSettled(follows, cubeId),
    records: follows.records.filter((f) => f.cube_id !== cubeId),
    unloadedCubeIds: new Set(
      [...follows.unloadedCubeIds].filter((id) => id !== cubeId),
    ),
  };
}

export function withFollowPending(follows: Follows, cubeId: string): Follows {
  return {
    ...follows,
    pendingCubeIds: new Set([...follows.pendingCubeIds, cubeId]),
  };
}

/** Ends a cube's follow or unfollow request, leaving the cube as it was when that request failed. */
export function withFollowSettled(follows: Follows, cubeId: string): Follows {
  return {
    ...follows,
    pendingCubeIds: new Set(
      [...follows.pendingCubeIds].filter((id) => id !== cubeId),
    ),
  };
}

export function isFollowPending(follows: Follows, cubeId: string): boolean {
  return follows.pendingCubeIds.has(cubeId);
}

export function followFor(
  follows: Follows,
  cubeId: string,
): FollowedBattler | undefined {
  return follows.records.find((f) => f.cube_id === cubeId);
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
  let record = followFor(follows, cubeId);
  // Start from the first page: a follow made on another device since this page loaded sorts ahead of the loaded records.
  let offset = 0;
  let hasMore = true;
  while (!record && hasMore) {
    const page = await loadPage(offset);
    record = page.following.find((f) => f.cube_id === cubeId);
    offset += page.following.length;
    hasMore = page.has_more;
  }
  return record;
}

export function isFollowing(follows: Follows, cubeId: string): boolean {
  return (
    follows.unloadedCubeIds.has(cubeId) ||
    followFor(follows, cubeId) !== undefined
  );
}

/** The player's saved and followed cubes, as the dashboard has loaded them. */
export interface Library {
  /** Newest first, in the order GET /battlers pages them, with presets saved here at the front. */
  presets: UserBattler[];
  presetsHaveMore: boolean;
  /** Newest first, in the order GET /battlers/following pages them. */
  follows: FollowedBattler[];
  followsHaveMore: boolean;
  loadingMore: boolean;
  /** The cards whose delete or unfollow request is running, by libraryEntryKey. */
  removing: ReadonlySet<string>;
}

export interface SavedPage {
  battlers: UserBattler[];
  has_more: boolean;
}

export function loadedLibrary(
  saved: SavedPage,
  following: FollowingPage,
): Library {
  return {
    presets: saved.battlers,
    presetsHaveMore: saved.has_more,
    follows: following.following,
    followsHaveMore: following.has_more,
    loadingMore: false,
    removing: new Set(),
  };
}

export type LibraryPageRequest =
  | { list: "saved"; offset: number }
  | { list: "following"; offset: number };

export type LibraryPage =
  | { list: "saved"; page: SavedPage }
  | { list: "following"; page: FollowingPage };

export function libraryHasMore(library: Library): boolean {
  return library.presetsHaveMore || library.followsHaveMore;
}

/**
 * The page Load more asks for next, or null when there is none or a request is running.
 * Pages and removals take turns, so a page's offset still counts the records shown when it arrives.
 */
export function nextLibraryPage(library: Library): LibraryPageRequest | null {
  if (library.loadingMore || library.removing.size > 0) return null;
  if (library.presetsHaveMore)
    return { list: "saved", offset: library.presets.length };
  if (library.followsHaveMore)
    return { list: "following", offset: library.follows.length };
  return null;
}

export function withLibraryPageRequested(library: Library): Library {
  return { ...library, loadingMore: true };
}

export function withLibraryPage(
  library: Library,
  loaded: LibraryPage,
): Library {
  if (loaded.list === "following") {
    return {
      ...library,
      follows: [...library.follows, ...loaded.page.following],
      followsHaveMore: loaded.page.has_more,
      loadingMore: false,
    };
  }
  // A preset saved while the page was loading sorts first, so the page can start with one already shown.
  const shown = new Set(library.presets.map((preset) => preset.id));
  return {
    ...library,
    presets: [
      ...library.presets,
      ...loaded.page.battlers.filter((preset) => !shown.has(preset.id)),
    ],
    presetsHaveMore: loaded.page.has_more,
    loadingMore: false,
  };
}

export function withLibraryPageFailed(library: Library): Library {
  return { ...library, loadingMore: false };
}

/** The server lists a new preset first, so it goes at the front, and the next page's offset counts it. */
export function withAddedPreset(
  library: Library,
  preset: UserBattler,
): Library {
  if (library.presets.some((shown) => shown.id === preset.id)) return library;
  return { ...library, presets: [preset, ...library.presets] };
}

export type LibraryEntry =
  | { kind: "saved"; preset: UserBattler }
  | { kind: "following"; follow: FollowedBattler };

export function libraryEntryKey(entry: LibraryEntry): string {
  return entry.kind === "saved"
    ? `saved-${entry.preset.id}`
    : `following-${entry.follow.id}`;
}

/** Saved cubes and decks first, then followed cubes, each newest first. */
export function libraryEntries(library: Library): LibraryEntry[] {
  return [
    ...library.presets.map((preset) => ({ kind: "saved" as const, preset })),
    ...library.follows.map((follow) => ({
      kind: "following" as const,
      follow,
    })),
  ];
}

export function canRemove(library: Library, entry: LibraryEntry): boolean {
  return !library.loadingMore && !library.removing.has(libraryEntryKey(entry));
}

export function withRemovalStarted(
  library: Library,
  entry: LibraryEntry,
): Library {
  return {
    ...library,
    removing: new Set([...library.removing, libraryEntryKey(entry)]),
  };
}

function removingWithout(
  library: Library,
  entry: LibraryEntry,
): ReadonlySet<string> {
  const key = libraryEntryKey(entry);
  return new Set([...library.removing].filter((removing) => removing !== key));
}

export function withRemovalFailed(
  library: Library,
  entry: LibraryEntry,
): Library {
  return { ...library, removing: removingWithout(library, entry) };
}

export function withRemoved(library: Library, entry: LibraryEntry): Library {
  const removing = removingWithout(library, entry);
  if (entry.kind === "following") {
    return {
      ...library,
      removing,
      follows: library.follows.filter(
        (follow) => follow.id !== entry.follow.id,
      ),
    };
  }
  return {
    ...library,
    removing,
    presets: library.presets.filter((preset) => preset.id !== entry.preset.id),
  };
}
